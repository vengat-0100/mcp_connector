import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { type ConnectorConfig, readConfig } from "./config";

export interface StoredTokens {
	accessToken: string;
	idToken: string;
	refreshToken: string;
	accessTokenExpiresAt: number;
	idTokenExpiresAt: number;
	tokenType: string;
	scope: string;
	userInfo?: {
		sub: string;
		email?: string;
		name?: string;
		roles?: string[];
	};
}

interface PkceState {
	codeVerifier: string;
	oauthReqInfo: AuthRequest;
}

// --- PKCE helpers ---

function generateCodeVerifier(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return btoa(String.fromCharCode(...array))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
	const data = new TextEncoder().encode(verifier);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return btoa(String.fromCharCode(...new Uint8Array(digest)))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
}

// --- URL builder ---

export function buildAuthorizeUrl(
	config: ConnectorConfig,
	redirectUri: string,
	state: string,
	codeChallenge: string,
): string {
	const url = new URL(config.authorizeUrl);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", config.clientId);
	url.searchParams.set("redirect_uri", redirectUri);
	url.searchParams.set("scope", config.scopes);
	url.searchParams.set("state", state);
	url.searchParams.set("code_challenge", codeChallenge);
	url.searchParams.set("code_challenge_method", "S256");
	return url.toString();
}

// --- Token exchange ---

export async function exchangeCodeForTokens(
	config: ConnectorConfig,
	code: string,
	redirectUri: string,
	codeVerifier: string,
): Promise<StoredTokens> {
	const params = new URLSearchParams({
		grant_type: "authorization_code",
		client_id: config.clientId,
		client_secret: config.clientSecret,
		code,
		redirect_uri: redirectUri,
		code_verifier: codeVerifier,
	});

	const resp = await fetch(config.tokenUrl, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
		body: params.toString(),
	});

	if (!resp.ok) {
		const body = await resp.text();
		throw new Error(`Token exchange failed: ${resp.status} ${body}`);
	}

	const data = (await resp.json()) as {
		access_token: string;
		id_token?: string;
		refresh_token?: string;
		expires_in?: number;
		token_type?: string;
		scope?: string;
	};

	const now = Date.now();
	const expiresMs = (data.expires_in ?? 3600) * 1000;

	let userInfo: StoredTokens["userInfo"];
	try {
		const uiResp = await fetch(config.userinfoUrl, {
			headers: { Authorization: `Bearer ${data.access_token}` },
		});
		if (uiResp.ok) {
			const ui = (await uiResp.json()) as {
				sub: string;
				email?: string;
				name?: string;
				roles?: string[];
			};
			userInfo = { sub: ui.sub, email: ui.email, name: ui.name, roles: ui.roles };
		}
	} catch {
		// userinfo optional
	}

	return {
		accessToken: data.access_token,
		idToken: data.id_token ?? "",
		refreshToken: data.refresh_token ?? "",
		accessTokenExpiresAt: now + expiresMs,
		idTokenExpiresAt: now + expiresMs,
		tokenType: data.token_type ?? "Bearer",
		scope: data.scope ?? config.scopes,
		userInfo,
	};
}

// --- Token refresh ---

export async function refreshTokens(
	config: ConnectorConfig,
	stored: StoredTokens,
): Promise<StoredTokens> {
	if (!stored.refreshToken) {
		throw new Error("SESSION_EXPIRED");
	}

	const params = new URLSearchParams({
		grant_type: "refresh_token",
		refresh_token: stored.refreshToken,
		client_id: config.clientId,
		client_secret: config.clientSecret,
	});

	const resp = await fetch(config.tokenUrl, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
		body: params.toString(),
	});

	if (!resp.ok) {
		throw new Error("SESSION_EXPIRED");
	}

	const data = (await resp.json()) as {
		access_token: string;
		id_token?: string;
		refresh_token?: string;
		expires_in?: number;
		token_type?: string;
		scope?: string;
	};

	const now = Date.now();
	const expiresMs = (data.expires_in ?? 3600) * 1000;

	return {
		...stored,
		accessToken: data.access_token,
		idToken: data.id_token ?? stored.idToken,
		// Rotate refresh token if IDP issues a new one
		refreshToken: data.refresh_token ?? stored.refreshToken,
		accessTokenExpiresAt: now + expiresMs,
		idTokenExpiresAt: data.id_token ? now + expiresMs : stored.idTokenExpiresAt,
		tokenType: data.token_type ?? stored.tokenType,
		scope: data.scope ?? stored.scope,
	};
}

// --- Expiry checks (60s buffer for network races) ---

export function isAccessTokenExpired(tokens: StoredTokens): boolean {
	return tokens.accessTokenExpiresAt - 60_000 < Date.now();
}

export function isIdTokenExpired(tokens: StoredTokens): boolean {
	return tokens.idTokenExpiresAt - 60_000 < Date.now();
}

// --- Get valid tokens (auto-refresh) ---

export async function getValidTokens(
	kv: KVNamespace,
	sessionId: string,
	config: ConnectorConfig,
): Promise<StoredTokens> {
	const raw = await kv.get(`oidc:session:${sessionId}`);
	if (!raw) throw new Error("SESSION_EXPIRED");

	let tokens: StoredTokens;
	try {
		tokens = JSON.parse(raw) as StoredTokens;
	} catch {
		throw new Error("SESSION_EXPIRED");
	}

	if (isAccessTokenExpired(tokens)) {
		tokens = await refreshTokens(config, tokens);
		await kv.put(`oidc:session:${sessionId}`, JSON.stringify(tokens), {
			expirationTtl: 86400 * 30,
		});
	}

	return tokens;
}

// --- Hono route handlers ---

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

app.get("/authorize", async (c) => {
	try {
		const config = await readConfig(c.env.OAUTH_KV);

		if (!config.authorizeUrl || !config.clientId) {
			return c.html(
				`<h2>Not configured</h2><p>Visit <a href="/settings">/settings</a> to configure the OIDC provider first.</p>`,
				503,
			);
		}

		if (!c.env.OAUTH_PROVIDER) {
			return c.text("OAuth provider not initialized", 500);
		}

		const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
		if (!oauthReqInfo.clientId) {
			return c.text("Invalid OAuth request", 400);
		}

		const codeVerifier = generateCodeVerifier();
		const codeChallenge = await generateCodeChallenge(codeVerifier);
		const state = crypto.randomUUID();

		const pkceState: PkceState = { codeVerifier, oauthReqInfo };
		await c.env.OAUTH_KV.put(`pkce:${state}`, JSON.stringify(pkceState), {
			expirationTtl: 600,
		});

		const redirectUri = new URL("/callback", c.req.url).href;
		const authorizeUrl = buildAuthorizeUrl(config, redirectUri, state, codeChallenge);

		return Response.redirect(authorizeUrl, 302);
	} catch (err) {
		const msg = err instanceof Error ? err.message : "Unknown error";
		return c.text(`Authorization error: ${msg}`, 500);
	}
});

app.get("/callback", async (c) => {
	try {
		const config = await readConfig(c.env.OAUTH_KV);

		const code = c.req.query("code");
		const state = c.req.query("state");
		const error = c.req.query("error");
		const errorDesc = c.req.query("error_description");

		if (error) {
			return c.text(`IDP error: ${error}${errorDesc ? ` — ${errorDesc}` : ""}`, 400);
		}
		if (!code || !state) {
			return c.text("Missing code or state parameter", 400);
		}

		if (!c.env.OAUTH_PROVIDER) {
			return c.text("OAuth provider not initialized", 500);
		}

		const raw = await c.env.OAUTH_KV.get(`pkce:${state}`);
		if (!raw) {
			return c.text("Invalid or expired state — please try again", 400);
		}

		const pkceState = JSON.parse(raw) as PkceState;
		await c.env.OAUTH_KV.delete(`pkce:${state}`);

		const redirectUri = new URL("/callback", c.req.url).href;
		const tokens = await exchangeCodeForTokens(config, code, redirectUri, pkceState.codeVerifier);

		const sessionId = crypto.randomUUID();
		await c.env.OAUTH_KV.put(`oidc:session:${sessionId}`, JSON.stringify(tokens), {
			expirationTtl: 86400 * 30,
		});

		const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
			request: pkceState.oauthReqInfo,
			userId: tokens.userInfo?.sub ?? sessionId,
			scope: pkceState.oauthReqInfo.scope,
			props: { sessionId },
			metadata: {
				label: tokens.userInfo?.name ?? tokens.userInfo?.email ?? "User",
			},
		});

		return Response.redirect(redirectTo, 302);
	} catch (err) {
		const msg = err instanceof Error ? err.message : "Unknown error";
		if (msg === "SESSION_EXPIRED") {
			return c.text("Session expired. Please try connecting again.", 401);
		}
		return c.text(`Callback error: ${msg}`, 500);
	}
});

export { app as OidcHandler };
