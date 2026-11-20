import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { createApp } from '../../app.js';
import { security } from '../../utils/security.js';
import { UserModel, MerchantModel, DevicePairingCodeModel, AndroidDeviceModel, PaymentEvidenceModel } from '../../database/models.js';

describe('Devices API Route Registration & JSON Verification', () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('1. POST /api/v1/devices/generate-pairing-code returns JSON 401 when unauthenticated (never HTML 404)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/devices/generate-pairing-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.includes('application/json'), `Expected application/json, got ${contentType}`);
    assert.strictEqual(res.status, 401);

    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error?.code, 'UNAUTHORIZED');
  });

  it('2. GET /api/v1/devices returns JSON 401 when unauthenticated (never HTML 404)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/devices`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.includes('application/json'), `Expected application/json, got ${contentType}`);
    assert.strictEqual(res.status, 401);

    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error?.code, 'UNAUTHORIZED');
  });

  it('3. GET /api/v1/devices/notification-sources returns JSON 401 when unauthenticated (never HTML 404)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/devices/notification-sources`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.includes('application/json'), `Expected application/json, got ${contentType}`);
    assert.strictEqual(res.status, 401);

    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error?.code, 'UNAUTHORIZED');
  });

  it('4. POST /api/v1/devices/pair routes properly and returns JSON 400 validation error on empty payload', async () => {
    const res = await fetch(`${baseUrl}/api/v1/devices/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.includes('application/json'), `Expected application/json, got ${contentType}`);
    assert.strictEqual(res.status, 400);

    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.ok(body.error);
  });

  it('5. POST /api/v1/devices/sync returns JSON 401 when unauthenticated', async () => {
    const res = await fetch(`${baseUrl}/api/v1/devices/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] })
    });

    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.includes('application/json'), `Expected application/json, got ${contentType}`);
    assert.strictEqual(res.status, 401);
  });

  it('6. POST /api/v1/devices/heartbeat returns JSON 401 when device token is missing', async () => {
    const res = await fetch(`${baseUrl}/api/v1/devices/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.includes('application/json'), `Expected application/json, got ${contentType}`);
    assert.strictEqual(res.status, 401);
  });

  it('7. Authenticated POST /api/v1/devices/generate-pairing-code generates 8-char pairing code and returns JSON 201', async () => {
    // Mock user & merchant lookups
    const dummyUserId = '507f1f77bcf86cd799439011';
    const dummyMerchantId = '507f1f77bcf86cd799439012';

    const origUserFindById = UserModel.findById;
    const origMerchantFindById = MerchantModel.findById;
    const origCodeUpdateMany = DevicePairingCodeModel.updateMany;
    const origCodeCreate = DevicePairingCodeModel.create;

    try {
      (UserModel as any).findById = () => ({
        lean: () => Promise.resolve({ _id: dummyUserId, status: 'ACTIVE', email: 'merchant@test.com' })
      });

      (MerchantModel as any).findById = () => ({
        lean: () => Promise.resolve({ _id: dummyMerchantId, name: 'Test Merchant Store', status: 'ACTIVE' })
      });

      (DevicePairingCodeModel as any).updateMany = () => Promise.resolve({ modifiedCount: 1 });
      (DevicePairingCodeModel as any).create = (doc: any) => Promise.resolve({ ...doc, _id: 'code_123' });

      const token = security.generateAccessToken({
        userId: dummyUserId,
        merchantId: dummyMerchantId,
        role: 'MERCHANT'
      });

      const res = await fetch(`${baseUrl}/api/v1/devices/generate-pairing-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const contentType = res.headers.get('content-type') || '';
      assert.ok(contentType.includes('application/json'), `Expected application/json, got ${contentType}`);
      assert.strictEqual(res.status, 201);

      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(typeof json.data.pairingCode, 'string');
      assert.strictEqual(json.data.pairingCode.length, 8);
      assert.strictEqual(json.data.merchantName, 'Test Merchant Store');
      assert.ok(json.data.expiresAt);
    } finally {
      UserModel.findById = origUserFindById;
      MerchantModel.findById = origMerchantFindById;
      DevicePairingCodeModel.updateMany = origCodeUpdateMany;
      DevicePairingCodeModel.create = origCodeCreate;
    }
  });

  it('8. Authenticated GET /api/v1/devices returns device list JSON 200', async () => {
    const dummyUserId = '507f1f77bcf86cd799439011';
    const dummyMerchantId = '507f1f77bcf86cd799439012';

    const origUserFindById = UserModel.findById;
    const origMerchantFindById = MerchantModel.findById;
    const origDeviceFind = AndroidDeviceModel.find;

    try {
      (UserModel as any).findById = () => ({
        lean: () => Promise.resolve({ _id: dummyUserId, status: 'ACTIVE', email: 'merchant@test.com' })
      });

      (MerchantModel as any).findById = () => ({
        lean: () => Promise.resolve({ _id: dummyMerchantId, name: 'Test Merchant Store', status: 'ACTIVE' })
      });

      (AndroidDeviceModel as any).find = () => ({
        sort: () => ({
          lean: () => Promise.resolve([
            {
              _id: 'dev_mock_1',
              merchantId: dummyMerchantId,
              deviceName: 'OnePlus Nord CE 2',
              deviceFingerprint: 'fp_123',
              androidVersion: 'Android 13',
              notificationAccessGranted: true,
              pairedAt: new Date(),
              lastHeartbeatAt: new Date(),
              status: 'ACTIVE'
            }
          ])
        })
      });

      const token = security.generateAccessToken({
        userId: dummyUserId,
        merchantId: dummyMerchantId,
        role: 'MERCHANT'
      });

      const res = await fetch(`${baseUrl}/api/v1/devices`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      const contentType = res.headers.get('content-type') || '';
      assert.ok(contentType.includes('application/json'));
      assert.strictEqual(res.status, 200);

      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data.devices.length, 1);
      assert.strictEqual(json.data.devices[0].deviceName, 'OnePlus Nord CE 2');
    } finally {
      UserModel.findById = origUserFindById;
      MerchantModel.findById = origMerchantFindById;
      AndroidDeviceModel.find = origDeviceFind;
    }
  });

  it('9. Authenticated GET /api/v1/devices/notification-sources returns sources JSON 200', async () => {
    const dummyUserId = '507f1f77bcf86cd799439011';
    const dummyMerchantId = '507f1f77bcf86cd799439012';

    const origUserFindById = UserModel.findById;
    const origMerchantFindById = MerchantModel.findById;
    const origEvidenceAggregate = PaymentEvidenceModel.aggregate;

    try {
      (UserModel as any).findById = () => ({
        lean: () => Promise.resolve({ _id: dummyUserId, status: 'ACTIVE', email: 'merchant@test.com' })
      });

      (MerchantModel as any).findById = () => ({
        lean: () => Promise.resolve({
          _id: dummyMerchantId,
          name: 'Test Merchant Store',
          status: 'ACTIVE',
          disabledNotificationPackages: ['com.whatsapp']
        })
      });

      (PaymentEvidenceModel as any).aggregate = () => Promise.resolve([
        { _id: 'com.google.android.apps.messaging', count: 12, lastCapturedAt: new Date() }
      ]);

      const token = security.generateAccessToken({
        userId: dummyUserId,
        merchantId: dummyMerchantId,
        role: 'MERCHANT'
      });

      const res = await fetch(`${baseUrl}/api/v1/devices/notification-sources`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      const contentType = res.headers.get('content-type') || '';
      assert.ok(contentType.includes('application/json'));
      assert.strictEqual(res.status, 200);

      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.ok(Array.isArray(json.data.sources));
      assert.ok(json.data.sources.some((s: any) => s.packageName === 'com.google.android.apps.messaging'));
    } finally {
      UserModel.findById = origUserFindById;
      MerchantModel.findById = origMerchantFindById;
      PaymentEvidenceModel.aggregate = origEvidenceAggregate;
    }
  });
});
