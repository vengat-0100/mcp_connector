# Drupal MCP Server — Setup & Next Steps

## What Was Generated

This project is a **remote MCP (Model Context Protocol) server** running on Cloudflare Workers with GitHub OAuth authentication.

### Architecture

```
MCP Client (Claude / Inspector / Cursor)
        ↓  SSE connection
Cloudflare Worker (OAuth Provider + Hono router)
        ↓  GitHub OAuth flow
GitHub (identity provider)
        ↓  authenticated user props
Durable Object: MyMCP (tool executor)
        ↓  optional
Cloudflare AI (image generation)
```

### Key Files

| File | Purpose |
|---|---|
| `src/index.ts` | MCP server definition, tools, Durable Object class |
| `src/github-handler.ts` | OAuth authorize/callback routes via Hono |
| `src/utils.ts` | GitHub OAuth token helpers |
| `src/workers-oauth-utils.ts` | CSRF, session, KV state management |
| `wrangler.jsonc` | Cloudflare Worker config (KV, Durable Objects, AI binding) |

### Tools Currently Defined

| Tool | Access | Description |
|---|---|---|
| `add` | All authenticated users | Adds two numbers |
| `userInfoOctokit` | All authenticated users | Fetches GitHub user info via Octokit |
| `generateImage` | `ALLOWED_USERNAMES` only | Generates image via Cloudflare AI (`flux-1-schnell`) |

### Infrastructure Used

- **Cloudflare Workers** — serverless runtime
- **Durable Objects** — stateful MCP session persistence
- **KV Namespace (`OAUTH_KV`)** — stores OAuth state tokens
- **Cloudflare AI binding** — image generation (restricted tool)
- **GitHub OAuth App** — identity provider

---

## Local Development Setup

### Prerequisites

- Node.js 18+
- Cloudflare account (free tier works)
- GitHub account

### Step 1 — Cloudflare Login

```bash
npx wrangler login
```

Opens browser → authorize → returns to terminal.

### Step 2 — Create KV Namespace

```bash
npx wrangler kv namespace create "OAUTH_KV"
```

Copy the `id` from output. Open `wrangler.jsonc` and replace:

```json
"id": "<Add-KV-ID>"
```

with the actual ID:

```json
"id": "your_actual_kv_id_here"
```

### Step 3 — Create GitHub OAuth App (for local)

1. Go to: **github.com → Settings → Developer settings → OAuth Apps → New OAuth App**
2. Fill in:
   - **Application name**: anything (e.g. `drupal-mcp-local`)
   - **Homepage URL**: `http://localhost:8788`
   - **Authorization callback URL**: `http://localhost:8788/callback`
3. Click **Register application**
4. Click **Generate a new client secret**
5. Note down: `Client ID` and `Client secret`

### Step 4 — Create `.dev.vars`

Create file at project root:

```
GITHUB_CLIENT_ID=your_client_id_from_step3
GITHUB_CLIENT_SECRET=your_client_secret_from_step3
COOKIE_ENCRYPTION_KEY=your_random_32char_string
```

Generate a secure key:

```bash
openssl rand -hex 32
```

### Step 5 — Run Locally

```bash
npm run dev
```

Server available at: `http://localhost:8788`

### Step 6 — Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector@latest
```

Enter `http://localhost:8788/sse` → Connect → GitHub login → Tools visible.

---

## Production Deployment

### Step 1 — Create Production GitHub OAuth App

Same as local but with production URLs:
- **Homepage URL**: `https://drupal-mcp-server.<your-subdomain>.workers.dev`
- **Authorization callback URL**: `https://drupal-mcp-server.<your-subdomain>.workers.dev/callback`

### Step 2 — Set Production Secrets

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put COOKIE_ENCRYPTION_KEY
```

### Step 3 — Deploy

```bash
npm run deploy
```

### Step 4 — Test Production

```bash
npx @modelcontextprotocol/inspector@latest
```

Enter `https://drupal-mcp-server.<your-subdomain>.workers.dev/sse` → Connect.

---

## Next Steps — Customization

### 1. Add Your MCP Tools

In `src/index.ts`, inside the `init()` method, add tools:

```typescript
this.server.tool(
  "myTool",
  "Description of what it does",
  { param: z.string() },
  async ({ param }) => ({
    content: [{ text: `Result: ${param}`, type: "text" }],
  })
);
```

### 2. Restrict Tool Access by GitHub Username

```typescript
const ALLOWED_USERNAMES = new Set<string>([
  "yourgithubusername",
  "teammatename",
]);
```

### 3. Replace GitHub OAuth with Another Provider

The `src/github-handler.ts` and `src/utils.ts` are the only GitHub-specific files. Swap these to use a different OAuth provider (Google, Okta, etc.) while keeping the rest of the server intact.

### 4. Connect to Claude Desktop

Open Claude Desktop → **Settings → Developer → Edit Config**:

```json
{
  "mcpServers": {
    "drupal-mcp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://drupal-mcp-server.<your-subdomain>.workers.dev/sse"
      ]
    }
  }
}
```

Restart Claude Desktop → OAuth login flow → tools available.

### 5. Connect to Cursor

**Settings → MCP → Add Server**
- Type: `Command`
- Command: `npx mcp-remote https://drupal-mcp-server.<your-subdomain>.workers.dev/sse`

---

## Security Notes

- `.dev.vars` is gitignored — never commit it
- Production secrets stored in Cloudflare (not in code)
- `generateImage` tool gated by `ALLOWED_USERNAMES` — update before deploying
- Review [Securing MCP Servers guide](https://github.com/cloudflare/agents/blob/main/docs/securing-mcp-servers.md) before production use
