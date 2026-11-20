import crypto from 'node:crypto';
import { config } from '../../config/index.js';
import { EvidenceSecurity } from '../evidence/evidence-security.js';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scope: string;
}

export interface StatePayload {
  merchantId: string;
  nonce: string;
  timestamp: number;
}

export interface IOAuthHttpTransport {
  post(url: string, data: Record<string, string>): Promise<{ status: number; data: any }>;
  get(url: string, headers: Record<string, string>): Promise<{ status: number; data: any }>;
}

export class DefaultOAuthHttpTransport implements IOAuthHttpTransport {
  async post(url: string, data: Record<string, string>): Promise<{ status: number; data: any }> {
    const body = new URLSearchParams(data).toString();
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const json = await response.json().catch(() => ({}));
    return { status: response.status, data: json };
  }

  async get(url: string, headers: Record<string, string>): Promise<{ status: number; data: any }> {
    const response = await fetch(url, { method: 'GET', headers });
    const json = await response.json().catch(() => ({}));
    return { status: response.status, data: json };
  }
}

export class GmailOAuthService {
  private transport: IOAuthHttpTransport;

  constructor(transport: IOAuthHttpTransport = new DefaultOAuthHttpTransport()) {
    this.transport = transport;
  }

  /**
   * Generates a tamper-proof CSRF state token containing merchant context.
   */
  public generateState(merchantId: string): string {
    const payload: StatePayload = {
      merchantId,
      nonce: crypto.randomBytes(16).toString('hex'),
      timestamp: Date.now()
    };
    const raw = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', config.SESSION_SECRET)
      .update(raw)
      .digest('base64url');
    return `${raw}.${signature}`;
  }

  /**
   * Validates state signature and expiry (10-minute window).
   * Returns authenticated merchantId or throws CSRF error.
   */
  public verifyState(state: string, maxAgeMs: number = 600000): StatePayload {
    if (!state || typeof state !== 'string') {
      throw new Error('OAuth state is missing or invalid.');
    }

    const parts = state.split('.');
    if (parts.length !== 2) {
      throw new Error('Invalid OAuth state format.');
    }

    const [raw, signature] = parts;
    if (!raw || !signature) {
      throw new Error('Malformed OAuth state segments.');
    }

    const expectedSignature = crypto
      .createHmac('sha256', config.SESSION_SECRET)
      .update(raw)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      throw new Error('OAuth state signature mismatch: Possible CSRF attack.');
    }

    let payload: StatePayload;
    try {
      payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    } catch {
      throw new Error('Failed to deserialize OAuth state payload.');
    }

    if (Date.now() - payload.timestamp > maxAgeMs) {
      throw new Error('OAuth state has expired. Please initiate connection again.');
    }

    if (!payload.merchantId) {
      throw new Error('OAuth state missing merchant context.');
    }

    return payload;
  }

  /**
   * Constructs the Google OAuth 2.0 authorization URL with minimal Gmail readonly scope.
   */
  public getAuthorizationUrl(merchantId: string): { url: string; state: string } {
    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_OAUTH_REDIRECT_URI) {
      throw new Error('Google OAuth credentials not configured. Please check environment variables.');
    }

    const state = this.generateState(merchantId);
    const params = new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      redirect_uri: config.GOOGLE_OAUTH_REDIRECT_URI,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email',
      access_type: 'offline', // Mandatory for refresh token
      prompt: 'consent', // Mandatory to ensure refresh token is returned on re-auth
      state
    });

    return {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      state
    };
  }

  /**
   * Exchanges authorization code for tokens securely on the backend.
   */
  public async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_OAUTH_REDIRECT_URI) {
      throw new Error('Google OAuth credentials not configured on backend.');
    }

    const res = await this.transport.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      redirect_uri: config.GOOGLE_OAUTH_REDIRECT_URI,
      grant_type: 'authorization_code'
    });

    if (res.status !== 200 || !res.data.access_token) {
      const errorMsg = res.data.error_description || res.data.error || 'Failed to exchange authorization code';
      throw new Error(`Google OAuth token exchange failed [${res.status}]: ${errorMsg}`);
    }

    return {
      accessToken: res.data.access_token,
      refreshToken: res.data.refresh_token,
      expiresIn: res.data.expires_in || 3600,
      scope: res.data.scope || ''
    };
  }

  /**
   * Refreshes an expired access token using the stored refresh token.
   */
  public async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
      throw new Error('Google OAuth credentials not configured on backend.');
    }

    const res = await this.transport.post('https://oauth2.googleapis.com/token', {
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    if (res.status !== 200 || !res.data.access_token) {
      const errorDesc = res.data.error_description || res.data.error || 'Token refresh failed';
      if (res.data.error === 'invalid_grant') {
        throw new Error('GOOGLE_REFRESH_TOKEN_REVOKED: Refresh token has been revoked or expired.');
      }
      throw new Error(`Failed to refresh Google access token [${res.status}]: ${errorDesc}`);
    }

    return {
      accessToken: res.data.access_token,
      expiresIn: res.data.expires_in || 3600
    };
  }

  /**
   * Revokes token with Google upon disconnection.
   */
  public async revokeToken(token: string): Promise<boolean> {
    try {
      const res = await this.transport.post('https://oauth2.googleapis.com/revoke', {
        token
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Fetches user profile to identify the connected Gmail address.
   */
  public async fetchConnectedEmail(accessToken: string): Promise<string> {
    const res = await this.transport.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      Authorization: `Bearer ${accessToken}`
    });

    if (res.status === 200 && res.data.email) {
      return res.data.email;
    }

    // Fallback to Gmail user profile
    const profileRes = await this.transport.get('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      Authorization: `Bearer ${accessToken}`
    });

    if (profileRes.status === 200 && profileRes.data.emailAddress) {
      return profileRes.data.emailAddress;
    }

    throw new Error('Failed to retrieve email address for connected Google account.');
  }

  /**
   * Encrypts tokens for database persistence at rest.
   */
  public static encryptTokens(tokens: { accessToken: string; refreshToken?: string }): {
    encryptedAccessToken: string;
    encryptedRefreshToken?: string;
  } {
    return {
      encryptedAccessToken: EvidenceSecurity.encryptPayload(tokens.accessToken),
      encryptedRefreshToken: tokens.refreshToken
        ? EvidenceSecurity.encryptPayload(tokens.refreshToken)
        : undefined
    };
  }

  /**
   * Decrypts tokens from database persistence.
   */
  public static decryptToken(encryptedToken: string): string {
    return EvidenceSecurity.decryptPayload(encryptedToken);
  }
}

export const defaultGmailOAuthService = new GmailOAuthService();
