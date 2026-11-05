import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app';
import { config } from '../src/config';
import {
  Merchant,
  Order,
  Payment,
  CheckoutSession,
  IdempotencyRecord
} from '../src/database/models';
import {
  OrderStatus,
  PaymentStatus,
  PaymentMethodType,
  EnvironmentMode,
  KycStatus,
  generateRandomId
} from '@rgs-ledger/shared';
import { PaymentService } from '../src/services/payment.service';

describe('Payment Concurrency, Idempotency & Reconciliation Tests', () => {
  const app = createApp();
  let testMerchantId: string;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(config.mongoUri);
    }

    testMerchantId = generateRandomId('mer');
    await Merchant.create({
      _id: testMerchantId,
      businessName: 'Concurrency Test Merchant',
      businessType: 'PRIVATE_LIMITED',
      contactEmail: 'concurrency@test.com',
      contactPhone: '+919999999999',
      kycStatus: KycStatus.APPROVED,
      environment: EnvironmentMode.SANDBOX,
      isActive: true
    });
  });

  afterAll(async () => {
    if (testMerchantId) {
      await Promise.all([
        Merchant.deleteMany({ _id: testMerchantId }),
        Order.deleteMany({ merchantId: testMerchantId }),
        Payment.deleteMany({ merchantId: testMerchantId }),
        CheckoutSession.deleteMany({ merchantId: testMerchantId }),
        IdempotencyRecord.deleteMany({ merchantId: testMerchantId })
      ]);
    }
  });

  it('1. Simultaneous concurrent payment initiations return the exact same payment ID (no duplicate PENDING payments)', async () => {
    const orderId = generateRandomId('ord');
    await Order.create({
      _id: orderId,
      merchantId: testMerchantId,
      amount: 150000,
      currency: 'INR',
      status: OrderStatus.CREATED,
      attemptsCount: 0,
      environment: EnvironmentMode.SANDBOX
    });

    const sessionId = generateRandomId('cs');
    await CheckoutSession.create({
      _id: sessionId,
      orderId,
      merchantId: testMerchantId,
      amount: 150000,
      currency: 'INR',
      status: 'OPEN',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });

    // Simulate React StrictMode double-mount: send 2 simultaneous requests
    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/v1/checkout/sessions/${sessionId}/initiate`)
        .set('Idempotency-Key', `idemp_cs_${sessionId}_UPI_QR_1`)
        .send({ method: PaymentMethodType.UPI_QR }),
      request(app)
        .post(`/api/v1/checkout/sessions/${sessionId}/initiate`)
        .set('Idempotency-Key', `idemp_cs_${sessionId}_UPI_QR_1`)
        .send({ method: PaymentMethodType.UPI_QR })
    ]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.data.payment._id).toBeDefined();
    expect(res2.body.data.payment._id).toBeDefined();

    // Both requests must yield the exact same payment ID
    expect(res1.body.data.payment._id).toBe(res2.body.data.payment._id);

    // Verify in MongoDB: exactly 1 payment record exists for this order
    const paymentsInDb = await Payment.find({ orderId }).exec();
    expect(paymentsInDb.length).toBe(1);
    expect(paymentsInDb[0].status).toBe(PaymentStatus.PENDING);

    // Verify order attemptsCount is 1, not inflated
    const order = await Order.findById(orderId).exec();
    expect(order?.attemptsCount).toBe(1);
  });

  it('2. Stable idempotency key replays cached response', async () => {
    const orderId = generateRandomId('ord');
    await Order.create({
      _id: orderId,
      merchantId: testMerchantId,
      amount: 250000,
      currency: 'INR',
      status: OrderStatus.CREATED,
      attemptsCount: 0,
      environment: EnvironmentMode.SANDBOX
    });

    const sessionId = generateRandomId('cs');
    await CheckoutSession.create({
      _id: sessionId,
      orderId,
      merchantId: testMerchantId,
      amount: 250000,
      currency: 'INR',
      status: 'OPEN',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });

    const idempotencyKey = `idemp_cs_${sessionId}_CARD_1`;

    const res1 = await request(app)
      .post(`/api/v1/checkout/sessions/${sessionId}/initiate`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        method: PaymentMethodType.CARD,
        cardDetails: { cardNumber: '4111111111111111', expMonth: 12, expYear: 2028, cvv: '123', holderName: 'Test' }
      });

    expect(res1.status).toBe(201);
    const firstPaymentId = res1.body.data.payment._id;

    // Second request with exact same idempotency key
    const res2 = await request(app)
      .post(`/api/v1/checkout/sessions/${sessionId}/initiate`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        method: PaymentMethodType.CARD,
        cardDetails: { cardNumber: '4111111111111111', expMonth: 12, expYear: 2028, cvv: '123', holderName: 'Test' }
      });

    expect(res2.headers['x-idempotent-replayed']).toBe('true');
    expect(res2.body.data.payment._id).toBe(firstPaymentId);
  });

  it('3. Sequential retries after a FAILED payment cleanly create a new attempt', async () => {
    const orderId = generateRandomId('ord');
    await Order.create({
      _id: orderId,
      merchantId: testMerchantId,
      amount: 50000,
      currency: 'INR',
      status: OrderStatus.CREATED,
      attemptsCount: 0,
      environment: EnvironmentMode.SANDBOX
    });

    const sessionId = generateRandomId('cs');
    await CheckoutSession.create({
      _id: sessionId,
      orderId,
      merchantId: testMerchantId,
      amount: 50000,
      currency: 'INR',
      status: 'OPEN',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });

    // Attempt 1: Initiate payment
    const res1 = await request(app)
      .post(`/api/v1/checkout/sessions/${sessionId}/initiate`)
      .set('Idempotency-Key', `idemp_cs_${sessionId}_UPI_QR_1`)
      .send({ method: PaymentMethodType.UPI_QR });

    expect(res1.status).toBe(201);
    const firstPaymentId = res1.body.data.payment._id;

    // Fail Attempt 1
    await PaymentService.resolvePayment({
      paymentId: firstPaymentId,
      action: 'FAILED',
      errorCode: 'BANK_DECLINED',
      errorMessage: 'Insufficient funds'
    });

    const failedPayment = await Payment.findById(firstPaymentId).exec();
    expect(failedPayment?.status).toBe(PaymentStatus.FAILED);

    // Attempt 2: Sequential retry with new attempt index
    const res2 = await request(app)
      .post(`/api/v1/checkout/sessions/${sessionId}/initiate`)
      .set('Idempotency-Key', `idemp_cs_${sessionId}_UPI_QR_2`)
      .send({ method: PaymentMethodType.UPI_QR });

    expect(res2.status).toBe(201);
    const secondPaymentId = res2.body.data.payment._id;
    expect(secondPaymentId).not.toBe(firstPaymentId);

    // Verify in database: 2 payments exist (1 FAILED, 1 PENDING)
    const payments = await Payment.find({ orderId }).sort({ createdAt: 1 }).exec();
    expect(payments.length).toBe(2);
    expect(payments[0].status).toBe(PaymentStatus.FAILED);
    expect(payments[1].status).toBe(PaymentStatus.PENDING);

    const order = await Order.findById(orderId).exec();
    expect(order?.attemptsCount).toBe(2);
  });

  it('4. Successfully capturing an order auto-cancels any orphan PENDING attempts', async () => {
    const orderId = generateRandomId('ord');
    await Order.create({
      _id: orderId,
      merchantId: testMerchantId,
      amount: 99000,
      currency: 'INR',
      status: OrderStatus.ATTEMPTED,
      attemptsCount: 2,
      environment: EnvironmentMode.SANDBOX
    });

    // Create payment A (PENDING)
    const paymentA = await Payment.create({
      _id: generateRandomId('pay'),
      orderId,
      merchantId: testMerchantId,
      amount: 99000,
      currency: 'INR',
      status: PaymentStatus.PENDING,
      method: PaymentMethodType.UPI_QR,
      environment: EnvironmentMode.SANDBOX
    });

    // Create payment B (in PROCESSING to simulate a second attempt being captured)
    const paymentB = await Payment.create({
      _id: generateRandomId('pay'),
      orderId,
      merchantId: testMerchantId,
      amount: 99000,
      currency: 'INR',
      status: PaymentStatus.PROCESSING,
      method: PaymentMethodType.CARD,
      environment: EnvironmentMode.SANDBOX
    });

    // Capture Payment B
    await PaymentService.resolvePayment({
      paymentId: paymentB._id,
      action: 'SUCCESS'
    });

    // Verify Payment B is SUCCESS
    const refreshedB = await Payment.findById(paymentB._id).exec();
    expect(refreshedB?.status).toBe(PaymentStatus.SUCCESS);

    // Verify Payment A was auto-cancelled
    const refreshedA = await Payment.findById(paymentA._id).exec();
    expect(refreshedA?.status).toBe(PaymentStatus.CANCELLED);
    expect(refreshedA?.errorCode).toBe('ORDER_CAPTURED_SUPERSEDED');
  });

  it('5. Initiating payment on an already CAPTURED order is rejected with 400 ORDER_ALREADY_CAPTURED', async () => {
    const orderId = generateRandomId('ord');
    await Order.create({
      _id: orderId,
      merchantId: testMerchantId,
      amount: 40000,
      currency: 'INR',
      status: OrderStatus.CAPTURED,
      amountPaid: 40000,
      attemptsCount: 1,
      environment: EnvironmentMode.SANDBOX
    });

    const sessionId = generateRandomId('cs');
    await CheckoutSession.create({
      _id: sessionId,
      orderId,
      merchantId: testMerchantId,
      amount: 40000,
      currency: 'INR',
      status: 'OPEN',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });

    const res = await request(app)
      .post(`/api/v1/checkout/sessions/${sessionId}/initiate`)
      .send({ method: PaymentMethodType.UPI_QR });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('ORDER_ALREADY_CAPTURED');
  });

  it('6. Database-level partial unique index rejects multiple simultaneous PENDING payments for the same order', async () => {
    // Ensure MongoDB indexes are synced
    await Payment.syncIndexes();

    const orderId = generateRandomId('ord');

    await Payment.create({
      _id: generateRandomId('pay'),
      orderId,
      merchantId: testMerchantId,
      amount: 10000,
      currency: 'INR',
      status: PaymentStatus.PENDING,
      method: PaymentMethodType.UPI_QR,
      environment: EnvironmentMode.SANDBOX
    });

    // Attempting to directly insert a second PENDING payment with the same orderId must fail with E11000 duplicate key
    let caughtError: any = null;
    try {
      await Payment.create({
        _id: generateRandomId('pay'),
        orderId,
        merchantId: testMerchantId,
        amount: 10000,
        currency: 'INR',
        status: PaymentStatus.PENDING,
        method: PaymentMethodType.CARD,
        environment: EnvironmentMode.SANDBOX
      });
    } catch (err: any) {
      caughtError = err;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError.code).toBe(11000);
  });
});
