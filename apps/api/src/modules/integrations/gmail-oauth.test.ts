import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  GmailOAuthService,
  IOAuthHttpTransport
} from './gmail-oauth.service.js';

class MockOAuthTransport implements IOAuthHttpTransport {
  public postResponses: Map<string, { status: number; data: any }> = new Map();
  public getResponses: Map<string, { status: number; data: any }> = new Map();
  public postCalls: Array<{ url: string; data: Record<string, string> }> = [];

  async post(url: string, data: Record<string, string>): Promise<{ status: number; data: any }> {
    this.postCalls.push({ url, data });
    const match = this.postResponses.get(url) || { status: 200, data: {} };
    return match;
  }

  async get(url: string, _headers: Record<string, string>): Promise<{ status: number; data: any }> {
    const match = this.getResponses.get(url) || { status: 200, data: {} };
    return match;
  }
}

describe('Phase 2B — Gmail OAuth & Security Integration', () => {
  const merchantId = 'mer_tenant_1001';

  test('generates signed OAuth state and verifies integrity successfully', () => {
    const service = new GmailOAuthService();
    const state = service.generateState(merchantId);

    assert.ok(typeof state === 'string');
    assert.ok(state.includes('.'));

    const verified = service.verifyState(state);
    assert.equal(verified.merchantId, merchantId);
    assert.ok(verified.nonce.length >= 16);
    assert.ok(Date.now() - verified.timestamp < 1000);
  });

  test('rejects tampered OAuth state tokens (CSRF protection)', () => {
    const service = new GmailOAuthService();
    const validState = service.generateState(merchantId);
    const [, sig] = validState.split('.');

    // Tamper with payload
    const tamperedPayload = Buffer.from(
      JSON.stringify({ merchantId: 'mer_attacker', nonce: 'fake', timestamp: Date.now() })
    ).toString('base64url');
    const tamperedState = `${tamperedPayload}.${sig}`;

    assert.throws(
      () => service.verifyState(tamperedState),
      /OAuth state signature mismatch/
    );
  });

  test('rejects expired OAuth state tokens', () => {
    const service = new GmailOAuthService();
    const state = service.generateState(merchantId);

    // Verify with maxAgeMs = 0 (immediately expired)
    assert.throws(
      () => service.verifyState(state, -1000),
      /OAuth state has expired/
    );
  });

  test('constructs Google authorization URL with minimal readonly scope', () => {
    const service = new GmailOAuthService();
    const { url, state } = service.getAuthorizationUrl(merchantId);

    assert.ok(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth'));
    assert.ok(url.includes('response_type=code'));
    assert.ok(url.includes('access_type=offline'));
    assert.ok(url.includes('prompt=consent'));
    assert.ok(url.includes('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.readonly'));
    assert.ok(url.includes(`state=${encodeURIComponent(state)}`));
  });

  test('exchanges authorization code for tokens securely via backend transport', async () => {
    const mockTransport = new MockOAuthTransport();
    mockTransport.postResponses.set('https://oauth2.googleapis.com/token', {
      status: 200,
      data: {
        access_token: 'ya29.mock_access_token_xyz',
        refresh_token: '1//mock_refresh_token_abc',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/gmail.readonly'
      }
    });

    const service = new GmailOAuthService(mockTransport);
    const tokens = await service.exchangeCodeForTokens('mock_auth_code_123');

    assert.equal(tokens.accessToken, 'ya29.mock_access_token_xyz');
    assert.equal(tokens.refreshToken, '1//mock_refresh_token_abc');
    assert.equal(tokens.expiresIn, 3600);
    assert.equal(mockTransport.postCalls.length, 1);
    assert.equal(mockTransport.postCalls[0]?.data.code, 'mock_auth_code_123');
    assert.equal(mockTransport.postCalls[0]?.data.grant_type, 'authorization_code');
  });

  test('refreshes expired access tokens successfully', async () => {
    const mockTransport = new MockOAuthTransport();
    mockTransport.postResponses.set('https://oauth2.googleapis.com/token', {
      status: 200,
      data: {
        access_token: 'ya29.refreshed_access_token_456',
        expires_in: 3600
      }
    });

    const service = new GmailOAuthService(mockTransport);
    const refreshed = await service.refreshAccessToken('1//mock_stored_refresh_token');

    assert.equal(refreshed.accessToken, 'ya29.refreshed_access_token_456');
    assert.equal(refreshed.expiresIn, 3600);
  });

  test('detects revoked refresh token (invalid_grant) and throws identifiable error', async () => {
    const mockTransport = new MockOAuthTransport();
    mockTransport.postResponses.set('https://oauth2.googleapis.com/token', {
      status: 400,
      data: {
        error: 'invalid_grant',
        error_description: 'Token has been expired or revoked.'
      }
    });

    const service = new GmailOAuthService(mockTransport);
    await assert.rejects(
      () => service.refreshAccessToken('revoked_refresh_token'),
      /GOOGLE_REFRESH_TOKEN_REVOKED/
    );
  });

  test('encrypts and decrypts OAuth tokens at rest using AES-256-GCM', () => {
    const rawTokens = {
      accessToken: 'ya29.sensitive_access_token_987654321',
      refreshToken: '1//sensitive_refresh_token_123456789'
    };

    const encrypted = GmailOAuthService.encryptTokens(rawTokens);

    // Verify tokens are not stored in plaintext
    assert.notEqual(encrypted.encryptedAccessToken, rawTokens.accessToken);
    assert.notEqual(encrypted.encryptedRefreshToken, rawTokens.refreshToken);
    assert.ok(encrypted.encryptedAccessToken.includes(':'));
    assert.ok(encrypted.encryptedRefreshToken?.includes(':'));

    // Decrypt and verify exact restoration
    const decryptedAccess = GmailOAuthService.decryptToken(encrypted.encryptedAccessToken);
    const decryptedRefresh = GmailOAuthService.decryptToken(encrypted.encryptedRefreshToken!);

    assert.equal(decryptedAccess, rawTokens.accessToken);
    assert.equal(decryptedRefresh, rawTokens.refreshToken);
  });

  test('fetches connected Gmail address from userinfo endpoint', async () => {
    const mockTransport = new MockOAuthTransport();
    mockTransport.getResponses.set('https://www.googleapis.com/oauth2/v2/userinfo', {
      status: 200,
      data: { email: 'business.merchant@gmail.com' }
    });

    const service = new GmailOAuthService(mockTransport);
    const email = await service.fetchConnectedEmail('mock_access_token');

    assert.equal(email, 'business.merchant@gmail.com');
  });
});
