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
  WebhookDelivery,
  WebhookEndpoint
} from '../src/database/models';
import {
  OrderStatus,
  PaymentStatus,
  PaymentMethodType,
  EnvironmentMode,
  KycStatus,
  generateRandomId
} from '@rgs-ledger/shared';
import { CheckoutService } from '../src/services/checkout.service';

describe('Payment Method Consistency & Dynamic Lifecycle Tests', () => {
  const app = createApp();
  let testMerchantId: string;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(config.mongoUri);
    }

    testMerchantId = generateRandomId('mer');
    await Merchant.create({
      _id: testMerchantId,
      businessName: 'Method Consistency Test Merchant',
      businessType: 'PRIVATE_LIMITED',
      contactEmail: 'method-consistency@test.com',
      contactPhone: '+919999999999',
      kycStatus: KycStatus.APPROVED,
      environment: EnvironmentMode.SANDBOX,
      isActive: true
    });

    // Configure a dummy webhook endpoint to capture webhook deliveries
    await WebhookEndpoint.create({
      _id: generateRandomId('whe'),
      merchantId: testMerchantId,
      url: 'https://webhook.site/test-sandbox-endpoint',
      secretKey: 'whsec_test_secret_key_1234567890',
      events: ['payment.created', 'payment.succeeded', 'payment.failed'],
      isActive: true,
      environment: EnvironmentMode.SANDBOX
    });
  });

  afterAll(async () => {
    if (testMerchantId) {
      await Promise.all([
        Merchant.deleteMany({ _id: testMerchantId }),
        Order.deleteMany({ merchantId: testMerchantId }),
        Payment.deleteMany({ merchantId: testMerchantId }),
        CheckoutSession.deleteMany({ merchantId: testMerchantId }),
        WebhookDelivery.deleteMany({ merchantId: testMerchantId }),
        WebhookEndpoint.deleteMany({ merchantId: testMerchantId })
      ]);
    }
  });

  it('1. Opening checkout session does NOT create any premature payment attempt (only loads session)', async () => {
    const orderId = generateRandomId('ord');
    await Order.create({
      _id: orderId,
      merchantId: testMerchantId,
      amount: 49900,
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
      amount: 49900,
      currency: 'INR',
      status: 'OPEN',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });

    // Client loads session via GET /checkout/sessions/:id
    const res = await request(app).get(`/api/v1/checkout/sessions/${sessionId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.session.paymentId).toBeUndefined();
    expect(res.body.data.payment).toBeNull();

    // Verify in MongoDB: ZERO payments exist for this order
    const payments = await Payment.find({ orderId }).exec();
    expect(payments.length).toBe(0);

    const order = await Order.findById(orderId).exec();
    expect(order?.attemptsCount).toBe(0);
    expect(order?.status).toBe(OrderStatus.CREATED);
  });

  it('2. Selecting UPI_QR initiates a UPI_QR payment attempt', async () => {
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

    const res = await request(app)
      .post(`/api/v1/checkout/sessions/${sessionId}/initiate`)
      .send({ method: PaymentMethodType.UPI_QR });

    expect(res.status).toBe(201);
    expect(res.body.data.payment.method).toBe(PaymentMethodType.UPI_QR);
    expect(res.body.data.payment.status).toBe(PaymentStatus.PENDING);

    const dbPayment = await Payment.findById(res.body.data.payment._id).exec();
    expect(dbPayment?.method).toBe(PaymentMethodType.UPI_QR);
  });

  it('3. Selecting UPI_INTENT initiates a UPI_INTENT payment attempt', async () => {
    const orderId = generateRandomId('ord');
    await Order.create({
      _id: orderId,
      merchantId: testMerchantId,
      amount: 20000,
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
      amount: 20000,
      currency: 'INR',
      status: 'OPEN',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });

    const res = await request(app)
      .post(`/api/v1/checkout/sessions/${sessionId}/initiate`)
      .send({ method: PaymentMethodType.UPI_INTENT, upiId: 'user@okhdfcbank' });

    expect(res.status).toBe(201);
    expect(res.body.data.payment.method).toBe(PaymentMethodType.UPI_INTENT);
    expect(res.body.data.payment.upiId).toBe('user@okhdfcbank');

    const dbPayment = await Payment.findById(res.body.data.payment._id).exec();
    expect(dbPayment?.method).toBe(PaymentMethodType.UPI_INTENT);
  });

  it('4. Selecting CARD initiates a CARD payment attempt', async () => {
    const orderId = generateRandomId('ord');
    await Order.create({
      _id: orderId,
      merchantId: testMerchantId,
      amount: 9800,
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
      amount: 9800,
      currency: 'INR',
      status: 'OPEN',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });

    const res = await request(app)
      .post(`/api/v1/checkout/sessions/${sessionId}/initiate`)
      .send({
        method: PaymentMethodType.CARD,
        cardDetails: { cardNumber: '4111111111111111', expMonth: 12, expYear: 2028, cvv: '123', holderName: 'Cardholder' }
      });

    expect(res.status).toBe(201);
    expect(res.body.data.payment.method).toBe(PaymentMethodType.CARD);
    expect(res.body.data.payment.cardLast4).toBe('1111');

    const dbPayment = await Payment.findById(res.body.data.payment._id).exec();
    expect(dbPayment?.method).toBe(PaymentMethodType.CARD);
  });

  it('5. Selecting NETBANKING initiates a NETBANKING payment attempt', async () => {
    const orderId = generateRandomId('ord');
    await Order.create({
      _id: orderId,
      merchantId: testMerchantId,
      amount: 75000,
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
      amount: 75000,
      currency: 'INR',
      status: 'OPEN',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });

    const res = await request(app)
      .post(`/api/v1/checkout/sessions/${sessionId}/initiate`)
      .send({
        method: PaymentMethodType.NETBANKING,
        bankCode: 'HDFC'
      });

    expect(res.status).toBe(201);
    expect(res.body.data.payment.method).toBe(PaymentMethodType.NETBANKING);
    expect(res.body.data.payment.bankCode).toBe('HDFC');

    const dbPayment = await Payment.findById(res.body.data.payment._id).exec();
    expect(dbPayment?.method).toBe(PaymentMethodType.NETBANKING);
  });

  it('6. Changing method after initiation safely cancels old attempt and persists the new method', async () => {
    const orderId = generateRandomId('ord');
    await Order.create({
      _id: orderId,
      merchantId: testMerchantId,
      amount: 9800,
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
      amount: 9800,
      currency: 'INR',
      status: 'OPEN',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });

    // Step 1: Customer originally initiated UPI_QR
    const res1 = await request(app)
      .post(`/api/v1/checkout/sessions/${sessionId}/initiate`)
      .send({ method: PaymentMethodType.UPI_QR });

    const firstPaymentId = res1.body.data.payment._id;
    expect(res1.body.data.payment.method).toBe(PaymentMethodType.UPI_QR);

    // Step 2: Customer switches to CARD on checkout and pays
    const res2 = await request(app)
      .post(`/api/v1/checkout/sessions/${sessionId}/pay`)
      .send({
        method: PaymentMethodType.CARD,
        cardDetails: { cardNumber: '4111111111111111', expMonth: 12, expYear: 2028, cvv: '123', holderName: 'Cardholder' },
        action: 'SUCCESS'
      });

    expect(res2.status).toBe(200);
    expect(res2.body.data.payment.method).toBe(PaymentMethodType.CARD);
    expect(res2.body.data.payment.status).toBe(PaymentStatus.SUCCESS);
    expect(res2.body.data.payment._id).not.toBe(firstPaymentId);

    // Verify in MongoDB:
    // Old UPI_QR payment is safely CANCELLED with PAYMENT_METHOD_CHANGED
    const oldPayment = await Payment.findById(firstPaymentId).exec();
    expect(oldPayment?.status).toBe(PaymentStatus.CANCELLED);
    expect(oldPayment?.errorCode).toBe('PAYMENT_METHOD_CHANGED');

    // New payment is SUCCESS with method CARD
    const newPayment = await Payment.findById(res2.body.data.payment._id).exec();
    expect(newPayment?.status).toBe(PaymentStatus.SUCCESS);
    expect(newPayment?.method).toBe(PaymentMethodType.CARD);

    // Order is CAPTURED
    const order = await Order.findById(orderId).exec();
    expect(order?.status).toBe(OrderStatus.CAPTURED);
  });

  it('7. payment.succeeded and payment.failed preserve and deliver the exact selected method', async () => {
    // Test payment.succeeded with NETBANKING
    const orderId1 = generateRandomId('ord');
    await Order.create({
      _id: orderId1,
      merchantId: testMerchantId,
      amount: 30000,
      currency: 'INR',
      status: OrderStatus.CREATED,
      attemptsCount: 0,
      environment: EnvironmentMode.SANDBOX
    });

    const sessionId1 = generateRandomId('cs');
    await CheckoutSession.create({
      _id: sessionId1,
      orderId: orderId1,
      merchantId: testMerchantId,
      amount: 30000,
      currency: 'INR',
      status: 'OPEN',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });

    const successRes = await request(app)
      .post(`/api/v1/checkout/sessions/${sessionId1}/pay`)
      .send({
        method: PaymentMethodType.NETBANKING,
        bankCode: 'ICICI',
        action: 'SUCCESS'
      });

    expect(successRes.status).toBe(200);
    expect(successRes.body.data.payment.method).toBe(PaymentMethodType.NETBANKING);
    expect(successRes.body.data.payment.status).toBe(PaymentStatus.SUCCESS);

    // Test payment.failed with UPI_INTENT
    const orderId2 = generateRandomId('ord');
    await Order.create({
      _id: orderId2,
      merchantId: testMerchantId,
      amount: 30001, // Ends in 01 to deterministically fail
      currency: 'INR',
      status: OrderStatus.CREATED,
      attemptsCount: 0,
      environment: EnvironmentMode.SANDBOX
    });

    const sessionId2 = generateRandomId('cs');
    await CheckoutSession.create({
      _id: sessionId2,
      orderId: orderId2,
      merchantId: testMerchantId,
      amount: 30001,
      currency: 'INR',
      status: 'OPEN',
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });

    const failRes = await request(app)
      .post(`/api/v1/checkout/sessions/${sessionId2}/pay`)
      .send({
        method: PaymentMethodType.UPI_INTENT,
        upiId: 'fail@rgs',
        action: 'FAILED'
      });

    expect(failRes.status).toBe(200);
    expect(failRes.body.data.payment.method).toBe(PaymentMethodType.UPI_INTENT);
    expect(failRes.body.data.payment.status).toBe(PaymentStatus.FAILED);
  });
});
