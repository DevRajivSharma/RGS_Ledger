import { Router, Request, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth.js';
import { config } from '../../config/index.js';
import { MerchantIntegrationModel } from '../../database/models.js';
import { defaultGmailOAuthService, GmailOAuthService } from './gmail-oauth.service.js';
import { defaultGmailSyncService } from './gmail-sync.service.js';

export * from './gmail-oauth.service.js';
export * from './gmail-client.js';
export * from './gmail-sync.service.js';

const router = Router();

/**
 * GET /v1/integrations/gmail/connect - Initiates Google OAuth connection flow
 */
router.get('/gmail/connect', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { url, state } = defaultGmailOAuthService.getAuthorizationUrl(req.merchantId!);
    res.json({
      success: true,
      data: { authUrl: url, state },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'OAUTH_INITIATION_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * GET /v1/integrations/gmail/callback - Google OAuth callback handler
 */
router.get('/gmail/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const state = req.query.state as string;
  const oauthError = req.query.error as string;

  const frontendRedirectBase = `${config.FRONTEND_URL}/integrations/gmail`;

  if (oauthError) {
    res.redirect(`${frontendRedirectBase}?error=${encodeURIComponent(oauthError)}`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${frontendRedirectBase}?error=${encodeURIComponent('Missing OAuth code or state parameter')}`);
    return;
  }

  try {
    // 1. Verify cryptographic state and extract authenticated merchant context
    const statePayload = defaultGmailOAuthService.verifyState(state);
    const merchantId = statePayload.merchantId;

    // 2. Exchange authorization code for tokens
    const tokens = await defaultGmailOAuthService.exchangeCodeForTokens(code);

    // 3. Fetch user email identity from Google
    const connectedEmail = await defaultGmailOAuthService.fetchConnectedEmail(tokens.accessToken);

    // 4. Encrypt tokens at rest
    const encrypted = GmailOAuthService.encryptTokens({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    });

    // 5. Upsert integration in database
    const updateData: Record<string, any> = {
      connectedEmail,
      encryptedAccessToken: encrypted.encryptedAccessToken,
      tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      scope: tokens.scope,
      status: 'CONNECTED',
      isActive: true,
      lastSyncError: undefined
    };

    if (encrypted.encryptedRefreshToken) {
      updateData.encryptedRefreshToken = encrypted.encryptedRefreshToken;
    }

    await MerchantIntegrationModel.findOneAndUpdate(
      { merchantId, type: 'GMAIL' },
      { $set: updateData },
      { upsert: true, new: true }
    );

    res.redirect(
      `${frontendRedirectBase}?status=connected&email=${encodeURIComponent(connectedEmail)}`
    );
  } catch (err: any) {
    res.redirect(
      `${frontendRedirectBase}?error=${encodeURIComponent(err.message || 'OAuth verification failed')}`
    );
  }
});

/**
 * GET /v1/integrations/gmail/status - Retrieves Gmail integration status for merchant
 */
router.get('/gmail/status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const integration = await MerchantIntegrationModel.findOne({
      merchantId: req.merchantId!,
      type: 'GMAIL'
    });

    if (!integration || !integration.isActive || integration.status === 'DISCONNECTED') {
      res.json({
        success: true,
        data: {
          isConnected: false,
          status: 'DISCONNECTED',
          connectedEmail: null,
          lastSyncAt: null,
          lastSyncStatus: 'NEVER',
          lastSyncError: null,
          syncStats: { totalProcessed: 0, newEvidenceCount: 0, duplicatesCount: 0 }
        },
        meta: { timestamp: new Date().toISOString() }
      });
      return;
    }

    res.json({
      success: true,
      data: {
        isConnected: integration.status === 'CONNECTED',
        status: integration.status,
        connectedEmail: integration.connectedEmail || null,
        lastSyncAt: integration.lastSyncAt || null,
        lastSyncStatus: integration.lastSyncStatus || 'NEVER',
        lastSyncError: integration.lastSyncError || null,
        syncStats: integration.syncStats || { totalProcessed: 0, newEvidenceCount: 0, duplicatesCount: 0 }
      },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_STATUS_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * POST /v1/integrations/gmail/sync - Triggers synchronization of transaction alert emails
 */
router.post('/gmail/sync', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const lookbackDays = req.body?.lookbackDays ? parseInt(req.body.lookbackDays, 10) : undefined;
    const maxMessages = req.body?.maxMessages ? parseInt(req.body.maxMessages, 10) : undefined;

    const result = await defaultGmailSyncService.sync(req.merchantId!, {
      lookbackDays,
      maxMessages
    });

    res.json({
      success: true,
      data: result,
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: 'SYNC_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

/**
 * DELETE /v1/integrations/gmail/disconnect - Disconnects Gmail and revokes OAuth tokens
 */
router.delete('/gmail/disconnect', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const integration = await MerchantIntegrationModel.findOne({
      merchantId: req.merchantId!,
      type: 'GMAIL'
    });

    if (integration) {
      if (integration.encryptedRefreshToken) {
        try {
          const refreshToken = GmailOAuthService.decryptToken(integration.encryptedRefreshToken);
          await defaultGmailOAuthService.revokeToken(refreshToken);
        } catch {
          // Continue cleanup even if Google revoke endpoint fails
        }
      }

      integration.status = 'DISCONNECTED';
      integration.encryptedAccessToken = undefined;
      integration.encryptedRefreshToken = undefined;
      integration.tokenExpiresAt = undefined;
      integration.lastSyncStatus = 'NEVER';
      await integration.save();
    }

    res.json({
      success: true,
      message: 'Gmail integration disconnected successfully.',
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: 'DISCONNECT_FAILED', message: err.message },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

export const integrationsRouter = router;
