import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import {
  toMinorUnit,
  toMajorUnitString,
  formatCurrency,
  addMinorUnits,
  subtractMinorUnits,
  calculateBasisPoints,
  signWebhookPayload,
  verifyWebhookSignature,
  OrderStatus,
  PaymentStatus,
  RefundStatus
} from '@rgs-ledger/shared';
import {
  DoubleEntryLedger,
  UnbalancedLedgerError,
  PaymentStateMachine,
  InvalidStateTransitionError,
  GenericUPIIntentProvider,
  SandboxPaymentProvider
} from '@rgs-ledger/payment-core';

describe('1. Financial Minor Unit Arithmetic (Paise Precision)', () => {
  it('converts major units to minor units without floating point representation drift', () => {
    expect(toMinorUnit(100)).toBe(10000);
    expect(toMinorUnit(149.99)).toBe(14999);
    expect(toMinorUnit('250.50')).toBe(25050);
  });

  it('converts minor units to major decimal string accurately', () => {
    expect(toMajorUnitString(10000)).toBe('100.00');
    expect(toMajorUnitString(14999)).toBe('149.99');
  });

  it('formats INR currency display properly', () => {
    const formatted = formatCurrency(12500050, 'INR');
    expect(formatted).toContain('1,25,000.50');
  });

  it('calculates basis points strictly as integers', () => {
    // 200 bps = 2.00% of 10,000 paise = 200 paise
    expect(calculateBasisPoints(10000, 200)).toBe(200);
    // 18% GST (1800 bps) on 200 paise = 36 paise
    expect(calculateBasisPoints(200, 1800)).toBe(36);
  });

  it('rejects floating point amounts in financial additions and subtractions', () => {
    expect(addMinorUnits(100, 200, 300)).toBe(600);
    expect(subtractMinorUnits(500, 200)).toBe(300);
    expect(() => addMinorUnits(100.5, 200)).toThrow();
  });
});

describe('2. Double-Entry Accounting Ledger Engine', () => {
  it('creates mathematically balanced payment capture journal (Debits === Credits)', () => {
    const journal = DoubleEntryLedger.createPaymentCaptureJournal({
      merchantId: 'mer_test_123',
      paymentId: 'pay_test_001',
      grossAmountMinor: 100000 // ₹1,000.00
    });

    expect(journal.entries.length).toBe(4);
    // Debits
    const debits = journal.entries.filter(e => e.direction === 'DEBIT').reduce((s, e) => s + e.amountMinor, 0);
    // Credits
    const credits = journal.entries.filter(e => e.direction === 'CREDIT').reduce((s, e) => s + e.amountMinor, 0);

    expect(debits).toBe(100000);
    expect(credits).toBe(100000);
    expect(debits).toBe(credits);
  });

  it('creates mathematically balanced refund journal', () => {
    const journal = DoubleEntryLedger.createRefundJournal({
      merchantId: 'mer_test_123',
      refundId: 'ref_test_001',
      refundAmountMinor: 25000 // ₹250.00
    });

    const debits = journal.entries.filter(e => e.direction === 'DEBIT').reduce((s, e) => s + e.amountMinor, 0);
    const credits = journal.entries.filter(e => e.direction === 'CREDIT').reduce((s, e) => s + e.amountMinor, 0);

    expect(debits).toBe(25000);
    expect(credits).toBe(25000);
  });

  it('throws UnbalancedLedgerError if debits do not match credits', () => {
    expect(() => {
      DoubleEntryLedger.validateBalance([
        { accountCode: 'A1', accountType: 'ASSET' as any, direction: 'DEBIT' as any, amountMinor: 500, description: 'd' },
        { accountCode: 'A2', accountType: 'LIABILITY' as any, direction: 'CREDIT' as any, amountMinor: 400, description: 'c' }
      ]);
    }).toThrow(UnbalancedLedgerError);
  });
});

describe('3. Payment & Order Finite State Machines', () => {
  it('allows valid order transitions', () => {
    expect(() => PaymentStateMachine.assertOrderTransition(OrderStatus.CREATED, OrderStatus.ATTEMPTED)).not.toThrow();
    expect(() => PaymentStateMachine.assertOrderTransition(OrderStatus.ATTEMPTED, OrderStatus.CAPTURED)).not.toThrow();
    expect(() => PaymentStateMachine.assertOrderTransition(OrderStatus.CAPTURED, OrderStatus.PARTIALLY_REFUNDED)).not.toThrow();
  });

  it('blocks illegal order transitions', () => {
    expect(() => PaymentStateMachine.assertOrderTransition(OrderStatus.REFUNDED, OrderStatus.CAPTURED)).toThrow(InvalidStateTransitionError);
    expect(() => PaymentStateMachine.assertOrderTransition(OrderStatus.CANCELLED, OrderStatus.CAPTURED)).toThrow(InvalidStateTransitionError);
  });

  it('allows valid payment transitions and blocks invalid ones', () => {
    expect(() => PaymentStateMachine.assertPaymentTransition(PaymentStatus.CREATED, PaymentStatus.PENDING)).not.toThrow();
    expect(() => PaymentStateMachine.assertPaymentTransition(PaymentStatus.PENDING, PaymentStatus.SUCCESS)).not.toThrow();
    // Cannot transition from SUCCESS back to PENDING or FAILED
    expect(() => PaymentStateMachine.assertPaymentTransition(PaymentStatus.SUCCESS, PaymentStatus.PENDING)).toThrow(InvalidStateTransitionError);
  });
});

describe('4. Cryptographic HMAC-SHA256 Webhook Verification', () => {
  it('generates and verifies timing-safe signature accurately', () => {
    const payload = JSON.stringify({ event: 'payment.succeeded', id: 'evt_123' });
    const secret = 'whsec_test_secret_key_12345';
    const timestamp = Math.floor(Date.now() / 1000);

    const sig = signWebhookPayload(payload, secret, timestamp);
    const header = `t=${timestamp},v1=${sig}`;

    const isValid = verifyWebhookSignature(payload, header, secret);
    expect(isValid).toBe(true);

    // Tampered payload fails
    const isTamperedValid = verifyWebhookSignature(payload + 'tampered', header, secret);
    expect(isTamperedValid).toBe(false);

    // Wrong secret fails
    const isWrongSecretValid = verifyWebhookSignature(payload, header, 'whsec_wrong');
    expect(isWrongSecretValid).toBe(false);
  });
});

describe('5. UPI Intent & QR Generation (NPCI Specification)', () => {
  it('validates VPA format correctly', () => {
    expect(GenericUPIIntentProvider.isValidUPIId('merchant@okhdfcbank')).toBe(true);
    expect(GenericUPIIntentProvider.isValidUPIId('user.name-123@icici')).toBe(true);
    expect(GenericUPIIntentProvider.isValidUPIId('invalid-vpa-without-bank')).toBe(false);
  });

  it('generates standard NPCI UPI URI with paise converted to rupees', () => {
    const uri = GenericUPIIntentProvider.generateIntentUri({
      payeeVpa: 'acme@icici',
      payeeName: 'Acme Store',
      transactionRef: 'txn_9988',
      amountPaise: 49900,
      currency: 'INR'
    });

    expect(uri).toContain('upi://pay?');
    expect(uri).toContain('pa=acme%40icici');
    expect(uri).toContain('am=499.00');
    expect(uri).toContain('cu=INR');
  });
});

describe('6. REST API Endpoints & Health Check', () => {
  const app = createApp();

  it('GET /health returns 200 UP status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
    expect(res.body.service).toBe('rgs-ledger-api');
  });

  it('POST /api/v1/auth/register validates schema and returns error on invalid payload', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'invalid-email', password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
