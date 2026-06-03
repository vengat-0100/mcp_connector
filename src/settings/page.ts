import { type ConnectorConfig } from "../config";

export const SECRET_PLACEHOLDER = "••••••••";

export interface PageOptions {
	mcpUrl: string;
	config: ConnectorConfig;
	errors?: string[];
	success?: boolean;
	setupToken?: string;
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
	const { mcpUrl, config, errors = [], success = false, setupToken } = opts;
	const isSetupMode = !!setupToken;
	const formAction = isSetupMode ? "/setup" : "/settings";
	const secretValue = config.clientSecret ? SECRET_PLACEHOLDER : "";
	const callbackUrl = mcpUrl.replace(/\/mcp$/, "/callback");

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isSetupMode ? "MCP Connector — Setup" : "MCP Connector — Settings"}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --accent: #6366f1;
      --accent-hover: #4f46e5;
      --accent-light: #eef2ff;
      --accent-border: #c7d2fe;
      --surface: #ffffff;
      --surface-2: #f8fafc;
      --border: #e2e8f0;
      --border-focus: #6366f1;
      --text-primary: #0f172a;
      --text-secondary: #64748b;
      --text-muted: #94a3b8;
      --success-bg: #f0fdf4;
      --success-border: #86efac;
      --success-text: #166534;
      --error-bg: #fef2f2;
      --error-border: #fca5a5;
      --error-text: #991b1b;
      --warn-bg: #fffbeb;
      --warn-border: #fcd34d;
      --warn-text: #92400e;
      --radius: 12px;
      --radius-sm: 8px;
      --shadow-sm: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
      --shadow: 0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -1px rgba(0,0,0,0.04);
      --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04);
    }

    html { font-size: 15px; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background: #f1f5f9; color: var(--text-primary); line-height: 1.6; min-height: 100vh; }

    /* Header */
    .header { background: #0f172a; padding: 0 2rem; height: 56px; display: flex; align-items: center; gap: 0.75rem; position: sticky; top: 0; z-index: 10; }
    .header-logo { width: 28px; height: 28px; background: var(--accent); border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .header-logo svg { width: 16px; height: 16px; fill: none; stroke: #fff; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .header-title { color: #fff; font-weight: 600; font-size: 0.95rem; letter-spacing: -0.01em; }
    .header-badge { margin-left: 0.5rem; padding: 0.15rem 0.55rem; background: rgba(99,102,241,0.25); color: #a5b4fc; border-radius: 99px; font-size: 0.7rem; font-weight: 500; letter-spacing: 0.02em; text-transform: uppercase; }

    /* Layout */
    .page { max-width: 760px; margin: 0 auto; padding: 2.5rem 1.25rem 5rem; }

    /* Page heading */
    .page-heading { margin-bottom: 2rem; }
    .page-heading h1 { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.03em; color: var(--text-primary); }
    .page-heading p { color: var(--text-secondary); margin-top: 0.3rem; font-size: 0.9rem; }

    /* Step indicator */
    .steps { display: flex; align-items: center; gap: 0; margin-bottom: 2rem; }
    .step { display: flex; align-items: center; gap: 0.5rem; }
    .step-num { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; flex-shrink: 0; }
    .step.active .step-num { background: var(--accent); color: #fff; }
    .step.done .step-num { background: #22c55e; color: #fff; }
    .step.inactive .step-num { background: var(--border); color: var(--text-muted); }
    .step-label { font-size: 0.8rem; font-weight: 500; }
    .step.active .step-label { color: var(--text-primary); }
    .step.inactive .step-label { color: var(--text-muted); }
    .step-line { flex: 1; height: 2px; background: var(--border); margin: 0 0.75rem; min-width: 32px; }
    .step-line.done { background: #22c55e; }

    /* Alert banners */
    .alert { display: flex; gap: 0.75rem; padding: 0.875rem 1rem; border-radius: var(--radius-sm); margin-bottom: 1.5rem; font-size: 0.875rem; border: 1px solid; }
    .alert-icon { flex-shrink: 0; width: 18px; height: 18px; margin-top: 1px; }
    .alert-content { flex: 1; }
    .alert-content strong { font-weight: 600; }
    .alert-content ul { margin: 0.35rem 0 0 1rem; }
    .alert-content li { margin-bottom: 0.15rem; }
    .alert-info { background: var(--accent-light); border-color: var(--accent-border); color: #3730a3; }
    .alert-success { background: var(--success-bg); border-color: var(--success-border); color: var(--success-text); }
    .alert-error { background: var(--error-bg); border-color: var(--error-border); color: var(--error-text); }

    /* Card */
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.5rem; margin-bottom: 1.25rem; box-shadow: var(--shadow-sm); }
    .card-header { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.25rem; padding-bottom: 0.875rem; border-bottom: 1px solid var(--border); }
    .card-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .card-icon svg { width: 16px; height: 16px; }
    .card-icon-purple { background: #ede9fe; }
    .card-icon-purple svg { stroke: #7c3aed; }
    .card-icon-blue { background: #dbeafe; }
    .card-icon-blue svg { stroke: #2563eb; }
    .card-icon-green { background: #dcfce7; }
    .card-icon-green svg { stroke: #16a34a; }
    .card-icon-orange { background: #ffedd5; }
    .card-icon-orange svg { stroke: #ea580c; }
    .card-title { font-size: 0.95rem; font-weight: 600; color: var(--text-primary); }
    .card-subtitle { font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.05rem; }

    /* URL display */
    .url-block { margin-bottom: 1rem; }
    .url-block:last-child { margin-bottom: 0; }
    .url-block-label { font-size: 0.78rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.4rem; }
    .url-row { display: flex; align-items: center; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; }
    .url-text { font-family: 'SF Mono', 'Fira Code', 'Fira Mono', monospace; font-size: 0.82rem; flex: 1; padding: 0.6rem 0.875rem; word-break: break-all; color: var(--text-primary); }
    .copy-btn { padding: 0 1rem; height: 100%; min-height: 38px; font-size: 0.78rem; font-weight: 500; background: transparent; border: none; border-left: 1px solid var(--border); cursor: pointer; color: var(--accent); white-space: nowrap; transition: background 0.15s; font-family: inherit; }
    .copy-btn:hover { background: var(--accent-light); }
    .url-hint { font-size: 0.78rem; color: var(--text-muted); margin-top: 0.35rem; }

    /* Form */
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 1rem; }
    .form-grid .form-group { grid-column: span 1; }
    .form-grid .form-group.full { grid-column: span 2; }
    .form-group { margin-bottom: 1rem; }
    .form-group:last-child { margin-bottom: 0; }
    .field-label { display: flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 0.4rem; letter-spacing: 0.01em; }
    .field-optional { font-size: 0.72rem; font-weight: 400; color: var(--text-muted); background: var(--surface-2); border: 1px solid var(--border); border-radius: 4px; padding: 0.05rem 0.35rem; }
    input[type="text"], input[type="password"], input[type="url"] {
      width: 100%; padding: 0.55rem 0.875rem;
      border: 1px solid var(--border); border-radius: var(--radius-sm);
      font-size: 0.875rem; font-family: inherit; color: var(--text-primary);
      background: var(--surface); transition: border-color 0.15s, box-shadow 0.15s;
      appearance: none;
    }
    input::placeholder { color: var(--text-muted); }
    input:focus { outline: none; border-color: var(--border-focus); box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
    input:hover:not(:focus) { border-color: #cbd5e1; }

    /* IDP preset chips */
    .preset-row { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
    .preset-chip { display: flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.75rem; font-size: 0.78rem; font-weight: 500; background: var(--surface-2); border: 1px solid var(--border); border-radius: 99px; cursor: pointer; color: var(--text-secondary); transition: all 0.15s; font-family: inherit; }
    .preset-chip:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
    .preset-chip svg { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

    /* Note / info strip */
    .field-note { display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.78rem; color: var(--warn-text); background: var(--warn-bg); border: 1px solid var(--warn-border); border-radius: 6px; padding: 0.5rem 0.75rem; margin-top: 0.5rem; }
    .info-strip { display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.82rem; color: #1e40af; background: var(--accent-light); border: 1px solid var(--accent-border); border-radius: 8px; padding: 0.65rem 0.875rem; }
    .info-strip svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; margin-top: 1px; }

    /* Actions bar */
    .actions-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.25rem 1.5rem; box-shadow: var(--shadow-sm); display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
    .btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.6rem 1.25rem; border-radius: var(--radius-sm); font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: all 0.15s; font-family: inherit; border: none; text-decoration: none; }
    .btn-primary { background: var(--accent); color: #fff; box-shadow: 0 1px 3px rgba(99,102,241,0.3); }
    .btn-primary:hover { background: var(--accent-hover); box-shadow: 0 4px 12px rgba(99,102,241,0.35); transform: translateY(-1px); }
    .btn-primary:active { transform: translateY(0); }
    .btn-ghost { background: var(--surface); color: var(--text-secondary); border: 1px solid var(--border); }
    .btn-ghost:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
    .btn svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

    /* Test results */
    #test-results { margin-top: 1rem; }
    .check-list { display: flex; flex-direction: column; gap: 0.4rem; }
    .check-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; padding: 0.4rem 0.6rem; border-radius: 6px; }
    .check-ok { background: var(--success-bg); color: var(--success-text); }
    .check-fail { background: var(--error-bg); color: var(--error-text); }
    .check-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .check-ok .check-dot { background: #22c55e; }
    .check-fail .check-dot { background: #ef4444; }

    /* Divider */
    .section-divider { height: 1px; background: var(--border); margin: 1.25rem 0; }

    @media (max-width: 560px) {
      .form-grid { grid-template-columns: 1fr; }
      .form-grid .form-group.full { grid-column: span 1; }
      .page { padding: 1.5rem 1rem 4rem; }
    }
  </style>
</head>
<body>

<header class="header">
  <div class="header-logo">
    <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
  </div>
  <span class="header-title">MCP Connector</span>
  <span class="header-badge">${isSetupMode ? "Setup" : "Settings"}</span>
</header>

<div class="page">

  <div class="page-heading">
    <h1>${isSetupMode ? "Connect to Claude.ai" : "Settings"}</h1>
    <p>${isSetupMode
		? "Configure your identity provider and Drupal MCP endpoint. You'll be redirected to authenticate after saving."
		: "Manage your OIDC provider, Drupal endpoint, and client credentials."
	}</p>
  </div>

  ${isSetupMode ? `
  <div class="steps">
    <div class="step active">
      <div class="step-num">1</div>
      <div class="step-label">Configure</div>
    </div>
    <div class="step-line"></div>
    <div class="step inactive">
      <div class="step-num">2</div>
      <div class="step-label">Authenticate</div>
    </div>
    <div class="step-line"></div>
    <div class="step inactive">
      <div class="step-num">3</div>
      <div class="step-label">Connected</div>
    </div>
  </div>` : ""}

  ${errors.length > 0 ? `
  <div class="alert alert-error">
    <svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <div class="alert-content">
      <strong>Please fix these errors:</strong>
      <ul>${errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
    </div>
  </div>` : ""}

  ${success ? `
  <div class="alert alert-success">
    <svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
    <div class="alert-content"><strong>Settings saved successfully.</strong></div>
  </div>` : ""}

  <!-- Connection URLs -->
  <div class="card">
    <div class="card-header">
      <div class="card-icon card-icon-blue">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      </div>
      <div>
        <div class="card-title">Connection URLs</div>
        <div class="card-subtitle">Use these in Claude.ai and your IDP</div>
      </div>
    </div>

    <div class="url-block">
      <div class="url-block-label">MCP Server URL</div>
      <div class="url-row">
        <span class="url-text" id="mcp-url">${esc(mcpUrl)}</span>
        <button type="button" class="copy-btn" onclick="copyUrl('mcp-url', this)">Copy</button>
      </div>
      <p class="url-hint">Add to Claude.ai → Settings → Integrations → Add integration</p>
    </div>

    <div class="section-divider"></div>

    <div class="url-block">
      <div class="url-block-label">OAuth Callback URL</div>
      <div class="url-row">
        <span class="url-text" id="callback-url">${esc(callbackUrl)}</span>
        <button type="button" class="copy-btn" onclick="copyUrl('callback-url', this)">Copy</button>
      </div>
      <p class="url-hint">Register as <strong>Redirect / Callback URI</strong> in your IDP OAuth application</p>
    </div>
  </div>

  <form method="POST" action="${formAction}">
    ${isSetupMode ? `<input type="hidden" name="setupToken" value="${esc(setupToken ?? "")}">` : ""}

    <!-- Target site -->
    <div class="card">
      <div class="card-header">
        <div class="card-icon card-icon-green">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        </div>
        <div>
          <div class="card-title">Target Site</div>
          <div class="card-subtitle">Your Drupal site and MCP endpoint</div>
        </div>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label class="field-label" for="siteUrl">Site Base URL</label>
          <input type="url" id="siteUrl" name="siteUrl" value="${esc(config.siteUrl)}" placeholder="https://your-drupal-site.com" oninput="autofillMcpUrl(this.value)">
        </div>
        <div class="form-group">
          <label class="field-label" for="mcpEndpointUrl">MCP Endpoint URL</label>
          <input type="url" id="mcpEndpointUrl" name="mcpEndpointUrl" value="${esc(config.mcpEndpointUrl)}" placeholder="https://your-drupal-site.com/mcp">
        </div>
      </div>
      <div class="info-strip">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>Tools are fetched dynamically from the Drupal MCP server on every connection — no manual tool configuration needed.</span>
      </div>
    </div>

    <!-- OIDC IDP -->
    <div class="card">
      <div class="card-header">
        <div class="card-icon card-icon-purple">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <div>
          <div class="card-title">Identity Provider (OIDC)</div>
          <div class="card-subtitle">OAuth 2.0 / OpenID Connect settings</div>
        </div>
      </div>

      <div class="preset-row">
        <button type="button" class="preset-chip" onclick="autofillIdp('miniorange')">
          <svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          miniOrange
        </button>
        <button type="button" class="preset-chip" onclick="autofillIdp('azure')">
          <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          Azure AD
        </button>
        <button type="button" class="preset-chip" onclick="autofillIdp('keycloak')">
          <svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 4a6 6 0 1 1-6 6 6 6 0 0 1 6-6z"/></svg>
          Keycloak
        </button>
      </div>

      <div class="form-grid">
        <div class="form-group">
          <label class="field-label" for="idpName">IDP Display Name</label>
          <input type="text" id="idpName" name="idpName" value="${esc(config.idpName)}" placeholder="e.g. miniOrange, Azure AD">
        </div>
        <div class="form-group">
          <label class="field-label" for="oidcIssuer">OIDC Issuer URL <span class="field-optional">optional</span></label>
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
        <div class="form-group full">
          <label class="field-label" for="scopes">Scopes</label>
          <input type="text" id="scopes" name="scopes" value="${esc(config.scopes || "openid profile email")}" placeholder="openid profile email">
        </div>
      </div>
    </div>

    <!-- Client credentials -->
    <div class="card">
      <div class="card-header">
        <div class="card-icon card-icon-orange">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <div>
          <div class="card-title">Client Credentials</div>
          <div class="card-subtitle">OAuth app client ID and secret</div>
        </div>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label class="field-label" for="clientId">Client ID</label>
          <input type="text" id="clientId" name="clientId" value="${esc(config.clientId)}" placeholder="your-client-id" autocomplete="off">
        </div>
        <div class="form-group">
          <label class="field-label" for="clientSecret">Client Secret</label>
          <input type="password" id="clientSecret" name="clientSecret" value="${esc(secretValue)}" placeholder="your-client-secret" autocomplete="new-password">
        </div>
      </div>
      <div class="field-note">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <span>Stored encrypted in Cloudflare KV. Never logged. Leave the secret field unchanged to keep the existing value.</span>
      </div>
    </div>

    <!-- Actions -->
    <div class="actions-card">
      <button type="submit" class="btn btn-primary">
        <svg viewBox="0 0 24 24">${isSetupMode
			? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
			: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>'
		}</svg>
        ${isSetupMode ? "Save &amp; Authenticate" : "Save settings"}
      </button>
      <button type="button" class="btn btn-ghost" onclick="testConnection()">
        <svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        Test connection
      </button>
      <div id="test-results" style="width:100%"></div>
    </div>

  </form>
</div>

<script>
function copyUrl(id, btn) {
  navigator.clipboard.writeText(document.getElementById(id).textContent.trim()).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 1800);
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
    miniorange: 'Enter your miniOrange base URL\\n(e.g. https://your-domain.miniorange.com):',
    azure: 'Enter your Azure AD tenant ID:',
    keycloak: 'Enter your Keycloak realm base URL\\n(e.g. https://keycloak.example.com/realms/myrealm):',
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
  resultsDiv.innerHTML = '<p style="font-size:0.82rem;color:#64748b;padding:0.25rem 0">Testing endpoints&hellip;</p>';
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
    resultsDiv.innerHTML = '<div class="check-list">' + result.checks.map(c =>
      '<div class="check-item ' + (c.ok ? 'check-ok' : 'check-fail') + '">' +
      '<div class="check-dot"></div><span>' + c.label + '</span></div>'
    ).join('') + '</div>';
  } catch (e) {
    resultsDiv.innerHTML = '<p style="font-size:0.82rem;color:#991b1b;padding:0.25rem 0">Test failed: ' + e.message + '</p>';
  }
}
</script>
</body>
</html>`;
}
