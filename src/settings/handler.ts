import { Hono } from "hono";
import { type ConnectorConfig, readConfig, writeConfig, validateConfig } from "../config";
import { renderSettingsPage, SECRET_PLACEHOLDER } from "./page";

const app = new Hono<{ Bindings: Env }>();

// Optional password protection for /settings
app.use("*", async (c, next) => {
	const password = c.env.SETTINGS_PASSWORD;
	if (!password) return next();
	const auth = c.req.header("Authorization") ?? "";
	if (auth.startsWith("Basic ")) {
		const decoded = atob(auth.slice(6));
		const colon = decoded.indexOf(":");
		const pass = colon >= 0 ? decoded.slice(colon + 1) : decoded;
		if (pass === password) return next();
	}
	return new Response("Unauthorized", {
		status: 401,
		headers: { "WWW-Authenticate": 'Basic realm="MCP Connector Settings"', "Content-Type": "text/plain" },
	});
});

app.get("/settings", async (c) => {
	const config = await readConfig(c.env.OAUTH_KV);
	const mcpUrl = new URL("/mcp", c.req.url).href;
	return c.html(renderSettingsPage({ mcpUrl, config }));
});

app.post("/settings", async (c) => {
	const mcpUrl = new URL("/mcp", c.req.url).href;
	const form = await c.req.formData();
	const existing = await readConfig(c.env.OAUTH_KV);

	const rawSecret = (form.get("clientSecret") as string) ?? "";
	const clientSecret = rawSecret === SECRET_PLACEHOLDER ? existing.clientSecret : rawSecret;

	const updated: ConnectorConfig = {
		siteUrl: ((form.get("siteUrl") as string) ?? "").trim(),
		mcpEndpointUrl: ((form.get("mcpEndpointUrl") as string) ?? "").trim(),
		idpName: ((form.get("idpName") as string) ?? "").trim(),
		oidcIssuer: ((form.get("oidcIssuer") as string) ?? "").trim(),
		authorizeUrl: ((form.get("authorizeUrl") as string) ?? "").trim(),
		tokenUrl: ((form.get("tokenUrl") as string) ?? "").trim(),
		userinfoUrl: ((form.get("userinfoUrl") as string) ?? "").trim(),
		jwksUrl: ((form.get("jwksUrl") as string) ?? "").trim(),
		clientId: ((form.get("clientId") as string) ?? "").trim(),
		clientSecret,
		scopes: ((form.get("scopes") as string) ?? "openid profile email").trim(),
		setupDone: true,
		savedAt: new Date().toISOString(),
	};

	const errors = validateConfig(updated);
	if (errors.length > 0) {
		return c.html(renderSettingsPage({ mcpUrl, config: updated, errors }));
	}

	await writeConfig(c.env.OAUTH_KV, updated);
	return c.html(renderSettingsPage({ mcpUrl, config: updated, success: true }));
});

app.post("/settings/test", async (c) => {
	const body = (await c.req.json()) as {
		siteUrl?: string;
		mcpEndpointUrl?: string;
		authorizeUrl?: string;
		tokenUrl?: string;
	};

	const checks = await Promise.allSettled([
		body.siteUrl
			? fetch(body.siteUrl, { method: "HEAD" }).then((r) => ({ label: "Site reachable", ok: r.ok || r.status < 500 }))
			: Promise.resolve({ label: "Site reachable", ok: false }),

		body.mcpEndpointUrl
			? fetch(body.mcpEndpointUrl, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ jsonrpc: "2.0", id: "1", method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "0" } } }),
				}).then((r) => ({ label: "MCP endpoint responds", ok: r.ok || r.status < 500 }))
			: Promise.resolve({ label: "MCP endpoint responds", ok: false }),

		body.authorizeUrl
			? fetch(body.authorizeUrl, { method: "HEAD" }).then((r) => ({ label: "Authorize URL reachable", ok: r.ok || r.status < 500 }))
			: Promise.resolve({ label: "Authorize URL reachable", ok: false }),

		body.tokenUrl
			? fetch(body.tokenUrl, { method: "HEAD" }).then((r) => ({ label: "Token URL reachable", ok: r.ok || r.status < 500 }))
			: Promise.resolve({ label: "Token URL reachable", ok: false }),
	]);

	return c.json({
		checks: checks.map((r) => (r.status === "fulfilled" ? r.value : { label: "Check failed", ok: false })),
	});
});

export { app as SettingsHandler };
