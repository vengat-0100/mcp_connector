# Claude Code Spec — Drupal MCP Server
# A remote MCP server on Cloudflare Workers with generic OIDC auth

---

## Goal

Build a **remote MCP server** hosted on Cloudflare Workers that:

1. Authenticates users via any OIDC-compliant IDP (miniOrange, Azure AD, Google, Okta, self-hosted Keycloak etc.) using Authorization Code flow
2. Stores `access_token`, `id_token`, and `refresh_token` in Cloudflare KV
3. Automatically refreshes tokens before they expire on every tool call
4. Exposes Drupal-specific MCP tools that forward calls to a Drupal site using the access token
5. Serves a `/settings` admin UI where the operator configures everything — IDP endpoints, client credentials, Drupal URL, and which tools are enabled — all saved to KV

The operator should be able to point this server at **any OIDC IDP** by filling in the settings form. No code changes required to switch IDPs.

---

## Tech Stack

- **Runtime**: Cloudflare Workers (TypeScript)
- **MCP**: `@modelcontextprotocol/sdk` — McpServer class
- **Auth**: `cloudflare/workers-oauth-provider` — handles OAuth plumbing
- **Routing**: `hono` — lightweight router for Worker HTTP handling
- **Validation**: `zod` — tool input schemas
- **Storage**: Cloudflare KV — tokens, config, OAuth state
- **Sessions**: Cloudflare Durable Objects — MCP session persistence

---

## Project Structure

```
drupal-mcp-server/
├── src/
│   ├── index.ts              # Worker entry point — routes all requests
│   ├── config.ts             # Config type, KV read/write, validation
│   ├── oidc-handler.ts       # Generic OIDC authorize/callback/refresh logic
│   ├── agent.ts              # McpAgent — registers and executes tools
│   ├── tools/
│   │   ├── content.ts        # get_node, list_nodes, create_node, search_content
│   │   ├── users.ts          # current_user, list_users
│   │   ├── admin.ts          # clear_cache, run_cron, get_config
│   │   ├── miniorange.ts     # oauth_clients, sso_log
│   │   └── passthrough.ts    # drupal_mcp_passthrough
│   └── settings/
│       ├── handler.ts        # GET /settings, POST /settings, POST /settings/test
│       └── page.ts           # HTML template for the settings UI
├── wrangler.jsonc
├── package.json
└── tsconfig.json
```

---

## wrangler.jsonc

```jsonc
{
  "name": "drupal-mcp-server",
  "main": "src/index.ts",
  "compatibility_date": "2025-03-01",
  "compatibility_flags": ["nodejs_compat"],

  "kv_namespaces": [
    { "binding": "OAUTH_KV", "id": "REPLACE_AFTER_CREATION" }
  ],

  "durable_objects": {
    "bindings": [
      { "name": "MCP_OBJECT", "class_name": "DrupalMcpAgent" }
    ]
  },

  "migrations": [
    { "tag": "v1", "new_classes": ["DrupalMcpAgent"] }
  ]
}
```

---

## Environment Bindings (Env interface)

```typescript
interface Env {
  OAUTH_KV: KVNamespace;
  MCP_OBJECT: DurableObjectNamespace;
  COOKIE_ENCRYPTION_KEY: string; // wrangler secret
}
```

**No hardcoded URLs or credentials anywhere in code.**
All IDP config (URLs, client ID, client secret) is read from KV at runtime via `readConfig()`.

---

## Part 1 — Config System (src/config.ts)

### ConnectorConfig type

```typescript
interface ConnectorConfig {
  // Drupal
  drupalBaseUrl: string;       // https://your-drupal-site.com
  drupalMcpUrl: string;        // https://your-drupal-site.com/mcp

  // OIDC IDP — works with any compliant provider
  idpName: string;             // display name e.g. "miniOrange", "Azure AD"
  oidcIssuer: string;          // https://your-idp.com (used for discovery)
  authorizeUrl: string;        // authorization endpoint
  tokenUrl: string;            // token endpoint
  userinfoUrl: string;         // userinfo endpoint
  jwksUrl: string;             // JWKS endpoint for id_token verification
  clientId: string;
  clientSecret: string;        // stored in KV (Worker is server-side only)
  scopes: string;              // space-separated e.g. "openid profile email"

  // Tool toggles — each tool can be enabled/disabled independently
  tools: {
    getNode: boolean;
    listNodes: boolean;
    createNode: boolean;
    searchContent: boolean;
    currentUser: boolean;
    listUsers: boolean;
    clearCache: boolean;
    runCron: boolean;
    getConfig: boolean;
    oauthClients: boolean;
    ssoLog: boolean;
    mcpPassthrough: boolean;
  };

  // Meta
  setupDone: boolean;
  savedAt?: string;
}
```

### Functions to implement

- `readConfig(kv: KVNamespace): Promise<ConnectorConfig>` — read from KV key `connector:config`, merge with defaults
- `writeConfig(kv: KVNamespace, config: ConnectorConfig): Promise<void>` — write to KV
- `validateConfig(config: ConnectorConfig): string[]` — return list of validation errors
- `DEFAULT_CONFIG` — exported constant with all fields empty / tools all false

---

## Part 2 — OIDC Handler (src/oidc-handler.ts)

This is the most important file. It replaces the GitHub-specific handler from the template.

### Token storage shape in KV

```typescript
interface StoredTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;   // unix ms
  idTokenExpiresAt: number;       // unix ms
  tokenType: string;              // "Bearer"
  scope: string;
  userInfo?: {
    sub: string;
    email?: string;
    name?: string;
    roles?: string[];
  };
}
```

### Functions to implement

#### `buildAuthorizeUrl(config, redirectUri, state, codeChallenge)`
- Builds the full authorization URL pointing at `config.authorizeUrl`
- Appends: `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`
- Appends PKCE params: `code_challenge`, `code_challenge_method=S256`
- Returns the full URL string

#### `exchangeCodeForTokens(config, code, redirectUri, codeVerifier)`
- POST to `config.tokenUrl` with `grant_type=authorization_code`
- Sends `client_id`, `client_secret`, `code`, `redirect_uri`, `code_verifier`
- Returns `StoredTokens` with expiry calculated from `expires_in`
- Fetches userinfo from `config.userinfoUrl` using the access token
- Attaches userinfo to the returned token object

#### `refreshTokens(config, storedTokens)`
- POST to `config.tokenUrl` with `grant_type=refresh_token`
- Sends `refresh_token`, `client_id`, `client_secret`
- Returns updated `StoredTokens`
- If refresh fails (expired refresh token) — throw an error with message `"SESSION_EXPIRED"` so the caller can redirect to re-authorize

#### `isAccessTokenExpired(tokens)`
- Returns true if `accessTokenExpiresAt` is within 60 seconds of now
- 60 second buffer prevents race conditions on slow networks

#### `isIdTokenExpired(tokens)`
- Returns true if `idTokenExpiresAt` is within 60 seconds of now

#### `getValidTokens(kv, sessionId, config)`
- Reads stored tokens from KV
- Checks if access token is expired → if yes, calls `refreshTokens()`
- Saves refreshed tokens back to KV
- Returns valid tokens ready for use
- This is called at the start of EVERY tool execution

### Route handlers

#### `handleAuthorize(request, env, config)`
- Generates PKCE `code_verifier` and `code_challenge` (SHA-256)
- Generates random `state`
- Saves `{ codeVerifier, state, redirectAfter }` to KV with 10 min TTL
- Redirects browser to `buildAuthorizeUrl(...)`

#### `handleCallback(request, env, config)`
- Reads `code` and `state` from URL params
- Validates `state` against KV — reject if missing or mismatched
- Calls `exchangeCodeForTokens()`
- Saves `StoredTokens` to KV under a new `sessionId`
- Sets a signed, httpOnly cookie with the `sessionId`
- Redirects to `/` (home/success page)

---

## Part 3 — MCP Agent (src/agent.ts)

```typescript
export class DrupalMcpAgent extends McpAgent<Env, StoredTokens, Record<string, never>> {
  server = new McpServer({
    name: "drupal-mcp-server",
    version: "1.0.0",
  });

  async init() {
    const config = await readConfig(this.env.OAUTH_KV);
    const tokens = await getValidTokens(this.env.OAUTH_KV, this.sessionId, config);

    // Register only enabled tools
    if (config.tools.getNode)        registerContentTools(this.server, config, tokens);
    if (config.tools.currentUser)    registerUserTools(this.server, config, tokens);
    if (config.tools.clearCache)     registerAdminTools(this.server, config, tokens);
    if (config.tools.oauthClients)   registerMiniOrangeTools(this.server, config, tokens);
    if (config.tools.mcpPassthrough) registerPassthroughTool(this.server, config, tokens);
  }
}
```

---

## Part 4 — Tools

Each tool file exports a `register*Tools(server, config, tokens)` function.

### Tool execution pattern (apply to ALL tools)

Every tool must follow this pattern:

```typescript
async (args) => {
  // 1. Refresh tokens if needed BEFORE making the request
  const validTokens = await getValidTokens(kv, sessionId, config);

  // 2. Make the Drupal API call with Bearer token
  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${validTokens.accessToken}`,
      "Content-Type": "application/json",
      "Accept": "application/vnd.api+json",
    }
  });

  // 3. Handle errors cleanly
  if (!res.ok) {
    return {
      content: [{ type: "text", text: `Error ${res.status}: ${await res.text()}` }],
      isError: true,
    };
  }

  // 4. Return result
  return { content: [{ type: "text", text: await res.text() }] };
}
```

### src/tools/content.ts — tools to implement

| Tool name | Method | Drupal endpoint | Args |
|---|---|---|---|
| `drupal_get_node` | GET | `/jsonapi/node/{type}/{uuid}` | `nid: number`, `type: string` |
| `drupal_list_nodes` | GET | `/jsonapi/node/{type}` | `type: string`, `limit: number`, `status: "published"\|"unpublished"\|"any"` |
| `drupal_create_node` | POST | `/jsonapi/node/{type}` | `type: string`, `title: string`, `body?: string`, `status?: boolean` |
| `drupal_search_content` | GET | `/jsonapi/node/article?filter[fulltext]=...` | `query: string`, `type?: string` |

### src/tools/users.ts

| Tool name | Endpoint | Args |
|---|---|---|
| `drupal_current_user` | `/jsonapi/user/me` | none |
| `drupal_list_users` | `/jsonapi/user/user` | `limit: number` |

### src/tools/admin.ts

| Tool name | Endpoint | Args |
|---|---|---|
| `drupal_clear_cache` | POST `/api/mcp/cache-clear` | none |
| `drupal_run_cron` | POST `/api/mcp/cron-run` | none |
| `drupal_get_config` | GET `/api/mcp/config/{name}` | `config_name: string` |

### src/tools/miniorange.ts

| Tool name | Endpoint | Args |
|---|---|---|
| `drupal_oauth_clients` | GET `/api/mcp/mo-oauth/clients` | none |
| `drupal_sso_log` | GET `/api/mcp/mo-oauth/sso-log` | `limit: number` |

### src/tools/passthrough.ts

| Tool name | Description | Args |
|---|---|---|
| `drupal_mcp_passthrough` | Forward any JSON-RPC tool call to Drupal MCP server | `tool_name: string`, `arguments?: Record<string, unknown>` |

---

## Part 5 — Settings UI (src/settings/)

### GET /settings — render form

Serve an HTML page with:

#### Section 1 — MCP URL banner (read-only)
- Shows `{worker-url}/mcp` prominently at the top
- Copy button
- "Add this URL to Claude.ai → Settings → Integrations"

#### Section 2 — Drupal site
- `drupalBaseUrl` — text input, placeholder `https://your-drupal-site.com`
- `drupalMcpUrl` — text input, auto-fills to `{drupalBaseUrl}/mcp` when base URL is entered

#### Section 3 — OIDC Identity Provider
- `idpName` — text input e.g. "miniOrange", "Azure AD"
- `oidcIssuer` — text input (optional, for discovery)
- `authorizeUrl` — text input
- `tokenUrl` — text input
- `userinfoUrl` — text input
- `jwksUrl` — text input
- `scopes` — text input, default `openid profile email`
- **Auto-fill buttons**: "miniOrange defaults", "Azure AD defaults", "Keycloak defaults"
  - Each pre-fills all URL fields based on a known base URL

#### Section 4 — Client credentials
- `clientId` — text input
- `clientSecret` — password input (masked, shows bullet placeholder if already saved)
- Note: "Stored securely in Cloudflare KV. Never logged."

#### Section 5 — Tool toggles
- Grouped checkboxes: Content / Users / Admin / miniOrange / Advanced
- Each toggle shows tool name + one-line description

#### Section 6 — Actions
- **Save settings** button — POST /settings
- **Test connection** button — POST /settings/test (AJAX, shows per-check results inline)
- **Reset tools to defaults** button — JS only, resets checkboxes

### POST /settings — save handler
- Parse form data
- If `clientSecret` value is the masked placeholder `"••••••••"` — keep existing secret from KV
- Validate with `validateConfig()`
- On error — re-render form with error banner, preserve entered values
- On success — write to KV, re-render with success banner

### POST /settings/test — connection tester
- Accepts JSON body with current form values (not yet saved)
- Runs these checks in parallel:
  1. HEAD `drupalBaseUrl` — is Drupal reachable?
  2. POST `drupalMcpUrl` with initialize JSON-RPC — does MCP server respond?
  3. HEAD `authorizeUrl` — does authorize endpoint exist?
  4. HEAD `tokenUrl` — does token endpoint exist?
- Returns JSON: `{ checks: [{ label: string, ok: boolean }] }`

### Settings page design requirements
- Clean, minimal design — system font, neutral colors
- Mobile responsive
- No external CSS frameworks or CDN dependencies — all styles inline in the HTML
- Auto-fill: when `drupalBaseUrl` is typed, auto-populate `drupalMcpUrl`
- When IDP auto-fill button clicked, prompt for base URL if not entered

---

## Part 6 — Main Router (src/index.ts)

```typescript
// Route all requests:
// GET  /              → home page (shows MCP URL + link to /settings)
// GET  /settings      → settings page
// POST /settings      → save settings
// POST /settings/test → test connection
// GET  /authorize     → start OIDC flow
// GET  /callback      → OIDC callback
// ALL  /mcp/*         → McpAgent (Durable Object)
```

Use **Hono** as the router. The `OAuthProvider` from `workers-oauth-provider` wraps the whole app.

Token validation middleware: for every request to `/mcp/*`, read the session cookie, call `getValidTokens()` — if it throws `"SESSION_EXPIRED"`, return a 401 with `WWW-Authenticate: Bearer error="invalid_token"` so Claude re-triggers the auth flow.

---

## Part 7 — Security Requirements

1. **PKCE required** — always use `code_challenge_method=S256`. Never send bare authorization codes.
2. **State validation** — always validate the `state` param in `/callback` against KV. Reject mismatches.
3. **Cookie security** — session cookie must be `httpOnly=true`, `secure=true`, `sameSite=Lax`
4. **Secret masking** — `clientSecret` is never returned in GET /settings response. Only the masked placeholder.
5. **Token never logged** — no `console.log` of any token value anywhere.
6. **Settings page protection** — add a simple `SETTINGS_PASSWORD` env var check. If set, require a password to access /settings. This prevents anyone with the Worker URL from changing your config.
7. **Refresh token rotation** — if the IDP returns a new refresh token on refresh, replace the old one in KV immediately.

---

## Part 8 — Error Handling

Every async function must be wrapped in try/catch. Errors must:
- Return MCP-compliant error responses (not raw exceptions)
- Include a human-readable message Claude can show
- Not expose internal details (stack traces, token values) in responses

Session expiry specifically:
- When `refreshTokens()` fails → throw `new Error("SESSION_EXPIRED")`
- The `/mcp` middleware catches this → returns HTTP 401
- Claude re-initiates the auth flow automatically

---

## Build Instructions for Claude Code

1. Scaffold from the GitHub OAuth template:
   ```bash
   npm create cloudflare@latest -- drupal-mcp-server --template=cloudflare/ai/demos/remote-mcp-github-oauth
   ```

2. Delete GitHub-specific files:
   - `src/github-handler.ts`
   - `src/utils.ts` (GitHub token helpers)

3. Implement all files described in this spec from scratch, keeping:
   - `src/workers-oauth-utils.ts` — reuse CSRF and cookie utilities as-is
   - `wrangler.jsonc` structure — keep KV and Durable Object bindings

4. Install additional dependencies:
   ```bash
   npm install hono zod @modelcontextprotocol/sdk
   ```

5. All config values (URLs, credentials) must be read from KV via `readConfig()`. No hardcoded values.

6. After implementation, verify:
   - `npm run dev` starts without errors
   - `/settings` renders the form in a browser
   - Saving settings writes to KV (check with `wrangler kv key list --binding OAUTH_KV`)
   - `/authorize` redirects to the configured IDP authorize URL
   - `/callback` exchanges the code and stores tokens in KV

---

## What Success Looks Like

- Operator opens `/settings`, fills in their IDP details (works for miniOrange, Azure AD, Keycloak, or any OIDC provider), saves
- Claude.ai connects to `/mcp`, gets redirected to the configured IDP login
- After login, Claude can call all enabled Drupal tools
- Tokens refresh automatically — Claude never gets interrupted by expiry
- Switching IDP = just update the settings form, no code changes
