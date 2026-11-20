import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceSecurity } from '../evidence/evidence-security.js';
import {
  EvidenceIngestionService,
  IEvidenceIngestionRepository
} from '../evidence/evidence-ingestion.service.js';
import {
  GmailSyncService,
  IGmailSyncRepository
} from './gmail-sync.service.js';
import {
  GmailOAuthService,
  IOAuthHttpTransport
} from './gmail-oauth.service.js';
import {
  IGmailClient,
  GmailListMessagesResponse
} from './gmail-client.js';

class MockGmailClient implements IGmailClient {
  public listResponses: Map<string, GmailListMessagesResponse> = new Map();
  public messageResponses: Map<string, any> = new Map();
  public getMessageCalls: string[] = [];
  public listCalls: Array<{ q?: string; pageToken?: string }> = [];

  async listMessages(
    _accessToken: string,
    options?: { q?: string; pageToken?: string; maxResults?: number }
  ): Promise<GmailListMessagesResponse> {
    this.listCalls.push({ q: options?.q, pageToken: options?.pageToken });
    const key = options?.pageToken || 'default';
    return (
      this.listResponses.get(key) || {
        messages: [],
        nextPageToken: undefined
      }
    );
  }

  async getMessage(_accessToken: string, messageId: string): Promise<any> {
    this.getMessageCalls.push(messageId);
    return this.messageResponses.get(messageId) || { id: messageId };
  }
}

class MockGmailSyncRepository implements IGmailSyncRepository {
  public integrations: Map<string, any> = new Map();
  public templates: Map<string, any[]> = new Map();
  public evidenceStore: Map<string, any> = new Map();

  async findIntegration(merchantId: string, type: string): Promise<any> {
    const key = `${merchantId}:${type}`;
    return this.integrations.get(key) || null;
  }

  async saveIntegration(integration: any): Promise<any> {
    const key = `${integration.merchantId}:${integration.type}`;
    this.integrations.set(key, integration);
    return integration;
  }

  async findApprovedTemplates(merchantId: string, _channel: string): Promise<any[]> {
    return this.templates.get(merchantId) || [];
  }

  async findEvidenceByDeduplicationHash(merchantId: string, deduplicationHash: string): Promise<any> {
    return this.evidenceStore.get(`${merchantId}:${deduplicationHash}`) || null;
  }
}

class MockIngestionRepo implements IEvidenceIngestionRepository {
  public evidenceMap: Map<string, any> = new Map();
  public attempts: any[] = [];
  private counter = 1;

  async findEvidenceByDeduplicationHash(merchantId: string, deduplicationHash: string): Promise<any> {
    return this.evidenceMap.get(`${merchantId}:${deduplicationHash}`) || null;
  }

  async createEvidence(merchantId: string, data: any): Promise<any> {
    const id = `evi_${this.counter++}`;
    const rec = { _id: id, id, merchantId, ...data };
    this.evidenceMap.set(`${merchantId}:${data.deduplicationHash}`, rec);
    return rec;
  }

  async createAttempt(merchantId: string, data: any): Promise<any> {
    const id = `att_${this.counter++}`;
    const rec = { _id: id, id, merchantId, ...data };
    this.attempts.push(rec);
    return rec;
  }
}

class MockTransport implements IOAuthHttpTransport {
  async post(_url: string, _data: any): Promise<{ status: number; data: any }> {
    return { status: 200, data: { access_token: 'refreshed_access_token', expires_in: 3600 } };
  }
  async get(_url: string, _headers: any): Promise<{ status: number; data: any }> {
    return { status: 200, data: { email: 'merchant@gmail.com' } };
  }
}

describe('Phase 2B — Gmail Synchronization & Normalization Engine', () => {
  const merchantId = 'mer_tenant_sync_01';

  test('constructs targeted financial query and processes credit emails into normalized evidence', async () => {
    const syncRepo = new MockGmailSyncRepository();
    const ingestRepo = new MockIngestionRepo();
    const ingestionService = new EvidenceIngestionService(ingestRepo);
    const gmailClient = new MockGmailClient();
    const oauthService = new GmailOAuthService(new MockTransport());

    // Setup active connected integration with encrypted tokens
    syncRepo.integrations.set(`${merchantId}:GMAIL`, {
      merchantId,
      type: 'GMAIL',
      status: 'CONNECTED',
      isActive: true,
      connectedEmail: 'merchant.shop@gmail.com',
      encryptedAccessToken: EvidenceSecurity.encryptPayload('valid_access_token'),
      encryptedRefreshToken: EvidenceSecurity.encryptPayload('valid_refresh_token'),
      tokenExpiresAt: new Date(Date.now() + 3600000),
      syncStats: { totalProcessed: 0, newEvidenceCount: 0, duplicatesCount: 0 }
    });

    // Setup mock messages in Gmail
    gmailClient.listResponses.set('default', {
      messages: [
        { id: 'msg_credit_01', threadId: 'th_01' },
        { id: 'msg_credit_02', threadId: 'th_02' }
      ]
    });

    gmailClient.messageResponses.set('msg_credit_01', {
      id: 'msg_credit_01',
      snippet: 'Rs 1,500 credited to your A/c XX9988. Ref: 123456789012',
      payload: {
        headers: [
          { name: 'From', value: 'alerts@hdfcbank.net' },
          { name: 'Subject', value: 'Credit Alert - Rs 1,500' },
          { name: 'Date', value: 'Thu, 12 Nov 2026 10:00:00 GMT' }
        ],
        body: {
          data: Buffer.from(
            'Dear Customer, your account XX9988 has been credited with INR 1,500.00. UPI Ref: 123456789012.'
          ).toString('base64url')
        }
      }
    });

    gmailClient.messageResponses.set('msg_credit_02', {
      id: 'msg_credit_02',
      snippet: 'Rs 250 received via UPI Ref 998877665544',
      payload: {
        headers: [
          { name: 'From', value: 'alerts@icicibank.com' },
          { name: 'Subject', value: 'UPI Credit Notice' }
        ],
        body: {
          data: Buffer.from('Rs 250 credited. UPI Ref: 998877665544.').toString('base64url')
        }
      }
    });

    const syncService = new GmailSyncService(oauthService, gmailClient, ingestionService, syncRepo);
    const summary = await syncService.sync(merchantId);

    assert.equal(summary.merchantId, merchantId);
    assert.equal(summary.totalProcessed, 2);
    assert.equal(summary.newEvidenceCount, 2);
    assert.equal(summary.duplicatesCount, 0);

    // Verify targeted search query
    assert.ok(gmailClient.listCalls[0]?.q?.includes('credited'));
    assert.ok(gmailClient.listCalls[0]?.q?.includes('after:'));

    // Verify evidence was stored under merchantId with UNMATCHED status
    assert.equal(ingestRepo.evidenceMap.size, 2);
    const firstEvidence = Array.from(ingestRepo.evidenceMap.values())[0];
    assert.equal(firstEvidence.amountPaise, 150000);
    assert.equal(firstEvidence.utr, '123456789012');
    assert.equal(firstEvidence.currency, 'INR');
    assert.equal(firstEvidence.status, 'UNMATCHED');
    assert.equal(firstEvidence.accountIdentifier, '••••9988');
  });

  test('handles pagination across multiple Gmail result pages', async () => {
    const syncRepo = new MockGmailSyncRepository();
    const ingestRepo = new MockIngestionRepo();
    const ingestionService = new EvidenceIngestionService(ingestRepo);
    const gmailClient = new MockGmailClient();
    const oauthService = new GmailOAuthService(new MockTransport());

    syncRepo.integrations.set(`${merchantId}:GMAIL`, {
      merchantId,
      type: 'GMAIL',
      status: 'CONNECTED',
      isActive: true,
      encryptedAccessToken: EvidenceSecurity.encryptPayload('valid_access_token'),
      encryptedRefreshToken: EvidenceSecurity.encryptPayload('valid_refresh_token'),
      tokenExpiresAt: new Date(Date.now() + 3600000)
    });

    // Page 1 returns 1 message and nextPageToken
    gmailClient.listResponses.set('default', {
      messages: [{ id: 'page1_msg', threadId: 't1' }],
      nextPageToken: 'token_page_2'
    });

    // Page 2 returns 1 message with no further token
    gmailClient.listResponses.set('token_page_2', {
      messages: [{ id: 'page2_msg', threadId: 't2' }]
    });

    gmailClient.messageResponses.set('page1_msg', {
      id: 'page1_msg',
      snippet: 'Rs 100 credited. UPI Ref: 111122223333',
      payload: {
        headers: [{ name: 'From', value: 'alerts@bank.com' }],
        body: { data: Buffer.from('Rs 100 credited. UPI Ref: 111122223333').toString('base64url') }
      }
    });

    gmailClient.messageResponses.set('page2_msg', {
      id: 'page2_msg',
      snippet: 'Rs 200 credited. UPI Ref: 444455556666',
      payload: {
        headers: [{ name: 'From', value: 'alerts@bank.com' }],
        body: { data: Buffer.from('Rs 200 credited. UPI Ref: 444455556666').toString('base64url') }
      }
    });

    const syncService = new GmailSyncService(oauthService, gmailClient, ingestionService, syncRepo);
    const summary = await syncService.sync(merchantId);

    assert.equal(summary.totalProcessed, 2);
    assert.equal(summary.newEvidenceCount, 2);
    assert.equal(gmailClient.listCalls.length, 2);
    assert.equal(gmailClient.listCalls[1]?.pageToken, 'token_page_2');
  });

  test('skips full message fetch when message ID is already ingested (quota saving deduplication)', async () => {
    const syncRepo = new MockGmailSyncRepository();
    const ingestRepo = new MockIngestionRepo();
    const ingestionService = new EvidenceIngestionService(ingestRepo);
    const gmailClient = new MockGmailClient();
    const oauthService = new GmailOAuthService(new MockTransport());

    syncRepo.integrations.set(`${merchantId}:GMAIL`, {
      merchantId,
      type: 'GMAIL',
      status: 'CONNECTED',
      isActive: true,
      encryptedAccessToken: EvidenceSecurity.encryptPayload('valid_access_token'),
      encryptedRefreshToken: EvidenceSecurity.encryptPayload('valid_refresh_token'),
      tokenExpiresAt: new Date(Date.now() + 3600000)
    });

    // Pre-populate repository with existing duplicate
    const dupeHash = EvidenceSecurity.computeDeduplicationHash(merchantId, 'EMAIL', 'GMAIL', 'msg_already_synced');
    syncRepo.evidenceStore.set(`${merchantId}:${dupeHash}`, {
      _id: 'existing_evi_1',
      status: 'UNMATCHED'
    });

    gmailClient.listResponses.set('default', {
      messages: [{ id: 'msg_already_synced', threadId: 't1' }]
    });

    const syncService = new GmailSyncService(oauthService, gmailClient, ingestionService, syncRepo);
    const summary = await syncService.sync(merchantId);

    assert.equal(summary.totalProcessed, 1);
    assert.equal(summary.duplicatesCount, 1);
    assert.equal(summary.newEvidenceCount, 0);

    // CRITICAL: getMessage was NOT called for duplicate message
    assert.equal(gmailClient.getMessageCalls.length, 0);
  });

  test('classifies debit alerts as DEBIT and marks REJECTED (never payment evidence)', async () => {
    const syncRepo = new MockGmailSyncRepository();
    const ingestRepo = new MockIngestionRepo();
    const ingestionService = new EvidenceIngestionService(ingestRepo);
    const gmailClient = new MockGmailClient();
    const oauthService = new GmailOAuthService(new MockTransport());

    syncRepo.integrations.set(`${merchantId}:GMAIL`, {
      merchantId,
      type: 'GMAIL',
      status: 'CONNECTED',
      isActive: true,
      encryptedAccessToken: EvidenceSecurity.encryptPayload('valid_access_token'),
      encryptedRefreshToken: EvidenceSecurity.encryptPayload('valid_refresh_token'),
      tokenExpiresAt: new Date(Date.now() + 3600000)
    });

    gmailClient.listResponses.set('default', {
      messages: [{ id: 'msg_debit_01', threadId: 't1' }]
    });

    gmailClient.messageResponses.set('msg_debit_01', {
      id: 'msg_debit_01',
      snippet: 'Account XX1234 debited by INR 350.00',
      payload: {
        headers: [{ name: 'From', value: 'alerts@sbi.co.in' }],
        body: {
          data: Buffer.from(
            'Dear Customer, your account XX1234 has been debited by INR 350.00 for purchase at Store.'
          ).toString('base64url')
        }
      }
    });

    const syncService = new GmailSyncService(oauthService, gmailClient, ingestionService, syncRepo);
    const summary = await syncService.sync(merchantId);

    assert.equal(summary.totalProcessed, 1);
    assert.equal(summary.debitsCount, 1);
    assert.equal(summary.newEvidenceCount, 0);

    const storedEvidence = Array.from(ingestRepo.evidenceMap.values())[0];
    assert.equal(storedEvidence.transactionType, 'DEBIT');
    assert.equal(storedEvidence.status, 'REJECTED');
    assert.equal(storedEvidence.rejectionReason, 'DEBIT_TRANSACTION_IGNORED');
  });

  test('handles revoked refresh token by marking integration REVOKED with redacted error', async () => {
    const syncRepo = new MockGmailSyncRepository();
    const ingestRepo = new MockIngestionRepo();
    const ingestionService = new EvidenceIngestionService(ingestRepo);
    const gmailClient = new MockGmailClient();

    // Transport simulating revoked credentials (invalid_grant)
    const revokedTransport: IOAuthHttpTransport = {
      async post() {
        return { status: 400, data: { error: 'invalid_grant' } };
      },
      async get() {
        return { status: 400, data: {} };
      }
    };
    const oauthService = new GmailOAuthService(revokedTransport);

    const integrationRecord = {
      merchantId,
      type: 'GMAIL',
      status: 'CONNECTED',
      isActive: true,
      encryptedRefreshToken: EvidenceSecurity.encryptPayload('revoked_refresh_token'),
      tokenExpiresAt: new Date(Date.now() - 1000) // Expired to force refresh
    };
    syncRepo.integrations.set(`${merchantId}:GMAIL`, integrationRecord);

    const syncService = new GmailSyncService(oauthService, gmailClient, ingestionService, syncRepo);

    await assert.rejects(
      () => syncService.sync(merchantId),
      /GOOGLE_REFRESH_TOKEN_REVOKED/
    );

    // Verify integration status transitioned to REVOKED
    const updated = syncRepo.integrations.get(`${merchantId}:GMAIL`);
    assert.equal(updated.status, 'REVOKED');
    assert.equal(updated.lastSyncStatus, 'FAILED');
    assert.ok(updated.lastSyncError?.includes('revoked'));
  });

  test('enforces merchant isolation: merchant B cannot sync merchant A integration', async () => {
    const syncRepo = new MockGmailSyncRepository();
    const ingestRepo = new MockIngestionRepo();
    const ingestionService = new EvidenceIngestionService(ingestRepo);
    const gmailClient = new MockGmailClient();
    const oauthService = new GmailOAuthService(new MockTransport());

    syncRepo.integrations.set('mer_tenant_A:GMAIL', {
      merchantId: 'mer_tenant_A',
      type: 'GMAIL',
      status: 'CONNECTED',
      isActive: true,
      encryptedRefreshToken: EvidenceSecurity.encryptPayload('token_A')
    });

    const syncService = new GmailSyncService(oauthService, gmailClient, ingestionService, syncRepo);

    // Merchant B attempts to sync
    await assert.rejects(
      () => syncService.sync('mer_tenant_B'),
      /Gmail integration not active or disconnected for this merchant/
    );
  });
});
