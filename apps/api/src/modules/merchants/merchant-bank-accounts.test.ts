import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MerchantService, IMerchantRepository } from './index.js';
import {
  CreateMerchantBankAccountSchema,
  normalizeAccountIdentifier,
  isValidUpiVpa
} from '@rgs-ledger/validation';

class MockMerchantRepository implements IMerchantRepository {
  merchants: Map<string, any> = new Map();
  bankAccounts: Map<string, any[]> = new Map();

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

  async listBankAccounts(merchantId: string) {
    const list = this.bankAccounts.get(merchantId) || [];
    return JSON.parse(JSON.stringify(list));
  }

  async createBankAccount(merchantId: string, data: any) {
    const list = this.bankAccounts.get(merchantId) || [];
    if (data.isDefault) {
      list.forEach((acc) => {
        acc.isDefault = false;
      });
    }
    const acc = {
      id: `ba_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      merchantId,
      ...data,
      isActive: true,
      createdAt: new Date().toISOString()
    };
    list.push(acc);
    this.bankAccounts.set(merchantId, list);
    return JSON.parse(JSON.stringify(acc));
  }

  async findBankAccountById(merchantId: string, accountId: string) {
    const list = this.bankAccounts.get(merchantId) || [];
    const acc = list.find((a) => a.id === accountId);
    return acc ? JSON.parse(JSON.stringify(acc)) : null;
  }

  async findDuplicateBankAccount(merchantId: string, upiId: string, accountSuffix: string) {
    const list = this.bankAccounts.get(merchantId) || [];
    const lowerUpi = upiId.toLowerCase();
    const found = list.find(
      (a) => a.upiId.toLowerCase() === lowerUpi || a.accountSuffix === accountSuffix
    );
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async updateBankAccount(merchantId: string, accountId: string, updates: any) {
    const list = this.bankAccounts.get(merchantId) || [];
    const idx = list.findIndex((a) => a.id === accountId);
    if (idx === -1) return null;
    if (updates.isDefault) {
      list.forEach((acc) => {
        acc.isDefault = false;
      });
    }
    list[idx] = { ...list[idx], ...updates };
    return JSON.parse(JSON.stringify(list[idx]));
  }
}

describe('Merchant Bank Account Management & Normalization Suite', () => {
  it('1. Successfully creates bank account with trimmed fields and normalized suffix', async () => {
    const repo = new MockMerchantRepository();
    const service = new MerchantService(repo);

    const created = await service.createBankAccount('merchant_123', {
      bankName: '  Union Bank of India  ',
      upiId: '  merchant@unionbank  ',
      accountSuffix: '  0562  ',
      notes: '  Primary account for store collections  '
    });

    assert.strictEqual(created.bankName, 'Union Bank of India');
    assert.strictEqual(created.upiId, 'merchant@unionbank');
    assert.strictEqual(created.accountSuffix, '0562');
    assert.strictEqual(created.accountNumberMasked, 'XX0562');
    assert.strictEqual(created.notes, 'Primary account for store collections');
    assert.strictEqual(created.isActive, true);
    assert.strictEqual(created.merchantId, 'merchant_123');
  });

  it('2. Account Suffix Normalization safely handles 0562, XX0562, xx0562, and long account numbers', () => {
    // Plain 4-digit suffix
    const res1 = normalizeAccountIdentifier('0562');
    assert.strictEqual(res1.accountSuffix, '0562');
    assert.strictEqual(res1.accountNumberMasked, 'XX0562');

    // Pre-masked uppercase XX0562
    const res2 = normalizeAccountIdentifier('XX0562');
    assert.strictEqual(res2.accountSuffix, '0562');
    assert.strictEqual(res2.accountNumberMasked, 'XX0562');

    // Pre-masked lowercase xx0562
    const res3 = normalizeAccountIdentifier('xx0562');
    assert.strictEqual(res3.accountSuffix, '0562');
    assert.strictEqual(res3.accountNumberMasked, 'XX0562');

    // Symbol-masked ••••0562
    const res4 = normalizeAccountIdentifier('••••0562');
    assert.strictEqual(res4.accountSuffix, '0562');
    assert.strictEqual(res4.accountNumberMasked, 'XX0562');

    // Full account number entered (never stores full plain-text account number)
    const res5 = normalizeAccountIdentifier('50100234987654');
    assert.strictEqual(res5.accountSuffix, '7654');
    assert.strictEqual(res5.accountNumberMasked, 'XX7654');
    assert.strictEqual(res5.accountNumberMasked.includes('50100234'), false);

    // Insufficient digits rejects
    assert.throws(() => normalizeAccountIdentifier('X'), /at least 2 numeric digits/);
    assert.throws(() => normalizeAccountIdentifier(''), /required/);
  });

  it('3. Rejects missing accountNumberMasked and accountSuffix', async () => {
    const repo = new MockMerchantRepository();
    const service = new MerchantService(repo);

    await assert.rejects(
      async () => {
        await service.createBankAccount('merchant_123', {
          bankName: 'HDFC Bank',
          upiId: 'store@okhdfcbank'
        });
      },
      (err: any) => {
        assert.ok(err.issues || err.message);
        return true;
      }
    );
  });

  it('4. UPI VPA validation accepts valid handles and strictly rejects invalid formats', () => {
    // Valid UPI handles
    assert.strictEqual(isValidUpiVpa('merchant@unionbank'), true);
    assert.strictEqual(isValidUpiVpa('store.pay@okaxis'), true);
    assert.strictEqual(isValidUpiVpa('john_doe@paytm'), true);
    assert.strictEqual(isValidUpiVpa('shop123@ybl'), true);
    assert.strictEqual(isValidUpiVpa('user@upi'), true);

    // Invalid UPI handles (malformed format)
    assert.strictEqual(isValidUpiVpa('invalid-no-at-sign'), false);
    assert.strictEqual(isValidUpiVpa('@onlyhandle'), false);
    assert.strictEqual(isValidUpiVpa('username@'), false);
    assert.strictEqual(isValidUpiVpa('spaces in@upi'), false);
  });

  it('5. UPI VPA validation strictly rejects email addresses and bank notification domains', () => {
    // Email addresses
    assert.strictEqual(isValidUpiVpa('user@gmail.com'), false);
    assert.strictEqual(isValidUpiVpa('finance@outlook.com'), false);
    assert.strictEqual(isValidUpiVpa('test@yahoo.com'), false);

    // Bank alert email notification domains
    assert.strictEqual(isValidUpiVpa('alerts@unionbankofindia.bank'), false);
    assert.strictEqual(isValidUpiVpa('notifications@hdfcbank.net'), false);
    assert.strictEqual(isValidUpiVpa('nodal@icicibank.com'), false);
    assert.strictEqual(isValidUpiVpa('alerts@sbi.co.in'), false);

    // Schema level rejection
    assert.throws(() => {
      CreateMerchantBankAccountSchema.parse({
        bankName: 'HDFC Bank',
        upiId: 'alerts@hdfcbank.net',
        accountSuffix: '1234'
      });
    }, /not an email address or bank notification/);
  });

  it('6. Tenant Isolation: Merchant A cannot view, access, or modify Merchant B bank accounts', async () => {
    const repo = new MockMerchantRepository();
    const service = new MerchantService(repo);

    // Create account for Merchant A
    const accA = await service.createBankAccount('merchant_A', {
      bankName: 'Axis Bank',
      upiId: 'merchantA@okaxis',
      accountSuffix: '1111'
    });

    // Create account for Merchant B
    const accB = await service.createBankAccount('merchant_B', {
      bankName: 'ICICI Bank',
      upiId: 'merchantB@okicici',
      accountSuffix: '2222'
    });

    // Merchant A lists only Merchant A's accounts
    const listA = await service.listBankAccounts('merchant_A');
    assert.strictEqual(listA.length, 1);
    assert.strictEqual(listA[0].id, accA.id);
    assert.strictEqual(listA[0].upiId, 'merchantA@okaxis');

    // Merchant B lists only Merchant B's accounts
    const listB = await service.listBankAccounts('merchant_B');
    assert.strictEqual(listB.length, 1);
    assert.strictEqual(listB[0].id, accB.id);
    assert.strictEqual(listB[0].upiId, 'merchantB@okicici');

    // Merchant A cannot toggle Merchant B's account
    await assert.rejects(
      async () => {
        await service.toggleBankAccount('merchant_A', accB.id, false);
      },
      (err: any) => err.statusCode === 404 && /Bank account not found or access denied/.test(err.message)
    );
  });

  it('7. Duplicate account rejection: Same merchant cannot register duplicate UPI ID or duplicate suffix', async () => {
    const repo = new MockMerchantRepository();
    const service = new MerchantService(repo);

    await service.createBankAccount('merchant_123', {
      bankName: 'HDFC Bank',
      upiId: 'store@okhdfcbank',
      accountSuffix: '0562'
    });

    // Duplicate UPI ID attempt
    await assert.rejects(
      async () => {
        await service.createBankAccount('merchant_123', {
          bankName: 'HDFC Bank Branch 2',
          upiId: 'STORE@okhdfcbank', // case-insensitive check
          accountSuffix: '9999'
        });
      },
      (err: any) => err.statusCode === 409 && err.code === 'DUPLICATE_BANK_ACCOUNT' && /store@okhdfcbank/i.test(err.message)
    );

    // Duplicate account suffix attempt
    await assert.rejects(
      async () => {
        await service.createBankAccount('merchant_123', {
          bankName: 'Another Bank',
          upiId: 'another@okaxis',
          accountSuffix: 'XX0562' // normalizes to 0562, matching first account
        });
      },
      (err: any) => err.statusCode === 409 && err.code === 'DUPLICATE_BANK_ACCOUNT' && /0562/.test(err.message)
    );
  });

  it('8. Cross-merchant coexistence: Different merchants can configure same bank name or suffix independently', async () => {
    const repo = new MockMerchantRepository();
    const service = new MerchantService(repo);

    const acc1 = await service.createBankAccount('merchant_1', {
      bankName: 'State Bank of India',
      upiId: 'shared@oksbi',
      accountSuffix: '4444'
    });

    const acc2 = await service.createBankAccount('merchant_2', {
      bankName: 'State Bank of India',
      upiId: 'shared@oksbi',
      accountSuffix: '4444'
    });

    assert.ok(acc1.id);
    assert.ok(acc2.id);
    assert.notStrictEqual(acc1.id, acc2.id);
  });

  it('9. Bank account toggle active/inactive and default flag handling', async () => {
    const repo = new MockMerchantRepository();
    const service = new MerchantService(repo);

    const acc1 = await service.createBankAccount('merchant_1', {
      bankName: 'Bank 1',
      upiId: 'b1@upi',
      accountSuffix: '1001',
      isDefault: true
    });
    assert.strictEqual(acc1.isDefault, true);

    const acc2 = await service.createBankAccount('merchant_1', {
      bankName: 'Bank 2',
      upiId: 'b2@upi',
      accountSuffix: '1002',
      isDefault: true
    });
    assert.strictEqual(acc2.isDefault, true);

    // acc1 should now have isDefault false
    const updatedAcc1 = await repo.findBankAccountById('merchant_1', acc1.id);
    assert.strictEqual(updatedAcc1.isDefault, false);

    // Toggle active status
    const toggled = await service.toggleBankAccount('merchant_1', acc2.id, false);
    assert.strictEqual(toggled.isActive, false);

    const toggledBack = await service.toggleBankAccount('merchant_1', acc2.id);
    assert.strictEqual(toggledBack.isActive, true);
  });
});
