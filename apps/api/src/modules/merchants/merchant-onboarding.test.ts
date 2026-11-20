import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  MerchantOnboardingService,
  IMerchantOnboardingRepository
} from './merchant-onboarding.service.js';

class MockOnboardingRepository implements IMerchantOnboardingRepository {
  merchant: any = null;
  bankAccounts: any[] = [];
  gmailIntegration: any = null;
  androidDevices: any[] = [];
  approvedTemplates: any[] = [];

  async findMerchant(_merchantId: string) {
    return this.merchant;
  }

  async findBankAccounts(_merchantId: string) {
    return this.bankAccounts;
  }

  async findGmailIntegration(_merchantId: string) {
    return this.gmailIntegration;
  }

  async findAndroidDevices(_merchantId: string) {
    return this.androidDevices;
  }

  async findApprovedTemplates(_merchantId: string) {
    return this.approvedTemplates;
  }

  async updateMerchantOnboarding(_merchantId: string, updates: any) {
    if (!this.merchant) return null;
    if (updates.$set) {
      if (!this.merchant.onboarding) this.merchant.onboarding = {};
      for (const [k, v] of Object.entries(updates.$set)) {
        if (k.startsWith('onboarding.')) {
          this.merchant.onboarding[k.replace('onboarding.', '')] = v;
        }
      }
    }
    if (updates.$addToSet) {
      if (!this.merchant.onboarding) this.merchant.onboarding = {};
      for (const [k, v] of Object.entries(updates.$addToSet)) {
        if (k.startsWith('onboarding.')) {
          const field = k.replace('onboarding.', '');
          const existing = this.merchant.onboarding[field] || [];
          if (!existing.includes(v)) existing.push(v);
          this.merchant.onboarding[field] = existing;
        }
      }
    }
    return this.merchant;
  }
}

describe('Phase 4B: Merchant Guided Onboarding Service', () => {
  it('correctly calculates NOT_READY status when bank account or evidence is missing', async () => {
    const repo = new MockOnboardingRepository();
    repo.merchant = {
      _id: 'm1',
      name: 'Test Merchant',
      email: 'm1@example.com',
      upiConfig: { vpa: 'test@upi', isAcceptingPayments: true }
    };
    // No bank account, no email, no android
    const service = new MerchantOnboardingService(repo);
    const status = await service.getOnboardingStatus('m1');

    assert.strictEqual(status.readinessStatus, 'NOT_READY');
    assert.strictEqual(status.checks.profileComplete, true);
    assert.strictEqual(status.checks.upiConfigured, true);
    assert.strictEqual(status.checks.bankAccountActive, false);
    assert.strictEqual(status.checks.emailConnected, false);
    assert.strictEqual(status.checks.androidDevicePaired, false);
    assert.ok(status.missingCapabilities.includes('Active receiving bank account'));
    assert.ok(status.missingCapabilities.includes('Gmail credit alert integration'));
    assert.ok(status.missingCapabilities.includes('Android companion device pairing'));
  });

  it('correctly calculates PARTIALLY_READY status when active bank account and exactly one evidence source is present', async () => {
    const repo = new MockOnboardingRepository();
    repo.merchant = {
      _id: 'm1',
      name: 'Test Merchant',
      email: 'm1@example.com',
      upiConfig: { vpa: 'test@upi', isAcceptingPayments: true }
    };
    repo.bankAccounts = [{ _id: 'b1', bankName: 'HDFC', isActive: true }];
    // Gmail connected, but no Android device
    repo.gmailIntegration = {
      isActive: true,
      config: { refreshToken: 'rt_mock123' },
      lastSyncStatus: 'SUCCESS'
    };
    repo.approvedTemplates = [{ channel: 'EMAIL', status: 'APPROVED' }];

    const service = new MerchantOnboardingService(repo);
    const status = await service.getOnboardingStatus('m1');

    assert.strictEqual(status.readinessStatus, 'PARTIALLY_READY');
    assert.strictEqual(status.checks.bankAccountActive, true);
    assert.strictEqual(status.checks.emailConnected, true);
    assert.strictEqual(status.checks.androidDevicePaired, false);
    assert.ok(status.missingCapabilities.includes('Android companion device pairing'));
    assert.ok(status.missingCapabilities.includes('Approved Android notification template'));
  });

  it('correctly calculates FULLY_READY status when active bank account and BOTH approved Email and Android sources are present', async () => {
    const repo = new MockOnboardingRepository();
    repo.merchant = {
      _id: 'm1',
      name: 'Test Merchant',
      email: 'm1@example.com',
      upiConfig: { vpa: 'test@upi', isAcceptingPayments: true }
    };
    repo.bankAccounts = [{ _id: 'b1', bankName: 'Union Bank', accountSuffix: '0562', isActive: true }];
    repo.gmailIntegration = {
      isActive: true,
      config: { refreshToken: 'rt_mock_valid' }
    };
    repo.androidDevices = [{ _id: 'd1', deviceName: 'OnePlus Nord', status: 'PAIRED', notificationAccessGranted: true }];
    repo.approvedTemplates = [
      { channel: 'EMAIL', status: 'APPROVED' },
      { channel: 'ANDROID', status: 'APPROVED' }
    ];

    const service = new MerchantOnboardingService(repo);
    const status = await service.getOnboardingStatus('m1');

    assert.strictEqual(status.readinessStatus, 'FULLY_READY');
    assert.strictEqual(status.checks.profileComplete, true);
    assert.strictEqual(status.checks.upiConfigured, true);
    assert.strictEqual(status.checks.bankAccountActive, true);
    assert.strictEqual(status.checks.emailConnected, true);
    assert.strictEqual(status.checks.androidDevicePaired, true);
    assert.strictEqual(status.checks.emailTemplateApproved, true);
    assert.strictEqual(status.checks.androidTemplateApproved, true);
    assert.strictEqual(status.missingCapabilities.length, 0);
    assert.ok(status.readinessMessage.includes('Dual-source verification active'));
  });

  it('updates and persists onboarding step progression and handles dismissal', async () => {
    const repo = new MockOnboardingRepository();
    repo.merchant = {
      _id: 'm1',
      name: 'Test Merchant',
      email: 'm1@example.com',
      upiConfig: { vpa: 'test@upi', isAcceptingPayments: true },
      onboarding: { currentStep: 'business', completedSteps: [] }
    };

    const service = new MerchantOnboardingService(repo);

    // Advance to UPI step and mark business completed
    const updated = await service.updateOnboardingStep('m1', 'upi', 'business');
    assert.strictEqual(updated.currentStep, 'upi');
    assert.ok(updated.completedSteps.includes('business'));

    // Advance to completed
    const completed = await service.updateOnboardingStep('m1', 'completed', 'review');
    assert.strictEqual(completed.currentStep, 'completed');
    assert.strictEqual(completed.isCompleted, true);

    // Dismiss onboarding
    const dismissRes = await service.dismissOnboarding('m1');
    assert.strictEqual(dismissRes.success, true);
    assert.ok(repo.merchant.onboarding.dismissedAt instanceof Date);
  });
});
