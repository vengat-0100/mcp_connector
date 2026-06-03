import { type ConnectorConfig } from "../config";

export const SECRET_PLACEHOLDER = "••••••••";

export interface PageOptions {
	mcpUrl: string;
	config: ConnectorConfig;
	errors?: string[];
	success?: boolean;
}

function esc(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

export function renderSettingsPage(opts: PageOptions): string {
	const { mcpUrl, config, errors = [], success = false } = opts;
	const secretValue = config.clientSecret ? SECRET_PLACEHOLDER : "";
	const callbackUrl = mcpUrl.replace(/\/mcp$/, "/callback");

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCP Connector — Settings</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; color: #222; line-height: 1.5; }
    .container { max-width: 720px; margin: 2rem auto; padding: 0 1rem 4rem; }
    h1 { font-size: 1.4rem; font-weight: 600; margin-bottom: 0.25rem; }
    .subtitle { color: #666; font-size: 0.9rem; margin-bottom: 2rem; }
    .card { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; }
    .card h2 { font-size: 1rem; font-weight: 600; margin-bottom: 1rem; color: #333; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
    .url-row { display: flex; align-items: center; gap: 0.5rem; background: #f8f8f8; border: 1px solid #ddd; border-radius: 6px; padding: 0.75rem 1rem; }
    .url-text { font-family: monospace; font-size: 0.9rem; flex: 1; word-break: break-all; }
    .url-label { font-size: 0.8rem; font-weight: 500; color: #555; margin-bottom: 0.35rem; }
    .copy-btn { padding: 0.35rem 0.75rem; font-size: 0.8rem; background: #fff; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; white-space: nowrap; }
    .copy-btn:hover { background: #f0f0f0; }
    .hint { font-size: 0.8rem; color: #666; margin-top: 0.4rem; }
    .url-block { margin-bottom: 1rem; }
    .url-block:last-child { margin-bottom: 0; }
    .form-group { margin-bottom: 1rem; }
    label.field-label { display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: 0.3rem; color: #444; }
    input[type="text"], input[type="password"], input[type="url"] {
      width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #ccc; border-radius: 5px; font-size: 0.9rem; font-family: inherit;
    }
    input:focus { outline: none; border-color: #0070f3; box-shadow: 0 0 0 2px rgba(0,112,243,0.15); }
    .autofill-row { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .autofill-btn { padding: 0.35rem 0.75rem; font-size: 0.8rem; background: #eef3ff; border: 1px solid #c5d5f5; border-radius: 4px; cursor: pointer; color: #0050c0; }
    .autofill-btn:hover { background: #dce8ff; }
    .note { font-size: 0.8rem; color: #666; background: #fffbe6; border: 1px solid #ffe58f; border-radius: 4px; padding: 0.5rem 0.75rem; margin-top: 0.5rem; }
    .info-box { font-size: 0.85rem; color: #444; background: #f0f7ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 0.75rem 1rem; }
    .actions-row { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; }
    .btn-primary { padding: 0.6rem 1.4rem; background: #0070f3; color: #fff; border: none; border-radius: 6px; font-size: 0.9rem; font-weight: 500; cursor: pointer; }
    .btn-primary:hover { background: #005fd4; }
    .btn-test { padding: 0.6rem 1.2rem; background: #fff; color: #0070f3; border: 1px solid #0070f3; border-radius: 6px; font-size: 0.9rem; cursor: pointer; }
    .btn-test:hover { background: #eef3ff; }
    .banner { padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1.5rem; font-size: 0.9rem; }
    .banner-error { background: #fff0f0; border: 1px solid #f5c6c6; color: #c0392b; }
    .banner-success { background: #f0fff4; border: 1px solid #b7e4c7; color: #1a7340; }
    .banner ul { margin: 0.4rem 0 0 1.2rem; }
    #test-results { margin-top: 1rem; }
    .check-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0; font-size: 0.85rem; }
    .check-ok { color: #1a7340; }
    .check-fail { color: #c0392b; }
  </style>
</head>
<body>
<div class="container">
  <h1>MCP Connector</h1>
  <p class="subtitle">Configure your OIDC provider and target site below.</p>

  ${errors.length > 0 ? `
  <div class="banner banner-error">
    <strong>Please fix these errors:</strong>
    <ul>${errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
  </div>` : ""}

  ${success ? `<div class="banner banner-success">Settings saved successfully.</div>` : ""}

  <!-- URLs -->
  <div class="card">
    <h2>Connection URLs</h2>

    <div class="url-block">
      <div class="url-label">MCP Server URL</div>
      <div class="url-row">
        <span class="url-text" id="mcp-url">${esc(mcpUrl)}</span>
        <button type="button" class="copy-btn" onclick="copyUrl('mcp-url', this)">Copy</button>
      </div>
      <p class="hint">Add this URL to Claude.ai → Settings → Integrations → Add integration</p>
    </div>

    <div class="url-block">
      <div class="url-label">OAuth Callback URL</div>
      <div class="url-row">
        <span class="url-text" id="callback-url">${esc(callbackUrl)}</span>
        <button type="button" class="copy-btn" onclick="copyUrl('callback-url', this)">Copy</button>
      </div>
      <p class="hint">Register this as the <strong>Redirect / Callback URI</strong> in your IDP OAuth app settings.</p>
    </div>
  </div>

  <form method="POST" action="/settings">

    <!-- Target site -->
    <div class="card">
      <h2>Target Site</h2>
      <div class="form-group">
        <label class="field-label" for="siteUrl">Site Base URL</label>
        <input type="url" id="siteUrl" name="siteUrl" value="${esc(config.siteUrl)}" placeholder="https://your-site.com" oninput="autofillMcpUrl(this.value)">
      </div>
      <div class="form-group">
        <label class="field-label" for="mcpEndpointUrl">MCP Endpoint URL</label>
        <input type="url" id="mcpEndpointUrl" name="mcpEndpointUrl" value="${esc(config.mcpEndpointUrl)}" placeholder="https://your-site.com/mcp">
      </div>
      <div class="info-box">
        Tools are fetched dynamically from the target MCP server on every connection. No tool configuration is needed here.
      </div>
    </div>

    <!-- OIDC IDP -->
    <div class="card">
      <h2>OIDC Identity Provider</h2>
      <div class="autofill-row">
        <button type="button" class="autofill-btn" onclick="autofillIdp('miniorange')">miniOrange defaults</button>
        <button type="button" class="autofill-btn" onclick="autofillIdp('azure')">Azure AD defaults</button>
        <button type="button" class="autofill-btn" onclick="autofillIdp('keycloak')">Keycloak defaults</button>
      </div>
      <div class="form-group">
        <label class="field-label" for="idpName">IDP Display Name</label>
        <input type="text" id="idpName" name="idpName" value="${esc(config.idpName)}" placeholder="e.g. miniOrange, Azure AD, Keycloak">
      </div>
      <div class="form-group">
        <label class="field-label" for="oidcIssuer">OIDC Issuer URL <span style="font-weight:400;color:#888">(optional)</span></label>
        <input type="url" id="oidcIssuer" name="oidcIssuer" value="${esc(config.oidcIssuer)}" placeholder="https://your-idp.com">
      </div>
      <div class="form-group">
        <label class="field-label" for="authorizeUrl">Authorization Endpoint</label>
        <input type="url" id="authorizeUrl" name="authorizeUrl" value="${esc(config.authorizeUrl)}" placeholder="https://your-idp.com/oauth/authorize">
      </div>
      <div class="form-group">
        <label class="field-label" for="tokenUrl">Token Endpoint</label>
        <input type="url" id="tokenUrl" name="tokenUrl" value="${esc(config.tokenUrl)}" placeholder="https://your-idp.com/oauth/token">
      </div>
      <div class="form-group">
        <label class="field-label" for="userinfoUrl">Userinfo Endpoint</label>
        <input type="url" id="userinfoUrl" name="userinfoUrl" value="${esc(config.userinfoUrl)}" placeholder="https://your-idp.com/oauth/userinfo">
      </div>
      <div class="form-group">
        <label class="field-label" for="jwksUrl">JWKS Endpoint</label>
        <input type="url" id="jwksUrl" name="jwksUrl" value="${esc(config.jwksUrl)}" placeholder="https://your-idp.com/oauth/jwks">
      </div>
      <div class="form-group">
        <label class="field-label" for="scopes">Scopes</label>
        <input type="text" id="scopes" name="scopes" value="${esc(config.scopes || "openid profile email")}" placeholder="openid profile email">
      </div>
    </div>

    <!-- Client credentials -->
    <div class="card">
      <h2>Client Credentials</h2>
      <div class="form-group">
        <label class="field-label" for="clientId">Client ID</label>
        <input type="text" id="clientId" name="clientId" value="${esc(config.clientId)}" placeholder="your-client-id" autocomplete="off">
      </div>
      <div class="form-group">
        <label class="field-label" for="clientSecret">Client Secret</label>
        <input type="password" id="clientSecret" name="clientSecret" value="${esc(secretValue)}" placeholder="your-client-secret" autocomplete="new-password">
        <p class="note">Stored securely in Cloudflare KV. Never logged. Leave unchanged to keep the existing secret.</p>
      </div>
    </div>

    <!-- Actions -->
    <div class="card">
      <div class="actions-row">
        <button type="submit" class="btn-primary">Save settings</button>
        <button type="button" class="btn-test" onclick="testConnection()">Test connection</button>
      </div>
      <div id="test-results"></div>
    </div>

  </form>
</div>

<script>
function copyUrl(id, btn) {
  navigator.clipboard.writeText(document.getElementById(id).textContent).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 1500);
  });
}

function autofillMcpUrl(siteUrl) {
  const f = document.getElementById('mcpEndpointUrl');
  if (!f.value || f.value === f.dataset.last) {
    f.value = siteUrl ? siteUrl.replace(/\\/$/, '') + '/mcp' : '';
    f.dataset.last = f.value;
  }
}

function autofillIdp(preset) {
  const prompts = {
    miniorange: 'Enter your miniOrange base URL (e.g. https://your-domain.miniorange.com):',
    azure: 'Enter your Azure AD tenant ID:',
    keycloak: 'Enter your Keycloak realm base URL (e.g. https://keycloak.example.com/realms/myrealm):',
  };
  const base = prompt(prompts[preset]);
  if (!base) return;
  const b = base.replace(/\\/$/, '');
  if (preset === 'miniorange') {
    document.getElementById('idpName').value = 'miniOrange';
    document.getElementById('authorizeUrl').value = b + '/oauth/authorize';
    document.getElementById('tokenUrl').value = b + '/oauth/token';
    document.getElementById('userinfoUrl').value = b + '/oauth/userinfo';
    document.getElementById('jwksUrl').value = b + '/oauth/jwks';
  } else if (preset === 'azure') {
    document.getElementById('idpName').value = 'Azure AD';
    document.getElementById('authorizeUrl').value = 'https://login.microsoftonline.com/' + b + '/oauth2/v2.0/authorize';
    document.getElementById('tokenUrl').value = 'https://login.microsoftonline.com/' + b + '/oauth2/v2.0/token';
    document.getElementById('userinfoUrl').value = 'https://graph.microsoft.com/oidc/userinfo';
    document.getElementById('jwksUrl').value = 'https://login.microsoftonline.com/' + b + '/discovery/v2.0/keys';
    document.getElementById('oidcIssuer').value = 'https://login.microsoftonline.com/' + b + '/v2.0';
  } else if (preset === 'keycloak') {
    document.getElementById('idpName').value = 'Keycloak';
    document.getElementById('authorizeUrl').value = b + '/protocol/openid-connect/auth';
    document.getElementById('tokenUrl').value = b + '/protocol/openid-connect/token';
    document.getElementById('userinfoUrl').value = b + '/protocol/openid-connect/userinfo';
    document.getElementById('jwksUrl').value = b + '/protocol/openid-connect/certs';
    document.getElementById('oidcIssuer').value = b;
  }
}

async function testConnection() {
  const resultsDiv = document.getElementById('test-results');
  resultsDiv.innerHTML = '<p style="color:#666;font-size:0.85rem;margin-top:0.75rem">Testing...</p>';
  const form = document.querySelector('form');
  try {
    const resp = await fetch('/settings/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteUrl: form.siteUrl.value,
        mcpEndpointUrl: form.mcpEndpointUrl.value,
        authorizeUrl: form.authorizeUrl.value,
        tokenUrl: form.tokenUrl.value,
      }),
    });
    const result = await resp.json();
    resultsDiv.innerHTML = '<div style="margin-top:0.75rem">' + result.checks.map(c =>
      '<div class="check-item ' + (c.ok ? 'check-ok' : 'check-fail') + '">' +
      '<span>' + (c.ok ? '✓' : '✗') + '</span><span>' + c.label + '</span></div>'
    ).join('') + '</div>';
  } catch (e) {
    resultsDiv.innerHTML = '<p style="color:#c0392b;font-size:0.85rem;margin-top:0.75rem">Test failed: ' + e.message + '</p>';
  }
}
</script>
</body>
</html>`;
}
