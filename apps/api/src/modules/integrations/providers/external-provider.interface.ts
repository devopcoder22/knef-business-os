export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresInSeconds?: number;
  scopes?: string[];
}

export interface ExternalAccountInfo {
  id: string;
  name: string;
  email?: string;
  pageId?: string;
  pageName?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderCapabilities {
  supportsOAuth: boolean;
  supportsApiKey: boolean;
  supportsRefreshToken: boolean;
  supportsWebhook: boolean;
  supportsPublishing: boolean;
  supportsAds: boolean;
}

export interface ExternalProviderInterface {
  readonly provider: string;
  readonly capabilities: ProviderCapabilities;

  getAuthorizationUrl(state: string, additionalScopes?: string[]): string;
  exchangeCode(code: string, shopDomain?: string): Promise<OAuthTokens>;
  refreshTokens(refreshToken: string): Promise<OAuthTokens>;
  getAccountInfo(accessToken: string, shopDomain?: string): Promise<ExternalAccountInfo>;
  revokeToken(accessToken: string): Promise<void>;
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean;
}
