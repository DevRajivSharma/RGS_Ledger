import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app';
import { config } from '../src/config';
import {
  Merchant,
  User,
  Order,
  Payment,
  CheckoutSession,
  LedgerTransaction,
  LedgerEntry,
  WebhookDelivery
} from '../src/database/models';
import {
  OrderStatus,
  PaymentStatus,
  PaymentMethodType,
  EnvironmentMode,
  KycStatus,
  generateRandomId
} from '@rgs-ledger/shared';

describe('Payment Attempt Lifecycle & State Synchronization', () => {
  const app = createApp();
  let testMerchantId: string;
  let testOrderId: string;
  let testSessionId: string;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(config.mongoUri);
    }

    testMerchantId = generateRandomId('mer');
    await Merchant.create({
      _id: testMerchantId,
      businessName: 'Lifecycle Test Merchant',
      businessType: 'PRIVATE_LIMITED',
      contactEmail: 'lifecycle@test.com',
      contactPhone: '+919999999999',
      kycStatus: KycStatus.APPROVED,
      environment: EnvironmentMode.SANDBOX,
      isActive: true
    });
  });

  afterAll(async () => {
    // Clean up test records
    if (testMerchantId) {
      await Promise.all([
        Merchant.deleteMany({ _id: testMerchantId }),
        Order.deleteMany({ merchantId: testMerchantId }),
        Payment.deleteMany({ merchantId: testMerchantId }),
        CheckoutSession.deleteMany({ merchantId: testMerchantId })
      ]);
    }
  });

  it('1. ORDER CREATION: creates an order record without creating any payment transaction', async () => {
    testOrderId = generateRandomId('ord');
    const order = await Order.create({
      _id: testOrderId,
      merchantId: testMerchantId,
      amount: 250000, // ₹2,500.00
      currency: 'INR',
      status: OrderStatus.CREATED,
      receipt: 'LIFECYCLE-REC-01',
      attemptsCount: 0,
      amountPaid: 0,
      amountRefunded: 0,
      environment: EnvironmentMode.SANDBOX
    });

    expect(order).toBeDefined();
    expect(order.status).toBe(OrderStatus.CREATED);
    expect(order.attemptsCount).toBe(0);

    // Verify zero payment records exist for this order
    const payments = await Payment.find({ orderId: testOrderId }).exec();
    expect(payments.length).toBe(0);
  });

  it('2. PAYMENT INITIATION: checkout initiation creates one persistent PENDING transaction in MongoDB', async () => {
    // Create checkout session
    testSessionId = generateRandomId('cs');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await CheckoutSession.create({
      _id: testSessionId,
      orderId: testOrderId,
      merchantId: testMerchantId,
      amount: 250000,
      currency: 'INR',
      status: 'OPEN',
      successUrl: 'http://localhost:5174/status/success',
      cancelUrl: 'http://localhost:5174/status/cancel',
      expiresAt
    });

    // Initiate payment attempt (e.g. UPI_QR load)
    const initRes = await request(app)
      .post(`/api/v1/checkout/sessions/${testSessionId}/initiate`)
      .send({ method: PaymentMethodType.UPI_QR });

    expect(initRes.status).toBe(201);
    expect(initRes.body.success).toBe(true);
    expect(initRes.body.data.payment).toBeDefined();

    const createdPayment = initRes.body.data.payment;
    expect(createdPayment.status).toBe('PENDING');
    expect(createdPayment.orderId).toBe(testOrderId);
    expect(createdPayment.merchantId).toBe(testMerchantId);
    expect(createdPayment._id).toMatch(/^pay_/);

    // Verify in MongoDB directly
    const dbPayment = await Payment.findById(createdPayment._id).exec();
    expect(dbPayment).not.toBeNull();
    expect(dbPayment!.status).toBe(PaymentStatus.PENDING);

    // Verify order attemptsCount incremented to 1 and status moved to ATTEMPTED
    const dbOrder = await Order.findById(testOrderId).exec();
    expect(dbOrder!.attemptsCount).toBe(1);
    expect(dbOrder!.status).toBe(OrderStatus.ATTEMPTED);

    // Verify session retained the paymentId
    const dbSession = await CheckoutSession.findById(testSessionId).exec();
    expect(dbSession!.paymentId).toBe(createdPayment._id);
  });

  it('3. IDEMPOTENCY: repeated initiation with same method / session reuses existing PENDING payment', async () => {
    const repeatRes = await request(app)
      .post(`/api/v1/checkout/sessions/${testSessionId}/initiate`)
      .send({ method: PaymentMethodType.UPI_QR });

    expect(repeatRes.status).toBe(201);
    const payments = await Payment.find({ orderId: testOrderId }).exec();
    // Must NOT have created a duplicate payment
    expect(payments.length).toBe(1);

    // Order attempt count should still be 1
    const dbOrder = await Order.findById(testOrderId).exec();
    expect(dbOrder!.attemptsCount).toBe(1);
  });

  it('4. PAGE REFRESH SYNCHRONIZATION: getSession returns existing payment without creating duplicates', async () => {
    // Simulates customer refreshing browser (F5) on checkout
    const sessionRes = await request(app).get(`/api/v1/checkout/sessions/${testSessionId}`);

    expect(sessionRes.status).toBe(200);
    expect(sessionRes.body.data.payment).toBeDefined();
    expect(sessionRes.body.data.payment.id).toBeDefined();
    expect(sessionRes.body.data.payment.status).toBe('PENDING');
    expect(sessionRes.body.data.order.attemptsCount).toBe(1);

    const totalPayments = await Payment.countDocuments({ orderId: testOrderId }).exec();
    expect(totalPayments).toBe(1);
  });

  it('5. SANDBOX SUCCESS: updates the SAME transaction from PENDING to SUCCESS and creates balanced ledger', async () => {
    const payRes = await request(app)
      .post(`/api/v1/checkout/sessions/${testSessionId}/pay`)
      .send({
        method: PaymentMethodType.UPI_QR,
        action: 'SUCCESS',
        upiId: 'success@rgs'
      });

    expect(payRes.status).toBe(200);
    expect(payRes.body.data.payment.status).toBe('SUCCESS');

    // Verify only 1 payment exists and its status transitioned to SUCCESS
    const payments = await Payment.find({ orderId: testOrderId }).exec();
    expect(payments.length).toBe(1);
    expect(payments[0].status).toBe(PaymentStatus.SUCCESS);
    expect(payments[0].capturedAt).toBeDefined();

    // Verify order transitioned to CAPTURED
    const dbOrder = await Order.findById(testOrderId).exec();
    expect(dbOrder!.status).toBe(OrderStatus.CAPTURED);
    expect(dbOrder!.amountPaid).toBe(250000);

    // Verify double-entry financial ledger journal
    const ledgerTx = await LedgerTransaction.findOne({ referenceId: payments[0]._id }).exec();
    expect(ledgerTx).not.toBeNull();

    const entries = await LedgerEntry.find({ transactionId: ledgerTx!._id }).exec();
    expect(entries.length).toBe(4);

    let debits = 0;
    let credits = 0;
    for (const e of entries) {
      if (e.direction === 'DEBIT') debits += e.amountMinor;
      if (e.direction === 'CREDIT') credits += e.amountMinor;
    }
    expect(debits).toBe(250000);
    expect(credits).toBe(250000);
    expect(debits).toBe(credits);
  });

  it('6. FINANCIAL SAFETY: repeated success calls are idempotent and do not create duplicate ledger entries', async () => {
    const repeatPayRes = await request(app)
      .post(`/api/v1/checkout/sessions/${testSessionId}/pay`)
      .send({
        method: PaymentMethodType.UPI_QR,
        action: 'SUCCESS'
      });

    expect(repeatPayRes.status).toBe(200);

    // Verify still exactly 1 ledger transaction and 4 ledger entries
    const payment = await Payment.findOne({ orderId: testOrderId }).exec();
    const ledgerTxList = await LedgerTransaction.find({ referenceId: payment!._id }).exec();
    expect(ledgerTxList.length).toBe(1);

    const totalEntries = await LedgerEntry.countDocuments({ transactionId: ledgerTxList[0]._id }).exec();
    expect(totalEntries).toBe(4);
  });

  it('7. SANDBOX FAILURE: updates existing PENDING transaction to FAILED without capture ledger', async () => {
    // Create new order for failure test
    const failOrderId = generateRandomId('ord');
    await Order.create({
      _id: failOrderId,
      merchantId: testMerchantId,
      amount: 150000,
      currency: 'INR',
      status: OrderStatus.CREATED,
      attemptsCount: 0,
      environment: EnvironmentMode.SANDBOX
    });

    const failSessionId = generateRandomId('cs');
    await CheckoutSession.create({
      _id: failSessionId,
      orderId: failOrderId,
      merchantId: testMerchantId,
      amount: 150000,
      currency: 'INR',
      status: 'OPEN',
      successUrl: 'http://localhost/success',
      cancelUrl: 'http://localhost/cancel',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });

    // 1. Customer opens checkout -> PENDING payment initiated
    const initRes = await request(app)
      .post(`/api/v1/checkout/sessions/${failSessionId}/initiate`)
      .send({ method: PaymentMethodType.UPI_INTENT });

    const pendingPaymentId = initRes.body.data.payment._id;
    expect(initRes.body.data.payment.status).toBe('PENDING');

    // 2. Customer declines on UPI app -> FAILED
    const failRes = await request(app)
      .post(`/api/v1/checkout/sessions/${failSessionId}/pay`)
      .send({
        paymentId: pendingPaymentId,
        action: 'FAILED',
        upiId: 'fail@rgs'
      });

    expect(failRes.status).toBe(200);
    expect(failRes.body.data.payment.status).toBe('FAILED');
    expect(failRes.body.data.payment._id).toBe(pendingPaymentId);

    // Verify in MongoDB: same transaction, status FAILED
    const dbPayments = await Payment.find({ orderId: failOrderId }).exec();
    expect(dbPayments.length).toBe(1);
    expect(dbPayments[0].status).toBe(PaymentStatus.FAILED);
    expect(dbPayments[0].errorCode).toBe('PAYMENT_FAILED_USER_DECLINED');

    // Order status FAILED
    const dbOrder = await Order.findById(failOrderId).exec();
    expect(dbOrder!.status).toBe(OrderStatus.FAILED);

    // Verify NO capture ledger was written for failed transaction
    const ledgerTx = await LedgerTransaction.findOne({ referenceId: pendingPaymentId }).exec();
    expect(ledgerTx).toBeNull();
  });

  it('8. SANDBOX PENDING & SIMULATED PROVIDER CALLBACK: stays PENDING until simulated bank callback', async () => {
    // Create new order for pending callback test
    const pendOrderId = generateRandomId('ord');
    await Order.create({
      _id: pendOrderId,
      merchantId: testMerchantId,
      amount: 99900,
      currency: 'INR',
      status: OrderStatus.CREATED,
      attemptsCount: 0,
      environment: EnvironmentMode.SANDBOX
    });

    const pendSessionId = generateRandomId('cs');
    await CheckoutSession.create({
      _id: pendSessionId,
      orderId: pendOrderId,
      merchantId: testMerchantId,
      amount: 99900,
      currency: 'INR',
      status: 'OPEN',
      successUrl: 'http://localhost/success',
      cancelUrl: 'http://localhost/cancel',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });

    // 1. Customer initiates payment
    const initRes = await request(app)
      .post(`/api/v1/checkout/sessions/${pendSessionId}/initiate`)
      .send({ method: PaymentMethodType.UPI_QR });

    const paymentId = initRes.body.data.payment._id;

    // 2. Customer simulates Pending state
    const pendRes = await request(app)
      .post(`/api/v1/checkout/sessions/${pendSessionId}/pay`)
      .send({
        paymentId,
        action: 'PENDING'
      });

    expect(pendRes.status).toBe(200);
    expect(pendRes.body.data.payment.status).toBe('PENDING');

    // Verify in DB that it is PENDING and order is ATTEMPTED (not captured)
    const midPayment = await Payment.findById(paymentId).exec();
    expect(midPayment!.status).toBe(PaymentStatus.PENDING);

    const midOrder = await Order.findById(pendOrderId).exec();
    expect(midOrder!.status).toBe(OrderStatus.ATTEMPTED);

    // 3. Later simulated provider webhook callback marks it SUCCESS
    const callbackRes = await request(app)
      .post(`/api/v1/payments/${paymentId}/simulate-callback`)
      .send({ status: 'SUCCESS' });

    expect(callbackRes.status).toBe(200);
    expect(callbackRes.body.data.payment.status).toBe('SUCCESS');

    // Verify SAME transaction transitioned to SUCCESS
    const finalPayment = await Payment.findById(paymentId).exec();
    expect(finalPayment!.status).toBe(PaymentStatus.SUCCESS);

    // Verify order transitioned to CAPTURED
    const finalOrder = await Order.findById(pendOrderId).exec();
    expect(finalOrder!.status).toBe(OrderStatus.CAPTURED);

    // Verify ledger capture journal now exists and balances
    const ledgerTx = await LedgerTransaction.findOne({ referenceId: paymentId }).exec();
    expect(ledgerTx).not.toBeNull();
  });
});
