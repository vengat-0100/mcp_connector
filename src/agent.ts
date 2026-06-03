import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { readConfig } from "./config";
import { getValidTokens } from "./oidc-handler";
import { log } from "node:console";

type OidcProps = { sessionId: string };

function buildAuthHeader(
	config: { drupalUsername: string; drupalPassword: string },
	accessToken: string,
): string {
	if (config.drupalUsername && config.drupalPassword) {
		const encoded = btoa(`${config.drupalUsername}:${config.drupalPassword}`);
		return `Basic ${encoded}`;
	}
	return `Bearer ${accessToken}`;
}

// ─── FIXED: callRemoteMcp ───────────────────────────────────────────────────
// Key changes:
//   1. Accepts an explicit `id` so the JSON-RPC id is never hardcoded.
//   2. Returns data.result (unchanged) — the McpServer SDK wraps this itself.
//   3. Uses buildAuthHeader so Basic/Bearer auth is selected from config.
async function callRemoteMcp(
	mcpEndpointUrl: string,
	accessToken: string,
	method: string,
	config: import("./config").ConnectorConfig,
	id: string | number,      // ← NEW: caller supplies the id
	params?: unknown,
): Promise<unknown> {
	console.log(`Calling remote MCP at ${mcpEndpointUrl} with method ${method} and params`, params);

	const res = await fetch(mcpEndpointUrl, {
		method: "POST",
		headers: {
			Authorization: buildAuthHeader(config, accessToken), // ← uses config, not hardcoded
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id,           // ← forwarded from caller, never hardcoded
			method,
			params: params ?? {},
		}),
		signal: AbortSignal.timeout(15000),
	});

	if (!res.ok) {
		throw new Error(`MCP server responded ${res.status}: ${await res.text()}`);
	}

	const contentType = res.headers.get("content-type") ?? "";
	let data: { result?: unknown; error?: { message?: string } };

	if (contentType.includes("text/event-stream")) {
		const text = await res.text();
		console.log("SSE raw:", text.slice(0, 300));
		const dataLine = text.split("\n").find((l) => l.startsWith("data: "));
		if (!dataLine) throw new Error("Empty SSE response from MCP server");
		data = JSON.parse(dataLine.slice(6));
	} else {
		data = (await res.json()) as typeof data;
	}

	if (data.error) {
		throw new Error((data.error as { message?: string }).message ?? "MCP server error");
	}

	log("Received response from MCP server:", data);
	return data.result; // McpServer SDK expects just the result, not the full envelope
}

// ─── AGENT ──────────────────────────────────────────────────────────────────

export class McpConnectorAgent extends McpAgent<Env, Record<string, never>, OidcProps> {
	server = new McpServer({
		name: "mcp-connector",
		version: "1.0.0",
	});

	async init() {
		if (!this.props?.sessionId) {
			this.server.tool("setup_required", "Not authenticated", {}, async () => ({
				content: [{ type: "text", text: "Not authenticated. Connect to the MCP URL and complete the login flow." }],
				isError: true,
			}));
			return;
		}

		const kv = this.env.OAUTH_KV;
		const sessionId = this.props.sessionId;

		const config = await readConfig(kv);
		if (!config.setupDone || !config.mcpEndpointUrl) {
			this.server.tool("setup_required", "Server not configured", {}, async () => ({
				content: [{ type: "text", text: "Visit /settings to configure the MCP endpoint URL and OIDC provider." }],
				isError: true,
			}));
			return;
		}

		const usesBasicAuth = !!(config.drupalUsername && config.drupalPassword);

		if (!usesBasicAuth) {
			try {
				await getValidTokens(kv, sessionId, config);
			} catch {
				this.server.tool("session_expired", "Session expired — reconnect to re-authenticate", {}, async () => ({
					content: [{ type: "text", text: "Session expired. Disconnect and reconnect to the MCP server to re-authenticate." }],
					isError: true,
				}));
				return;
			}
		}

		const getAccessToken = async (cfg: typeof config): Promise<string> => {
			if (cfg.drupalUsername && cfg.drupalPassword) return "";
			const tokens = await getValidTokens(kv, sessionId, cfg);
			return tokens.accessToken;
		};

		this.server.server.registerCapabilities({ tools: {} });

		// ─── FIXED: tools/list ───────────────────────────────────────────────
		// Pass request.id so the JSON-RPC id is forwarded correctly to Drupal.
		this.server.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
			const cfg = await readConfig(kv);
			const accessToken = await getAccessToken(cfg);
			const result = await callRemoteMcp(
				cfg.mcpEndpointUrl,
				accessToken,
				"tools/list",
				cfg,
				request.id,   // ← forward the SDK's request id
			);
			return result as { tools: unknown[] };
		});

		// ─── FIXED: tools/call ───────────────────────────────────────────────
		// Same fix: forward request.id and pass request.params directly.
		this.server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
			const cfg = await readConfig(kv);
			const accessToken = await getAccessToken(cfg);
			const result = await callRemoteMcp(
				cfg.mcpEndpointUrl,
				accessToken,
				"tools/call",
				cfg,
				request.id,        // ← forward the SDK's request id
				request.params,
			);
			return result as { content: unknown[] };
		});
	}
}