import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MerchantService, IMerchantRepository } from './index.js';

class MockMerchantRepository implements IMerchantRepository {
  merchants: Map<string, any> = new Map();

  async findById(merchantId: string) {
    const m = this.merchants.get(merchantId);
    return m ? JSON.parse(JSON.stringify(m)) : null;
  }

  async updateProfile(merchantId: string, data: { name?: string }) {
    const m = this.merchants.get(merchantId);
    if (!m) return null;
    const updated = { ...m, ...data };
    this.merchants.set(merchantId, updated);
    return JSON.parse(JSON.stringify(updated));
  }

  async updateUpiConfig(merchantId: string, upiConfig: any) {
    const m = this.merchants.get(merchantId);
    if (!m) return null;
    const updated = { ...m, upiConfig: { ...m.upiConfig, ...upiConfig } };
    this.merchants.set(merchantId, updated);
    return JSON.parse(JSON.stringify(updated));
  }

  bankAccounts: Map<string, any[]> = new Map();

  async listBankAccounts(merchantId: string) {
    return this.bankAccounts.get(merchantId) || [];
  }

  async createBankAccount(merchantId: string, data: any) {
    const list = this.bankAccounts.get(merchantId) || [];
    const acc = { id: `ba_${Date.now()}`, _id: `ba_${Date.now()}`, merchantId, ...data, isActive: true };
    list.push(acc);
    this.bankAccounts.set(merchantId, list);
    return acc;
  }

  async findBankAccountById(merchantId: string, accountId: string) {
    const list = this.bankAccounts.get(merchantId) || [];
    return list.find((a) => (a.id || a._id) === accountId) || null;
  }

  async findDuplicateBankAccount(merchantId: string, upiId: string, accountSuffix: string) {
    const list = this.bankAccounts.get(merchantId) || [];
    const lowerUpi = upiId.toLowerCase();
    return list.find((a) => a.upiId?.toLowerCase() === lowerUpi || a.accountSuffix === accountSuffix) || null;
  }

  async updateBankAccount(merchantId: string, accountId: string, updates: any) {
    const list = this.bankAccounts.get(merchantId) || [];
    const idx = list.findIndex((a) => (a.id || a._id) === accountId);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...updates };
    return list[idx];
  }
}

describe('MerchantService — Profile & UPI Configuration Isolation', () => {
  it('retrieves and updates merchant profile strictly scoped to merchantId', async () => {
    const repo = new MockMerchantRepository();
    repo.merchants.set('mer_1', {
      _id: 'mer_1',
      name: 'Original Merchant Name',
      email: 'm1@example.com',
      upiConfig: { vpa: 'm1@upi', businessName: 'M1 Shop', isAcceptingPayments: true }
    });
    repo.merchants.set('mer_2', {
      _id: 'mer_2',
      name: 'Merchant Two',
      email: 'm2@example.com',
      upiConfig: { vpa: 'm2@upi', businessName: 'M2 Shop', isAcceptingPayments: true }
    });

    const service = new MerchantService(repo);

    // Profile retrieval
    const profile = await service.getProfile('mer_1');
    assert.strictEqual(profile.name, 'Original Merchant Name');

    // Update profile for mer_1
    const updated = await service.updateProfile('mer_1', { name: 'New Brand Name' });
    assert.strictEqual(updated.name, 'New Brand Name');

    // mer_2 must remain completely untouched (Tenant Isolation)
    const profile2 = await service.getProfile('mer_2');
    assert.strictEqual(profile2.name, 'Merchant Two');
  });

  it('updates UPI configuration and acceptance status', async () => {
    const repo = new MockMerchantRepository();
    repo.merchants.set('mer_1', {
      _id: 'mer_1',
      name: 'Store',
      email: 'store@example.com',
      upiConfig: { vpa: 'old@upi', businessName: 'Store', isAcceptingPayments: true }
    });

    const service = new MerchantService(repo);

    const updatedConfig = await service.updateUpiConfig('mer_1', {
      vpa: 'newstore@okhdfcbank',
      businessName: 'Updated Store Name',
      isAcceptingPayments: false
    });

    assert.strictEqual(updatedConfig.vpa, 'newstore@okhdfcbank');
    assert.strictEqual(updatedConfig.businessName, 'Updated Store Name');
    assert.strictEqual(updatedConfig.isAcceptingPayments, false);

    // Verify retrieval reflects the updated configuration
    const current = await service.getUpiConfig('mer_1');
    assert.strictEqual(current.vpa, 'newstore@okhdfcbank');
    assert.strictEqual(current.isAcceptingPayments, false);
  });

  it('rejects invalid UPI ID formats with validation error', async () => {
    const repo = new MockMerchantRepository();
    repo.merchants.set('mer_1', {
      _id: 'mer_1',
      name: 'Store',
      upiConfig: { vpa: 'valid@upi', businessName: 'Store', isAcceptingPayments: true }
    });

    const service = new MerchantService(repo);

    await assert.rejects(async () => {
      await service.updateUpiConfig('mer_1', {
        vpa: 'invalid-no-symbol',
        businessName: 'Store'
      });
    });
  });

  it('throws NOT_FOUND when accessing non-existent merchant profile', async () => {
    const repo = new MockMerchantRepository();
    const service = new MerchantService(repo);

    await assert.rejects(
      async () => {
        await service.getProfile('mer_nonexistent');
      },
      (err: any) => err.code === 'NOT_FOUND' && err.statusCode === 404
    );
  });
});
