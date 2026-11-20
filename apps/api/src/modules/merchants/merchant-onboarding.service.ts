import mongoose from 'mongoose';
import {
  MerchantModel,
  MerchantBankAccountModel,
  MerchantIntegrationModel,
  AndroidDeviceModel,
  EvidenceTemplateModel,
  findMerchantByIdDefensive,
  flexibleIdQuery
} from '../../database/models.js';
import { MerchantOnboardingStatusDto } from '@rgs-ledger/api-contracts';

export interface IMerchantOnboardingRepository {
  findMerchant(merchantId: string): Promise<any>;
  findBankAccounts(merchantId: string): Promise<any[]>;
  findGmailIntegration(merchantId: string): Promise<any>;
  findAndroidDevices(merchantId: string): Promise<any[]>;
  findApprovedTemplates(merchantId: string): Promise<any[]>;
  updateMerchantOnboarding(merchantId: string, updates: any): Promise<any>;
}

export class MongoMerchantOnboardingRepository implements IMerchantOnboardingRepository {
  async findMerchant(merchantId: string) {
    return findMerchantByIdDefensive(merchantId);
  }

  async findBankAccounts(merchantId: string) {
    return MerchantBankAccountModel.find({ merchantId, isActive: true }).lean();
  }

  async findGmailIntegration(merchantId: string) {
    return MerchantIntegrationModel.findOne({ merchantId, type: 'GMAIL', isActive: true }).lean();
  }

  async findAndroidDevices(merchantId: string) {
    return AndroidDeviceModel.find({ merchantId, status: 'PAIRED' }).lean();
  }

  async findApprovedTemplates(merchantId: string) {
    return EvidenceTemplateModel.find({ merchantId, status: 'APPROVED' }).lean();
  }

  async updateMerchantOnboarding(merchantId: string, updates: any) {
    const updated = await MerchantModel.findByIdAndUpdate(merchantId, updates, { new: true }).lean();
    if (updated) return updated;
    await mongoose.connection.collection('merchants').updateOne(
      flexibleIdQuery(merchantId),
      updates
    );
    return findMerchantByIdDefensive(merchantId);
  }
}

export class MerchantOnboardingService {
  constructor(private repo: IMerchantOnboardingRepository = new MongoMerchantOnboardingRepository()) {}

  /**
   * Derive dynamic onboarding status strictly from actual database state.
   */
  async getOnboardingStatus(merchantId: string): Promise<MerchantOnboardingStatusDto> {
    const [merchant, bankAccounts, gmailIntegration, androidDevices, approvedTemplates] = await Promise.all([
      this.repo.findMerchant(merchantId),
      this.repo.findBankAccounts(merchantId),
      this.repo.findGmailIntegration(merchantId),
      this.repo.findAndroidDevices(merchantId),
      this.repo.findApprovedTemplates(merchantId)
    ]);

    if (!merchant) {
      const err: any = new Error('Merchant not found');
      err.code = 'MERCHANT_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    const profileComplete = Boolean(merchant.name && merchant.email);
    const upiConfigured = Boolean(merchant.upiConfig?.vpa && merchant.upiConfig?.isAcceptingPayments);
    const bankAccountActive = Array.isArray(bankAccounts) && bankAccounts.length > 0;
    const bankAccountCount = bankAccounts?.length || 0;

    const emailConnected = Boolean(
      gmailIntegration?.isActive &&
        (gmailIntegration?.config?.refreshToken || gmailIntegration?.lastSyncStatus === 'SUCCESS')
    );
    const emailProvider = emailConnected ? 'GMAIL' : null;

    const androidDevicePaired = Array.isArray(androidDevices) && androidDevices.length > 0;
    const pairedDeviceCount = androidDevices?.length || 0;

    const emailTemplateApproved = Array.isArray(approvedTemplates) &&
      approvedTemplates.some((t: any) => t.channel === 'EMAIL');
    const androidTemplateApproved = Array.isArray(approvedTemplates) &&
      approvedTemplates.some((t: any) => t.channel === 'ANDROID');

    // Dual-source policy requires both email & android companion evidence
    const isReadyForDualSource =
      bankAccountActive &&
      emailConnected &&
      androidDevicePaired &&
      emailTemplateApproved &&
      androidTemplateApproved;

    const isPartiallyReady = bankAccountActive && (emailConnected || androidDevicePaired);

    let readinessStatus: 'NOT_READY' | 'PARTIALLY_READY' | 'FULLY_READY' = 'NOT_READY';
    let readinessMessage =
      'Setup incomplete. Active receiving bank account and at least one credit evidence source required.';

    if (isReadyForDualSource) {
      readinessStatus = 'FULLY_READY';
      readinessMessage =
        'Dual-source verification active. Payments can transition to SUCCESS upon matching both Email and Android evidence.';
    } else if (isPartiallyReady) {
      readinessStatus = 'PARTIALLY_READY';
      readinessMessage =
        'Single-source evidence mode active. Payments can transition to PARTIAL_SUCCESS, but full SUCCESS strictly requires both Email and Android Companion sources.';
    }

    const missingCapabilities: string[] = [];
    if (!bankAccountActive) missingCapabilities.push('Active receiving bank account');
    if (!emailConnected) missingCapabilities.push('Gmail credit alert integration');
    if (!androidDevicePaired) missingCapabilities.push('Android companion device pairing');
    if (!emailTemplateApproved) missingCapabilities.push('Approved Email evidence template');
    if (!androidTemplateApproved) missingCapabilities.push('Approved Android notification template');

    // Automatically derive completed steps
    const derivedCompletedSteps: string[] = [];
    if (profileComplete) derivedCompletedSteps.push('business');
    if (upiConfigured && bankAccountActive) derivedCompletedSteps.push('upi');
    if (emailConnected) derivedCompletedSteps.push('email');
    if (androidDevicePaired) derivedCompletedSteps.push('android');
    if (emailTemplateApproved && androidTemplateApproved) derivedCompletedSteps.push('templates');
    if (isReadyForDualSource) derivedCompletedSteps.push('review');

    const storedSteps = merchant.onboarding?.completedSteps || [];
    const allCompletedSteps = Array.from(new Set([...storedSteps, ...derivedCompletedSteps]));

    const currentStep = (merchant.onboarding?.currentStep || (isReadyForDualSource ? 'completed' : 'business')) as any;
    const isCompleted = Boolean(merchant.onboarding?.completed || isReadyForDualSource);
    const isDismissed = Boolean(merchant.onboarding?.dismissedAt);

    return {
      currentStep,
      completedSteps: allCompletedSteps,
      isCompleted,
      isDismissed,
      checks: {
        profileComplete,
        upiConfigured,
        bankAccountActive,
        bankAccountCount,
        emailConnected,
        emailProvider,
        androidDevicePaired,
        pairedDeviceCount,
        emailTemplateApproved,
        androidTemplateApproved
      },
      readinessStatus,
      readinessMessage,
      missingCapabilities
    };
  }

  /**
   * Update the current step in the guided onboarding wizard.
   */
  async updateOnboardingStep(
    merchantId: string,
    currentStep: string,
    markStepCompleted?: string
  ): Promise<MerchantOnboardingStatusDto> {
    const updateOps: any = {
      $set: {
        'onboarding.currentStep': currentStep
      }
    };

    if (markStepCompleted) {
      updateOps.$addToSet = {
        'onboarding.completedSteps': markStepCompleted
      };
    }

    if (currentStep === 'completed') {
      updateOps.$set['onboarding.completed'] = true;
    }

    await this.repo.updateMerchantOnboarding(merchantId, updateOps);
    return this.getOnboardingStatus(merchantId);
  }

  /**
   * Dismiss the onboarding checklist banner on merchant dashboard.
   */
  async dismissOnboarding(merchantId: string): Promise<{ success: boolean }> {
    await this.repo.updateMerchantOnboarding(merchantId, {
      $set: {
        'onboarding.dismissedAt': new Date()
      }
    });
    return { success: true };
  }
}

export const merchantOnboardingService = new MerchantOnboardingService();
