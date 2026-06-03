import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { readConfig } from "./config";
import { getValidTokens } from "./oidc-handler";

type OidcProps = { sessionId: string };

// POST a JSON-RPC request to the remote MCP server and return the result.
// Handles both plain JSON and SSE (text/event-stream) responses.
function buildAuthHeader(config: { drupalUsername: string; drupalPassword: string }, accessToken: string): string {
	if (config.drupalUsername && config.drupalPassword) {
		const encoded = btoa(`${config.drupalUsername}:${config.drupalPassword}`);
		return `Basic ${encoded}`;
	}
	return `Bearer ${accessToken}`;
}

async function callRemoteMcp(
	mcpEndpointUrl: string,
	accessToken: string,
	method: string,
	config: import("./config").ConnectorConfig,
	params?: unknown,
): Promise<unknown> {
	const res = await fetch(mcpEndpointUrl, {
		method: "POST",
		headers: {
			// Authorization: buildAuthHeader(config, accessToken),
			Authorization: "Basic YWRtaW46YWRtaW5AMTIz",
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			// id: crypto.randomUUID(),
			id: 1,
			"method" : method,
			"params" : params ?? {},
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
		const dataLine = text.split("\n").find((l) => l.startsWith("data: "));
		if (!dataLine) throw new Error("Empty SSE response from MCP server");
		data = JSON.parse(dataLine.slice(6));
	} else {
		data = (await res.json()) as typeof data;
	}

	if (data.error) {
		throw new Error(data.error.message ?? "MCP server error");
	}
	return data.result;
}

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

		// Helper: returns OIDC access token, or empty string when Basic auth handles the call.
		const getAccessToken = async (cfg: typeof config): Promise<string> => {
			if (cfg.drupalUsername && cfg.drupalPassword) return "";
			const tokens = await getValidTokens(kv, sessionId, cfg);
			return tokens.accessToken;
		};

		this.server.server.registerCapabilities({ tools: {} });

		this.server.server.setRequestHandler(ListToolsRequestSchema, async () => {
			const cfg = await readConfig(kv);
			const accessToken = await getAccessToken(cfg);
			const result = await callRemoteMcp(cfg.mcpEndpointUrl, accessToken, "tools/list", cfg);
			return result as { tools: unknown[] };
		});

		this.server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
			const cfg = await readConfig(kv);
			const accessToken = await getAccessToken(cfg);
			const result = await callRemoteMcp(
				cfg.mcpEndpointUrl,
				accessToken,
				"tools/call",
				cfg,
				request.params,
			);
			return result as { content: unknown[] };
		});
	}
}
