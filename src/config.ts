export interface ConnectorConfig {
	siteUrl: string;
	mcpEndpointUrl: string;
	idpName: string;
	oidcIssuer: string;
	authorizeUrl: string;
	tokenUrl: string;
	userinfoUrl: string;
	jwksUrl: string;
	clientId: string;
	clientSecret: string;
	scopes: string;
	setupDone: boolean;
	savedAt?: string;
}

export const DEFAULT_CONFIG: ConnectorConfig = {
	siteUrl: "",
	mcpEndpointUrl: "",
	idpName: "",
	oidcIssuer: "",
	authorizeUrl: "",
	tokenUrl: "",
	userinfoUrl: "",
	jwksUrl: "",
	clientId: "",
	clientSecret: "",
	scopes: "openid profile email",
	setupDone: false,
};

export async function readConfig(kv: KVNamespace): Promise<ConnectorConfig> {
	const raw = await kv.get("connector:config");
	if (!raw) return { ...DEFAULT_CONFIG };
	try {
		const stored = JSON.parse(raw) as Partial<ConnectorConfig>;
		return { ...DEFAULT_CONFIG, ...stored };
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

export async function writeConfig(kv: KVNamespace, config: ConnectorConfig): Promise<void> {
	await kv.put("connector:config", JSON.stringify(config));
}

export function validateConfig(config: ConnectorConfig): string[] {
	const errors: string[] = [];
	if (!config.siteUrl) errors.push("Site URL is required");
	if (!config.mcpEndpointUrl) errors.push("MCP endpoint URL is required");
	if (!config.authorizeUrl) errors.push("Authorize URL is required");
	if (!config.tokenUrl) errors.push("Token URL is required");
	if (!config.userinfoUrl) errors.push("Userinfo URL is required");
	if (!config.clientId) errors.push("Client ID is required");
	if (!config.clientSecret) errors.push("Client secret is required");
	if (!config.scopes) errors.push("Scopes are required");
	return errors;
}
