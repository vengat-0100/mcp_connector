import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { McpConnectorAgent } from "./agent";
import { OidcHandler } from "./oidc-handler";
import { SettingsHandler } from "./settings/handler";

export { McpConnectorAgent };

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => {
	const mcpUrl = new URL("/mcp", c.req.url).href;
	return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCP Connector</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 600px; margin: 4rem auto; padding: 0 1rem; color: #222; line-height: 1.6; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .url-box { background: #f5f5f5; border: 1px solid #ddd; border-radius: 6px; padding: 0.75rem 1rem; font-family: monospace; margin: 1rem 0; word-break: break-all; }
    a { color: #0070f3; }
  </style>
</head>
<body>
  <h1>MCP Connector</h1>
  <p>Your MCP server URL:</p>
  <div class="url-box">${mcpUrl}</div>
  <p>Add this URL to <strong>Claude.ai → Settings → Integrations</strong>.</p>
  <p><a href="/settings">Open Settings →</a></p>
</body>
</html>`);
});

app.route("/", SettingsHandler);
app.route("/", OidcHandler);

export default new OAuthProvider({
	apiHandler: McpConnectorAgent.serve("/mcp") as never,
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: app as never,
	tokenEndpoint: "/token",
});
