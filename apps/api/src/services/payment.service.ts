import {
  Order,
  Payment,
  Customer,
  IPayment,
  IOrder,
  AuditLog
} from '../database/models';
import {
  PaymentStatus,
  OrderStatus,
  PaymentMethodType,
  EnvironmentMode,
  ProviderType,
  ManualVerificationStatus,
  UserRole,
  generateRandomId
} from '@rgs-ledger/shared';
import {
  SandboxPaymentProvider,
  PaymentStateMachine,
  DoubleEntryLedger,
  GenericUPIIntentProvider
} from '@rgs-ledger/payment-core';
import { LedgerService } from './ledger.service';
import { enqueueWebhook } from '../queues/webhook-queue';
import { MerchantProviderService } from './merchant-provider.service';
import { config } from '../config';

export class PaymentService {
  private static sandboxProvider = new SandboxPaymentProvider();
  private static initiationLocks = new Map<string, Promise<any>>();

  /**
   * Phase 1: Creates a persistent payment attempt in PENDING state in MongoDB.
   * Concurrency-safe: awaits in-flight creations, checks active PENDING records,
   * and handles database-level partial unique index collisions atomically.
   */
  static async createPaymentAttempt(data: {
    orderId: string;
    method: PaymentMethodType;
    upiId?: string;
    cardDetails?: {
      cardNumber: string;
      expMonth: number;
      expYear: number;
      cvv: string;
      holderName: string;
    };
    bankCode?: string;
    customerIp?: string;
  }): Promise<{ payment: IPayment; order: IOrder; upiUri: string }> {
    // Await any concurrent in-flight payment creation for this order
    const existingLock = this.initiationLocks.get(data.orderId);
    if (existingLock) {
      try {
        await existingLock;
      } catch {
        // proceed to verify database state
      }

      // Check if the previous concurrent request already created an active PENDING payment
      const activePending = await Payment.findOne({
        orderId: data.orderId,
        status: PaymentStatus.PENDING
      }).exec();

      if (activePending) {
        if (activePending.method === data.method) {
          const order = await Order.findById(data.orderId).exec();
          const upiUri = GenericUPIIntentProvider.generateIntentUri({
            payeeVpa: 'sandbox-merchant@rgsbank',
            payeeName: 'Sandbox Merchant',
            transactionRef: String(activePending._id),
            amountPaise: activePending.amount,
            currency: activePending.currency
          });
          return {
            payment: activePending,
            order: order!,
            upiUri
          };
        } else {
          // Method changed: cancel the old pending attempt and proceed to create new attempt
          activePending.status = PaymentStatus.CANCELLED;
          activePending.errorCode = 'PAYMENT_METHOD_CHANGED';
          activePending.errorDescription = `Superseded: Customer changed payment method from ${activePending.method} to ${data.method}`;
          await activePending.save();
        }
      }
    }

    // Synchronously claim the lock before any await so concurrent requests queue
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.initiationLocks.set(data.orderId, lockPromise);

    try {
      const order = await Order.findById(data.orderId).exec();
      if (!order) {
        const err: any = new Error(`Order ${data.orderId} not found`);
        err.status = 404;
        err.code = 'ORDER_NOT_FOUND';
        throw err;
      }

      if (order.status === OrderStatus.CAPTURED) {
        const err: any = new Error('This order has already been successfully paid and captured.');
        err.status = 400;
        err.code = 'ORDER_ALREADY_CAPTURED';
        throw err;
      }

      // Check if an active PENDING payment already exists for this order
      const existingPending = await Payment.findOne({
        orderId: order._id,
        status: PaymentStatus.PENDING
      }).exec();

      if (existingPending) {
        if (existingPending.method === data.method) {
          const upiUri = GenericUPIIntentProvider.generateIntentUri({
            payeeVpa: 'sandbox-merchant@rgsbank',
            payeeName: 'Sandbox Merchant',
            transactionRef: String(existingPending._id),
            amountPaise: existingPending.amount,
            currency: existingPending.currency
          });
          return {
            payment: existingPending,
            order,
            upiUri
          };
        } else {
          // Method changed: cancel the old pending attempt safely and preserve history
          existingPending.status = PaymentStatus.CANCELLED;
          existingPending.errorCode = 'PAYMENT_METHOD_CHANGED';
          existingPending.errorDescription = `Superseded: Customer changed payment method from ${existingPending.method} to ${data.method}`;
          await existingPending.save();
        }
      }
      // Transition order status to ATTEMPTED if currently in CREATED or FAILED
      if (order.status !== OrderStatus.ATTEMPTED) {
        PaymentStateMachine.assertOrderTransition(order.status, OrderStatus.ATTEMPTED);
        order.status = OrderStatus.ATTEMPTED;
      }
      order.attemptsCount += 1;
      await order.save();

      const paymentId = generateRandomId('pay');

      // Resolve merchant-specific provider based on method and environment
      const { provider, providerType, account } = await MerchantProviderService.resolveProviderForPayment(
        order.merchantId,
        data.method,
        order.environment || EnvironmentMode.SANDBOX
      );

      // Callback and redirect endpoints
      const callbackUrl = `${config.apiUrl}/api/v1/callbacks/${providerType.toLowerCase()}`;
      const redirectUrl = `${config.checkoutUrl}/checkout/${order._id}`;

      let initResult: any = null;
      try {
        initResult = await provider.initiatePayment({
          paymentId,
          orderId: String(order._id),
          merchantId: order.merchantId,
          amount: order.amount,
          currency: order.currency,
          method: data.method,
          upiId: data.upiId,
          cardDetails: data.cardDetails,
          bankCode: data.bankCode,
          customerPhone: order.customer?.phone || '9999999999',
          customerEmail: order.customer?.email,
          customerName: order.customer?.name,
          merchantVpa: account?.vpaConfig?.vpa,
          merchantName: account?.vpaConfig?.displayName,
          callbackUrl,
          redirectUrl,
          idempotencyKey: paymentId
        });
      } catch (provErr: any) {
        // If provider rejected initiation
        initResult = {
          providerPaymentId: `err_${paymentId}`,
          status: PaymentStatus.FAILED,
          errorCode: provErr.code || 'PROVIDER_INITIATION_FAILED',
          errorMessage: provErr.message
        };
      }

      const providerPaymentId = initResult?.providerPaymentId || `sbx_pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const manualVerificationStatus = providerType === ProviderType.UPI_QR_MANUAL
        ? ManualVerificationStatus.AWAITING_MANUAL_CONFIRMATION
        : ManualVerificationStatus.NOT_APPLICABLE;

      let payment: IPayment;
      try {
        // Create Initial Payment Record in PENDING (or FAILED if unconfigured) state in MongoDB
        payment = await Payment.create({
          _id: paymentId,
          orderId: order._id,
          merchantId: order.merchantId,
          amount: order.amount,
          currency: order.currency,
          status: initResult?.status === PaymentStatus.FAILED ? PaymentStatus.FAILED : PaymentStatus.PENDING,
          method: data.method,
          providerType,
          providerPaymentId,
          providerTransactionId: initResult?.providerTransactionId,
          paymentUrl: initResult?.paymentUrl,
          upiUri: initResult?.upiUri,
          manualVerificationStatus,
          rawProviderResponse: initResult?.rawResponse,
          upiId: data.upiId,
          cardNetwork: data.cardDetails?.cardNumber?.startsWith('4') ? 'VISA' : (data.cardDetails ? 'MASTERCARD' : undefined),
          cardLast4: data.cardDetails?.cardNumber ? data.cardDetails.cardNumber.slice(-4) : undefined,
          bankCode: data.bankCode,
          errorCode: initResult?.errorCode,
          errorDescription: initResult?.errorMessage,
          environment: order.environment || EnvironmentMode.SANDBOX
        });
      } catch (createErr: any) {
        // Atomic protection: if partial unique index on { orderId: 1, status: PENDING } caught a race
        if (createErr.code === 11000 || createErr.name === 'MongoServerError') {
          const racePending = await Payment.findOne({
            orderId: order._id,
            status: PaymentStatus.PENDING
          }).exec();
          if (racePending) {
            const upiUri = racePending.upiUri || GenericUPIIntentProvider.generateIntentUri({
              payeeVpa: account?.vpaConfig?.vpa || 'sandbox-merchant@rgsbank',
              payeeName: account?.vpaConfig?.displayName || 'Sandbox Merchant',
              transactionRef: String(racePending._id),
              amountPaise: racePending.amount,
              currency: racePending.currency
            });
            return {
              payment: racePending,
              order,
              upiUri,
              paymentUrl: racePending.paymentUrl
            };
          }
        }
        throw createErr;
      }

      // Generate default UPI Intent URI if none returned by provider
      const upiUri = initResult?.upiUri || GenericUPIIntentProvider.generateIntentUri({
        payeeVpa: account?.vpaConfig?.vpa || 'sandbox-merchant@rgsbank',
        payeeName: account?.vpaConfig?.displayName || 'Sandbox Merchant',
        transactionRef: String(payment._id),
        amountPaise: payment.amount,
        currency: payment.currency
      });

      if (!payment.upiUri) {
        payment.upiUri = upiUri;
        await payment.save();
      }

      // Enqueue payment.created webhook event
      enqueueWebhook({
        merchantId: order.merchantId,
        event: 'payment.created',
        payload: {
          paymentId: String(payment._id),
          orderId: String(order._id),
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          method: payment.method
        }
      });

      return {
        payment,
        order,
        upiUri,
        paymentUrl: payment.paymentUrl,
        qrImage: initResult?.qrImage
      };
    } finally {
      this.initiationLocks.delete(data.orderId);
      resolveLock();
    }
  }

  /**
   * Phase 2: Resolves an existing PENDING payment to SUCCESS, FAILED, or retains PENDING
   */
  static async resolvePayment(data: {
    paymentId: string;
    action: 'SUCCESS' | 'FAILED' | 'PENDING';
    errorCode?: string;
    errorMessage?: string;
  }): Promise<{ payment: IPayment; order: IOrder }> {
    const payment = await Payment.findById(data.paymentId).exec();
    if (!payment) {
      const err: any = new Error(`Payment ${data.paymentId} not found`);
      err.status = 404;
      err.code = 'PAYMENT_NOT_FOUND';
      throw err;
    }

    const order = await Order.findById(payment.orderId).exec();
    if (!order) {
      const err: any = new Error(`Order ${payment.orderId} not found`);
      err.status = 404;
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    // Idempotency: If payment is already in SUCCESS, return existing record without duplicate ledger captures
    if (payment.status === PaymentStatus.SUCCESS) {
      if (data.action === 'SUCCESS') {
        return { payment, order };
      }
      const err: any = new Error('Cannot change status of an already captured payment.');
      err.status = 400;
      err.code = 'PAYMENT_ALREADY_SUCCESS';
      throw err;
    }

    // Idempotency: If payment is already FAILED
    if (payment.status === PaymentStatus.FAILED && data.action === 'FAILED') {
      return { payment, order };
    }

    if (data.action === 'SUCCESS') {
      PaymentStateMachine.assertPaymentTransition(payment.status, PaymentStatus.SUCCESS);
      payment.status = PaymentStatus.SUCCESS;
      payment.capturedAt = new Date();
      await payment.save();

      // Transition order to CAPTURED
      PaymentStateMachine.assertOrderTransition(order.status, OrderStatus.CAPTURED);
      order.status = OrderStatus.CAPTURED;
      order.amountPaid = order.amount;
      await order.save();

      // Auto-cancel any remaining orphan PENDING payment attempts for this order
      await Payment.updateMany(
        {
          orderId: order._id,
          _id: { $ne: payment._id },
          status: PaymentStatus.PENDING
        },
        {
          $set: {
            status: PaymentStatus.CANCELLED,
            errorCode: 'ORDER_CAPTURED_SUPERSEDED',
            errorDescription: `Superseded: Order successfully captured by payment ${payment._id}`
          }
        }
      ).exec();

      // Record double-entry financial ledger journal
      const journalBatch = DoubleEntryLedger.createPaymentCaptureJournal({
        merchantId: order.merchantId,
        paymentId: String(payment._id),
        grossAmountMinor: payment.amount,
        currency: payment.currency
      });
      await LedgerService.recordJournal(journalBatch);

      // Update customer lifetime metrics
      if (order.customer?.email) {
        await Customer.findOneAndUpdate(
          { merchantId: order.merchantId, email: order.customer.email.toLowerCase() },
          {
            $inc: { totalPaymentsPaise: payment.amount, paymentsCount: 1 },
            $setOnInsert: { _id: generateRandomId('cust'), name: order.customer.name || 'Customer' }
          },
          { upsert: true }
        ).exec();
      }

      // Enqueue payment.succeeded webhook
      enqueueWebhook({
        merchantId: order.merchantId,
        event: 'payment.succeeded',
        payload: {
          paymentId: String(payment._id),
          orderId: String(order._id),
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          method: payment.method,
          capturedAt: payment.capturedAt
        }
      });
    } else if (data.action === 'FAILED') {
      PaymentStateMachine.assertPaymentTransition(payment.status, PaymentStatus.FAILED);
      payment.status = PaymentStatus.FAILED;
      payment.errorCode = data.errorCode || 'PAYMENT_FAILED_USER_DECLINED';
      payment.errorDescription = data.errorMessage || 'Transaction declined by user in UPI App (Simulated Sandbox)';
      await payment.save();

      order.status = OrderStatus.FAILED;
      await order.save();

      enqueueWebhook({
        merchantId: order.merchantId,
        event: 'payment.failed',
        payload: {
          paymentId: String(payment._id),
          orderId: String(order._id),
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          method: payment.method,
          errorCode: payment.errorCode,
          errorDescription: payment.errorDescription
        }
      });
    } else {
      // Retain in PENDING status
      payment.status = PaymentStatus.PENDING;
      await payment.save();
    }

    return { payment, order };
  }

  /**
   * Unified initiatePayment: Initiates attempt and executes simulated provider outcome
   */
  static async initiatePayment(data: {
    orderId: string;
    method: PaymentMethodType;
    upiId?: string;
    cardDetails?: {
      cardNumber: string;
      expMonth: number;
      expYear: number;
      cvv: string;
      holderName: string;
    };
    bankCode?: string;
    customerIp?: string;
  }): Promise<{ payment: IPayment; order: IOrder; upiUri?: string }> {
    // 1. Create persistent PENDING payment attempt in MongoDB
    const attempt = await this.createPaymentAttempt(data);

    // 2. Determine sandbox provider outcome
    const providerResponse = await this.sandboxProvider.initiatePayment({
      paymentId: String(attempt.payment._id),
      orderId: String(attempt.order._id),
      amount: attempt.order.amount,
      currency: attempt.order.currency,
      method: data.method,
      upiId: data.upiId,
      cardDetails: data.cardDetails,
      bankCode: data.bankCode,
      customerIp: data.customerIp
    });

    attempt.payment.providerPaymentId = providerResponse.providerPaymentId;
    await Payment.findByIdAndUpdate(attempt.payment._id, { providerPaymentId: providerResponse.providerPaymentId }).exec();

    // 3. Resolve according to provider status
    if (providerResponse.status === PaymentStatus.SUCCESS) {
      const resolved = await this.resolvePayment({
        paymentId: String(attempt.payment._id),
        action: 'SUCCESS'
      });
      return {
        payment: resolved.payment,
        order: resolved.order,
        upiUri: providerResponse.upiUri || attempt.upiUri
      };
    } else if (providerResponse.status === PaymentStatus.FAILED) {
      const resolved = await this.resolvePayment({
        paymentId: String(attempt.payment._id),
        action: 'FAILED',
        errorCode: providerResponse.errorCode,
        errorMessage: providerResponse.errorMessage
      });
      return {
        payment: resolved.payment,
        order: resolved.order,
        upiUri: providerResponse.upiUri || attempt.upiUri
      };
    } else {
      // Pending
      return {
        payment: attempt.payment,
        order: attempt.order,
        upiUri: providerResponse.upiUri || attempt.upiUri
      };
    }
  }

  /**
   * Phase 4 & 5: Authoritatively confirms a raw UPI QR payment after independent UTR/bank verification.
   * Prevents fraud by strictly prohibiting unverified auto-success on raw QR codes.
   */
  static async confirmManualPayment(params: {
    paymentId: string;
    utr: string;
    verifiedBy: string;
    notes?: string;
  }): Promise<{ payment: IPayment; order: IOrder }> {
    const payment = await Payment.findById(params.paymentId).exec();
    if (!payment) {
      const err: any = new Error(`Payment ${params.paymentId} not found`);
      err.status = 404;
      err.code = 'PAYMENT_NOT_FOUND';
      throw err;
    }

    if (payment.status !== PaymentStatus.PENDING) {
      const err: any = new Error(`Only PENDING payments can be manually confirmed. Current status: ${payment.status}`);
      err.status = 400;
      err.code = 'INVALID_PAYMENT_STATUS';
      throw err;
    }

    if (payment.manualVerificationStatus !== ManualVerificationStatus.AWAITING_MANUAL_CONFIRMATION) {
      const err: any = new Error(`Payment ${payment._id} is not awaiting manual confirmation.`);
      err.status = 400;
      err.code = 'NOT_AWAITING_MANUAL_CONFIRMATION';
      throw err;
    }

    if (!params.utr || params.utr.trim().length < 6) {
      const err: any = new Error('A valid Bank Transaction Reference / UTR (minimum 6 alphanumeric characters) is required for manual confirmation.');
      err.status = 400;
      err.code = 'INVALID_UTR';
      throw err;
    }

    payment.manualVerificationStatus = ManualVerificationStatus.MANUAL_VERIFIED;
    payment.manualVerificationDetails = {
      verifiedBy: params.verifiedBy,
      utr: params.utr.trim(),
      verifiedAt: new Date(),
      notes: params.notes
    };
    await payment.save();

    // Authoritatively resolve payment to SUCCESS
    const res = await this.resolvePayment({
      paymentId: String(payment._id),
      action: 'SUCCESS'
    });

    // Record audit trail
    await AuditLog.create({
      _id: generateRandomId('audit'),
      actorId: params.verifiedBy,
      actorEmail: params.verifiedBy,
      actorRole: UserRole.FINANCE,
      merchantId: payment.merchantId,
      action: 'PAYMENT_MANUAL_CONFIRMED',
      targetEntity: 'Payment',
      targetId: String(payment._id),
      changes: {
        utr: params.utr.trim(),
        verifiedBy: params.verifiedBy,
        notes: params.notes
      }
    });

    return res;
  }

  /**
   * Phase 4: Independent Server-Side Payment Reconciliation via Provider Status API
   */
  static async reconcilePayment(paymentId: string): Promise<{ payment: IPayment; order: IOrder; reconciled: boolean }> {
    const payment = await Payment.findById(paymentId).exec();
    if (!payment) {
      const err: any = new Error(`Payment ${paymentId} not found`);
      err.status = 404;
      err.code = 'PAYMENT_NOT_FOUND';
      throw err;
    }

    const order = await Order.findById(payment.orderId).exec();
    if (!order) {
      const err: any = new Error(`Order ${payment.orderId} not found`);
      err.status = 404;
      err.code = 'ORDER_NOT_FOUND';
      throw err;
    }

    if (payment.status !== PaymentStatus.PENDING) {
      return { payment, order, reconciled: false };
    }

    const { provider } = await MerchantProviderService.resolveProviderForPayment(
      payment.merchantId,
      payment.method,
      payment.environment
    );

    if (!provider.capabilities.supportsStatusCheck) {
      return { payment, order, reconciled: false };
    }

    const statusResp = await provider.verifyPayment(
      payment.providerPaymentId || String(payment._id),
      payment.amount
    );

    if (statusResp.status === PaymentStatus.SUCCESS) {
      const res = await this.resolvePayment({
        paymentId: String(payment._id),
        action: 'SUCCESS'
      });
      return { ...res, reconciled: true };
    }

    if (statusResp.status === PaymentStatus.FAILED) {
      const res = await this.resolvePayment({
        paymentId: String(payment._id),
        action: 'FAILED',
        errorCode: statusResp.errorCode,
        errorMessage: statusResp.errorMessage
      });
      return { ...res, reconciled: true };
    }

    return { payment, order, reconciled: false };
  }

  static async getPayment(paymentId: string, merchantId?: string): Promise<IPayment> {
    const query: any = { _id: paymentId };
    if (merchantId) query.merchantId = merchantId;

    const payment = await Payment.findOne(query).exec();
    if (!payment) {
      const err: any = new Error(`Payment ${paymentId} not found`);
      err.status = 404;
      err.code = 'PAYMENT_NOT_FOUND';
      throw err;
    }
    return payment;
  }

  static async listPayments(params: {
    merchantId?: string;
    orderId?: string;
    status?: PaymentStatus;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const query: any = {};
    if (params.merchantId) query.merchantId = params.merchantId;
    if (params.orderId) query.orderId = params.orderId;
    if (params.status) query.status = params.status;

    const [payments, total] = await Promise.all([
      Payment.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      Payment.countDocuments(query).exec()
    ]);

    return {
      payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}
