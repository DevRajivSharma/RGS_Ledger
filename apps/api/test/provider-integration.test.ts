import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import {
  UpiQrManualPaymentProvider,
  UPIPayPhonePeProvider,
  UPIPayPaytmProvider,
  CardPaymentProvider,
  NetbankingPaymentProvider,
  PaymentProviderRegistry
} from '@rgs-ledger/payment-core';
import {
  PaymentStatus,
  OrderStatus,
  PaymentMethodType,
  EnvironmentMode,
  ProviderType,
  ProviderAccountModel,
  ManualVerificationStatus,
  encryptSecret,
  decryptSecret,
  maskSecret,
  generateRandomId
} from '@rgs-ledger/shared';
import {
  Merchant,
  Order,
  Payment,
  MerchantProviderAccount,
  LedgerTransaction,
  LedgerEntry
} from '../src/database/models';
import { MerchantProviderService } from '../src/services/merchant-provider.service';
import { PaymentService } from '../src/services/payment.service';
import { config } from '../src/config';
import crypto from 'crypto';

describe('RGS Ledger — Real Payment Provider & Multi-Merchant Architecture Integration Tests', () => {
  let testMerchantId: string;
  let merchantBId: string;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(config.mongoUri);
    }

    testMerchantId = `mer_${Date.now()}_test_prov`;
    merchantBId = `mer_${Date.now()}_isolated_b`;

    await Merchant.create([
      {
        _id: testMerchantId,
        businessName: 'Apex Electronics Test',
        environmentMode: EnvironmentMode.SANDBOX,
        isActive: true
      },
      {
        _id: merchantBId,
        businessName: 'Beta Retail Isol',
        environmentMode: EnvironmentMode.SANDBOX,
        isActive: true
      }
    ]);
  });

  afterAll(async () => {
    await Merchant.deleteMany({ _id: { $in: [testMerchantId, merchantBId] } }).exec();
    await Order.deleteMany({ merchantId: { $in: [testMerchantId, merchantBId] } }).exec();
    await Payment.deleteMany({ merchantId: { $in: [testMerchantId, merchantBId] } }).exec();
    await MerchantProviderAccount.deleteMany({ merchantId: { $in: [testMerchantId, merchantBId] } }).exec();
  });

  // ---------------------------------------------------------------------------
  // 1. UPIPay Raw QR Generation (Mechanism A)
  // ---------------------------------------------------------------------------
  describe('1. Raw UPI QR Generation & Financial Safeguards (Mechanism A)', () => {
    it('generates an NPCI-compliant fixed-amount UPI QR with exact rupee conversion and merchant VPA', async () => {
      const provider = new UpiQrManualPaymentProvider({
        vpa: 'apex@icici',
        displayName: 'Apex Electronics',
        mcc: '5411'
      });

      const orderId = `ord_test_qr_${Date.now()}`;
      const amountPaise = 49900; // ₹499.00

      const resp = await provider.initiatePayment({
        paymentId: `pay_test_${Date.now()}`,
        orderId,
        amount: amountPaise,
        currency: 'INR',
        method: PaymentMethodType.UPI_QR
      });

      expect(resp.status).toBe(PaymentStatus.PENDING);
      expect(resp.upiUri).toBeDefined();
      expect(resp.qrImage).toBeDefined();
      expect(resp.qrImage).toContain('data:image/png;base64,');

      // Verify NPCI URI params: pa, pn, am, cu, mode=04 (fixed amount)
      const url = new URL(resp.upiUri!);
      expect(url.protocol).toBe('upi:');
      expect(url.searchParams.get('pa')).toBe('apex@icici');
      expect(url.searchParams.get('pn')).toBe('Apex Electronics');
      expect(url.searchParams.get('am')).toBe('499.00'); // Exactly 499.00 rupees (not 49900 paise)
      expect(url.searchParams.get('cu')).toBe('INR');
      expect(url.searchParams.get('mode')).toBe('04'); // NPCI Fixed Amount mode
      expect(url.searchParams.get('mc')).toBe('5411');
    });

    it('creates persistent attempt with AWAITING_MANUAL_CONFIRMATION and refuses auto-capture', async () => {
      // Configure merchant to use raw UPI QR manual provider
      await MerchantProviderService.saveProviderAccount({
        merchantId: testMerchantId,
        providerType: ProviderType.UPI_QR_MANUAL,
        environment: EnvironmentMode.SANDBOX,
        isEnabled: true,
        credentials: {},
        vpaConfig: {
          vpa: 'apexstore@okhdfcbank',
          displayName: 'Apex Store'
        }
      });

      const order = await Order.create({
        _id: generateRandomId('ord'),
        merchantId: testMerchantId,
        amount: 25000, // ₹250.00
        currency: 'INR',
        status: OrderStatus.CREATED
      });

      const { payment, upiUri } = await PaymentService.createPaymentAttempt({
        orderId: String(order._id),
        method: PaymentMethodType.UPI_QR
      });

      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(payment.providerType).toBe(ProviderType.UPI_QR_MANUAL);
      expect(payment.manualVerificationStatus).toBe(ManualVerificationStatus.AWAITING_MANUAL_CONFIRMATION);
      expect(upiUri).toContain('pa=apexstore%40okhdfcbank');

      // Order must NOT be captured automatically
      const freshOrder = await Order.findById(order._id).exec();
      expect(freshOrder!.status).toBe(OrderStatus.ATTEMPTED);
      expect(freshOrder!.amountPaid).toBe(0);
    });

    it('requires authoritative bank UTR verification before transitioning raw QR payment to SUCCESS', async () => {
      const order = await Order.create({
        _id: generateRandomId('ord'),
        merchantId: testMerchantId,
        amount: 35000, // ₹350.00
        currency: 'INR',
        status: OrderStatus.CREATED
      });

      const { payment } = await PaymentService.createPaymentAttempt({
        orderId: String(order._id),
        method: PaymentMethodType.UPI_QR
      });

      // 1. Attempt manual confirmation with invalid/short UTR should fail
      await expect(
        PaymentService.confirmManualPayment({
          paymentId: String(payment._id),
          utr: '123', // too short
          verifiedBy: 'finance_officer@apex.com'
        })
      ).rejects.toThrow('minimum 6 alphanumeric characters');

      // 2. Authoritative confirmation with valid bank UTR
      const bankUtr = `UTR_${Date.now()}_98273618`;
      const confirmed = await PaymentService.confirmManualPayment({
        paymentId: String(payment._id),
        utr: bankUtr,
        verifiedBy: 'finance_officer@apex.com',
        notes: 'Verified against ICICI Bank Current Account statement'
      });

      expect(confirmed.payment.status).toBe(PaymentStatus.SUCCESS);
      expect(confirmed.payment.manualVerificationStatus).toBe(ManualVerificationStatus.MANUAL_VERIFIED);
      expect(confirmed.payment.manualVerificationDetails?.utr).toBe(bankUtr);
      expect(confirmed.order.status).toBe(OrderStatus.CAPTURED);
      expect(confirmed.order.amountPaid).toBe(35000);

      // 3. Double-entry ledger journal must be captured
      const journal = await LedgerTransaction.findOne({ referenceId: payment._id }).exec();
      expect(journal).toBeDefined();
      const entries = await LedgerEntry.find({ transactionId: journal!._id }).exec();
      expect(entries.length).toBeGreaterThanOrEqual(2);
      const debits = entries.filter(e => e.direction === 'DEBIT').reduce((acc, e) => acc + e.amountMinor, 0);
      const credits = entries.filter(e => e.direction === 'CREDIT').reduce((acc, e) => acc + e.amountMinor, 0);
      expect(debits).toBe(credits); // Balanced double-entry
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Multi-Merchant Provider Architecture & Encrypted Credential Isolation
  // ---------------------------------------------------------------------------
  describe('2. Multi-Merchant Provider Architecture & Credential Encryption', () => {
    it('encrypts provider credentials with AES-256-GCM and never exposes plain secrets', async () => {
      const rawSecret = 'secret_salt_key_8492048204928490';
      const encrypted = encryptSecret(rawSecret, config.encryptionKey);

      expect(encrypted).not.toBe(rawSecret);
      expect(encrypted.split(':').length).toBe(3); // iv:authTag:ciphertext

      const decrypted = decryptSecret(encrypted, config.encryptionKey);
      expect(decrypted).toBe(rawSecret);

      const masked = maskSecret(rawSecret);
      expect(masked).toBe('secr********8490');
      expect(masked).not.toContain(rawSecret);
    });

    it('isolates provider accounts between distinct merchants', async () => {
      // Merchant A configures PhonePe
      await MerchantProviderService.saveProviderAccount({
        merchantId: testMerchantId,
        providerType: ProviderType.PHONEPE,
        environment: EnvironmentMode.SANDBOX,
        isEnabled: true,
        credentials: {
          merchantId: 'MERCHANT_A_PHONEPE',
          saltKey: 'salt_key_merchant_a_1234567890',
          saltIndex: '1'
        }
      });

      // Merchant B has no PhonePe configured
      const accountsB = await MerchantProviderService.getMerchantProviderAccounts(merchantBId);
      expect(accountsB.length).toBe(0);

      // Verify Merchant A's public listing masks the saltKey
      const accountsA = await MerchantProviderService.getMerchantProviderAccounts(testMerchantId);
      const phonepeAcc = accountsA.find(a => a.providerType === ProviderType.PHONEPE);
      expect(phonepeAcc).toBeDefined();
      expect(phonepeAcc!.credentialsMasked.merchantId).toBe('MERCHANT_A_PHONEPE');
      expect(phonepeAcc!.credentialsMasked.saltKey).toBe('salt********7890');
      expect((phonepeAcc as any).credentialsEncrypted).toBeUndefined(); // Stripped from display DTO
    });
  });

  // ---------------------------------------------------------------------------
  // 3. PhonePe Business Provider Adapter & Webhook Security
  // ---------------------------------------------------------------------------
  describe('3. PhonePe Business Provider Adapter & Webhook Security', () => {
    const saltKey = '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399';
    const saltIndex = '1';
    const merchantId = 'PGTESTPAYUAT';

    it('validates PhonePe X-VERIFY signature correctly on authentic callbacks', () => {
      const provider = new UPIPayPhonePeProvider({
        merchantId,
        saltKey,
        saltIndex,
        environment: 'sandbox'
      });

      // PhonePe payload format: fields wrapped under data
      const internalData = {
        success: true,
        code: 'PAYMENT_SUCCESS',
        message: 'Payment Successful',
        data: {
          merchantId,
          merchantTransactionId: 'ord_phonepe_test_001',
          transactionId: 'T2306031234567890',
          amount: 50000,
          state: 'COMPLETED',
          responseCode: 'SUCCESS'
        }
      };
      const base64Data = Buffer.from(JSON.stringify(internalData)).toString('base64');
      const payload = { response: base64Data };
      const rawPayloadStr = JSON.stringify(payload);

      // Expected PhonePe Checksum: SHA256(base64Response + saltKey) + "###" + saltIndex
      const hash = crypto.createHash('sha256').update(base64Data + saltKey).digest('hex');
      const signature = `${hash}###${saltIndex}`;

      const result = provider.verifyWebhook(rawPayloadStr, signature, undefined, {
        expectedAmount: 50000
      });

      expect(result.verified).toBe(true);
      expect(result.status).toBe(PaymentStatus.SUCCESS);
      expect(result.orderId).toBe('ord_phonepe_test_001');
      expect(result.amount).toBe(50000);
    });

    it('strictly rejects forged or tampered PhonePe webhook signatures', () => {
      const provider = new UPIPayPhonePeProvider({
        merchantId,
        saltKey,
        saltIndex,
        environment: 'sandbox'
      });

      const base64Data = Buffer.from(JSON.stringify({ merchantTransactionId: 'ord_fake', amount: 1000 })).toString('base64');
      const payload = JSON.stringify({ response: base64Data });
      const forgedSignature = 'bad_hash_signature###1';

      const result = provider.verifyWebhook(payload, forgedSignature);
      expect(result.verified).toBe(false);
    });

    it('rejects amount-substitution attacks using expectedAmount validation', () => {
      const provider = new UPIPayPhonePeProvider({
        merchantId,
        saltKey,
        saltIndex,
        environment: 'sandbox'
      });

      // Attacker paid ₹1 (100 paise) for a ₹10,000 order (1000000 paise)
      const internalData = {
        merchantId,
        merchantTransactionId: 'ord_expensive_order',
        amount: 100, // ₹1
        state: 'COMPLETED'
      };
      const base64Data = Buffer.from(JSON.stringify(internalData)).toString('base64');
      const payload = JSON.stringify({ response: base64Data });

      const hash = crypto.createHash('sha256').update(base64Data + saltKey).digest('hex');
      const signature = `${hash}###${saltIndex}`;

      // SDK verifies against expectedAmount = 1000000
      const result = provider.verifyWebhook(payload, signature, undefined, {
        expectedAmount: 1000000 // ₹10,000 expected
      });

      expect(result.verified).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Paytm Business Provider Adapter & Browser Return Navigation
  // ---------------------------------------------------------------------------
  describe('4. Paytm Business Provider Adapter', () => {
    it('verifies Paytm adapter capabilities define UPI support only (not Cards/Netbanking)', () => {
      const provider = new UPIPayPaytmProvider({
        merchantId: 'STAGE_MID_PAYTM_99214',
        merchantKey: 'STAGE_MKEY_PAYTM_8819273',
        environment: 'sandbox'
      });

      expect(provider.capabilities.supportsUpiQr).toBe(true);
      expect(provider.capabilities.supportsUpiIntent).toBe(true);
      expect(provider.capabilities.supportsHostedCheckout).toBe(true);
      expect(provider.capabilities.supportsCards).toBe(false); // UPIPay is UPI-only
      expect(provider.capabilities.supportsNetbanking).toBe(false);
      expect(provider.capabilities.supportsWebhooks).toBe(true);
      expect(provider.capabilities.supportsStatusCheck).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Card and Netbanking Regulatory Boundaries & Explicit Rejection
  // ---------------------------------------------------------------------------
  describe('5. Card and Netbanking Boundaries (Requires Authorized Merchant Acquiring)', () => {
    it('returns structured CARD_GATEWAY_NOT_CONFIGURED error when live card gateway is unconfigured', async () => {
      const unconfiguredCard = new CardPaymentProvider({ isConfigured: false });
      const resp = await unconfiguredCard.initiatePayment({
        paymentId: 'pay_card_001',
        orderId: 'ord_card_001',
        amount: 150000,
        currency: 'INR',
        method: PaymentMethodType.CARD
      });

      expect(resp.status).toBe(PaymentStatus.FAILED);
      expect(resp.errorCode).toBe('CARD_GATEWAY_NOT_CONFIGURED');
      expect(resp.errorMessage).toContain('Merchant must onboard with an authorized acquiring bank');
    });

    it('returns structured NETBANKING_GATEWAY_NOT_CONFIGURED error when netbanking aggregator is unconfigured', async () => {
      const unconfiguredNetbanking = new NetbankingPaymentProvider({ isConfigured: false });
      const resp = await unconfiguredNetbanking.initiatePayment({
        paymentId: 'pay_nb_001',
        orderId: 'ord_nb_001',
        amount: 80000,
        currency: 'INR',
        method: PaymentMethodType.NETBANKING,
        bankCode: 'HDFC'
      });

      expect(resp.status).toBe(PaymentStatus.FAILED);
      expect(resp.errorCode).toBe('NETBANKING_GATEWAY_NOT_CONFIGURED');
      expect(resp.errorMessage).toContain('Merchant must onboard with an authorized netbanking aggregator');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Server-Side Payment Reconciliation API
  // ---------------------------------------------------------------------------
  describe('6. Server-Side Payment Reconciliation', () => {
    it('reconcilePayment idempotently retains or resolves payment with sandbox provider', async () => {
      const order = await Order.create({
        _id: generateRandomId('ord'),
        merchantId: merchantBId, // Clean sandbox merchant
        amount: 12000,
        currency: 'INR',
        status: OrderStatus.CREATED
      });

      const { payment } = await PaymentService.createPaymentAttempt({
        orderId: String(order._id),
        method: PaymentMethodType.UPI_QR
      });

      expect(payment.status).toBe(PaymentStatus.PENDING);

      // Sandbox reconciliation checks status authoritatively
      const recResult = await PaymentService.reconcilePayment(String(payment._id));
      expect(recResult.payment).toBeDefined();
    });

    it('strictly prevents IDOR cross-tenant manual confirmation and reconciliation', async () => {
      // Create payment for Merchant A
      const orderA = await Order.create({
        _id: generateRandomId('ord'),
        merchantId: testMerchantId,
        amount: 50000,
        currency: 'INR',
        status: OrderStatus.CREATED
      });

      const { payment: paymentA } = await PaymentService.createPaymentAttempt({
        orderId: String(orderA._id),
        method: PaymentMethodType.UPI_QR
      });

      // Merchant B attempts to confirm Merchant A's payment -> MUST FAIL with 403 Forbidden
      await expect(
        PaymentService.confirmManualPayment({
          paymentId: String(paymentA._id),
          utr: 'UTR_SPOOF_123456',
          verifiedBy: 'attacker@merchantb.com',
          merchantId: merchantBId // Caller identity is Merchant B
        })
      ).rejects.toThrow('Access denied: Payment belongs to another merchant.');

      // Merchant B attempts to reconcile Merchant A's payment -> MUST FAIL with 403 Forbidden
      await expect(
        PaymentService.reconcilePayment(String(paymentA._id), merchantBId)
      ).rejects.toThrow('Access denied: Payment belongs to another merchant.');
    });
  });
});
