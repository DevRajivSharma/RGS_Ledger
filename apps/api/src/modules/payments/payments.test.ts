import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PaymentService, IPaymentRepository } from './index.js';
import { PaymentStatus } from '@rgs-ledger/shared-types';
import { MerchantBankAccountModel } from '../../database/models.js';

class MockPaymentRepository implements IPaymentRepository {
  payments: Map<string, any> = new Map();

  async create(merchantId: string, data: any) {
    // Simulate MongoDB unique index behavior:
    // 1. Unique index on { merchantId: 1, orderId: 1 }
    for (const record of this.payments.values()) {
      if (record.merchantId === merchantId && record.orderId === data.orderId) {
        const dupError: any = new Error(`E11000 duplicate key error collection: test.payment_requests index: merchantId_1_orderId_1 dup key: { merchantId: "${merchantId}", orderId: "${data.orderId}" }`);
        dupError.code = 11000;
        throw dupError;
      }
    }

    // 2. Partial unique compound index on { merchantId: 1, idempotencyKey: 1 } with partialFilterExpression: { idempotencyKey: { $type: 'string' } }
    if (typeof data.idempotencyKey === 'string') {
      for (const record of this.payments.values()) {
        if (record.merchantId === merchantId && record.idempotencyKey === data.idempotencyKey) {
          const dupError: any = new Error(`E11000 duplicate key error collection: test.payment_requests index: merchantId_1_idempotencyKey_1 dup key: { merchantId: "${merchantId}", idempotencyKey: "${data.idempotencyKey}" }`);
          dupError.code = 11000;
          throw dupError;
        }
      }
    }

    // Notice: if data.idempotencyKey is undefined/null (or non-string), it is NOT indexed, so multiple documents without idempotencyKey never conflict.
    const id = `pay_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const record = { _id: id, id, merchantId, ...data };
    this.payments.set(`${merchantId}:${id}`, record);
    return record;
  }

  async findById(merchantId: string, paymentId: string) {
    const record = this.payments.get(`${merchantId}:${paymentId}`);
    return record ? { ...record } : null;
  }

  async findByIdempotencyKey(merchantId: string, key: string) {
    for (const record of this.payments.values()) {
      if (record.merchantId === merchantId && record.idempotencyKey === key) {
        return { ...record };
      }
    }
    return null;
  }

  async findByOrderId(merchantId: string, orderId: string) {
    for (const record of this.payments.values()) {
      if (record.merchantId === merchantId && record.orderId === orderId) {
        return { ...record };
      }
    }
    return null;
  }

  async listByMerchant(merchantId: string, filter?: { status?: string; limit?: number; skip?: number }) {
    const matched = [];
    for (const record of this.payments.values()) {
      if (record.merchantId === merchantId) {
        if (!filter?.status || record.status === filter.status) {
          matched.push({ ...record });
        }
      }
    }
    return { items: matched, total: matched.length };
  }

  async updateStatus(merchantId: string, paymentId: string, status: PaymentStatus) {
    const key = `${merchantId}:${paymentId}`;
    const record = this.payments.get(key);
    if (!record) return null;
    record.status = status;
    this.payments.set(key, record);
    return { ...record };
  }
}

describe('PaymentService — Payment Engine & Lifecycle', () => {
  const sampleMerchant = {
    _id: 'mer_123',
    name: 'Test Merchant Store',
    upiConfig: {
      vpa: 'testmerchant@okhdfcbank',
      businessName: 'Test Merchant Store',
      isAcceptingPayments: true
    }
  };

  const merchantFinder = async (id: string) => {
    if (id === 'mer_123') return sampleMerchant;
    if (id === 'mer_no_upi') {
      return {
        _id: 'mer_no_upi',
        name: 'No UPI Merchant',
        upiConfig: { isAcceptingPayments: true }
      };
    }
    if (id === 'mer_not_accepting') {
      return {
        _id: 'mer_not_accepting',
        name: 'Disabled Merchant',
        upiConfig: {
          vpa: 'disabled@upi',
          businessName: 'Disabled Merchant',
          isAcceptingPayments: false
        }
      };
    }
    return null;
  };

  it('creates payment request with valid QR code, intent links, and chk_ reference', async () => {
    const repo = new MockPaymentRepository();
    const service = new PaymentService(repo, merchantFinder);

    const res = await service.createPayment('mer_123', {
      orderId: 'ORD_1001',
      amountPaise: 49900, // ₹499.00
      description: 'Shoes purchase',
      expiresInMinutes: 15
    });

    const payment = res.payment;
    assert.ok(payment.id.startsWith('pay_'));
    assert.strictEqual(payment.orderId, 'ORD_1001');
    assert.strictEqual(payment.amountPaise, 49900);
    assert.strictEqual(payment.status, PaymentStatus.PENDING);
    assert.ok(payment.checkoutReference.startsWith('chk_'));

    // Check QR code data URL and NPCI UPI URI
    assert.ok(payment.qrDataUrl.startsWith('data:image/png;base64,'));
    assert.ok(payment.upiUri.startsWith('upi://pay?'));
    assert.strictEqual(payment.upiUri.includes('mode=04'), false);
    assert.ok(payment.upiUri.includes('pa='));
    assert.strictEqual(payment.upiUri.includes('%40'), false);
    assert.ok(payment.upiUri.includes('am=499'));
    assert.ok(res.checkoutUrl.startsWith('/checkout/chk_'));
  });

  it('enforces idempotency using idempotencyKey', async () => {
    const repo = new MockPaymentRepository();
    const service = new PaymentService(repo, merchantFinder);

    const first = await service.createPayment('mer_123', {
      orderId: 'ORD_IDEM_1',
      amountPaise: 15000,
      idempotencyKey: 'idem_key_xyz_999'
    });

    // Replay with identical idempotencyKey
    const second = await service.createPayment('mer_123', {
      orderId: 'ORD_IDEM_1',
      amountPaise: 15000,
      idempotencyKey: 'idem_key_xyz_999'
    });

    assert.strictEqual(first.payment.id, second.payment.id);
    assert.strictEqual(first.payment.checkoutReference, second.payment.checkoutReference);
    assert.strictEqual(first.payment.upiUri, second.payment.upiUri);
  });

  it('rejects duplicate active payment for the same order ID with 409', async () => {
    const repo = new MockPaymentRepository();
    const service = new PaymentService(repo, merchantFinder);

    await service.createPayment('mer_123', {
      orderId: 'ORD_DUP_CHECK',
      amountPaise: 25000
    });

    await assert.rejects(
      async () => {
        await service.createPayment('mer_123', {
          orderId: 'ORD_DUP_CHECK',
          amountPaise: 25000
        });
      },
      (err: any) => err.code === 'ORDER_ALREADY_EXISTS' && err.statusCode === 409
    );
  });

  it('rejects payment creation when merchant is not accepting payments (403)', async () => {
    const repo = new MockPaymentRepository();
    const service = new PaymentService(repo, merchantFinder);

    await assert.rejects(
      async () => {
        await service.createPayment('mer_not_accepting', {
          orderId: 'ORD_FAIL_ACCEPT',
          amountPaise: 10000
        });
      },
      (err: any) => err.code === 'PAYMENT_ACCEPTANCE_DISABLED' && err.statusCode === 403
    );
  });

  it('rejects payment creation when merchant UPI is not configured (400)', async () => {
    const repo = new MockPaymentRepository();
    const service = new PaymentService(repo, merchantFinder);

    await assert.rejects(
      async () => {
        await service.createPayment('mer_no_upi', {
          orderId: 'ORD_FAIL_UPI',
          amountPaise: 10000
        });
      },
      (err: any) => err.code === 'UPI_NOT_CONFIGURED' && err.statusCode === 400
    );
  });

  it('cancels a pending payment and transitions status to CANCELLED', async () => {
    const repo = new MockPaymentRepository();
    const service = new PaymentService(repo, merchantFinder);

    const res = await service.createPayment('mer_123', {
      orderId: 'ORD_CANCEL_ME',
      amountPaise: 30000
    });

    const payment = res.payment;
    const cancelRes = await service.cancelPayment('mer_123', payment.id);
    assert.strictEqual(cancelRes.status, PaymentStatus.CANCELLED);
    assert.strictEqual(cancelRes.paymentId, payment.id);

    // Fetching the payment reflects CANCELLED status
    const fetched = await service.getPayment('mer_123', payment.id);
    assert.strictEqual(fetched.payment.status, PaymentStatus.CANCELLED);

    // Cancelling an already cancelled payment must reject
    await assert.rejects(
      async () => {
        await service.cancelPayment('mer_123', payment.id);
      },
      (err: any) => err.code === 'INVALID_STATUS_FOR_CANCEL' && err.statusCode === 400
    );
  });

  it('strictly enforces tenant isolation: Merchant A cannot view or cancel Merchant B payment', async () => {
    const repo = new MockPaymentRepository();
    const service = new PaymentService(repo, merchantFinder);

    // Create payment owned by mer_123
    const res = await service.createPayment('mer_123', {
      orderId: 'ORD_TENANT_TEST',
      amountPaise: 50000
    });
    const payment = res.payment;

    // Another merchant (mer_456) tries to get the payment
    await assert.rejects(
      async () => {
        await service.getPayment('mer_456', payment.id);
      },
      (err: any) => err.code === 'NOT_FOUND' && err.statusCode === 404
    );

    // Another merchant (mer_456) tries to cancel the payment
    await assert.rejects(
      async () => {
        await service.cancelPayment('mer_456', payment.id);
      },
      (err: any) => err.code === 'NOT_FOUND' && err.statusCode === 404
    );
  });

  it('auto-expires payment when queried after expiresAt', async () => {
    const repo = new MockPaymentRepository();
    const service = new PaymentService(repo, merchantFinder);

    const res = await service.createPayment('mer_123', {
      orderId: 'ORD_EXPIRE_TEST',
      amountPaise: 10000,
      expiresInMinutes: 15
    });
    const payment = res.payment;

    // Simulate time passing beyond expiration
    const key = `mer_123:${payment.id}`;
    const raw = repo.payments.get(key);
    assert.ok(raw);
    raw.expiresAt = new Date(Date.now() - 60000); // 1 minute in the past
    repo.payments.set(key, raw);

    const fetched = await service.getPayment('mer_123', payment.id);
    assert.strictEqual(fetched.payment.status, PaymentStatus.EXPIRED);
  });

  describe('Payment Idempotency & Creation Resilience Suite', () => {
    it('1. First payment request creation succeeds without idempotency key', async () => {
      const repo = new MockPaymentRepository();
      const service = new PaymentService(repo, merchantFinder);

      const res = await service.createPayment('mer_123', {
        orderId: 'ORD_FIRST_1',
        amountPaise: 50000
      });

      assert.ok(res.payment.id);
      assert.strictEqual(res.payment.orderId, 'ORD_FIRST_1');
      assert.strictEqual(res.payment.idempotencyKey, undefined);
    });

    it('2. Second independent request by the same merchant without an idempotency key succeeds without duplicate key error', async () => {
      const repo = new MockPaymentRepository();
      const service = new PaymentService(repo, merchantFinder);

      const first = await service.createPayment('mer_123', {
        orderId: 'ORD_NO_IDEM_1',
        amountPaise: 10000
      });

      const second = await service.createPayment('mer_123', {
        orderId: 'ORD_NO_IDEM_2',
        amountPaise: 20000
      });

      assert.ok(first.payment.id);
      assert.ok(second.payment.id);
      assert.notStrictEqual(first.payment.id, second.payment.id);
      assert.strictEqual(first.payment.idempotencyKey, undefined);
      assert.strictEqual(second.payment.idempotencyKey, undefined);
    });

    it('3. Retrying creation with the exact same idempotency key returns the original request instead of creating a duplicate', async () => {
      const repo = new MockPaymentRepository();
      const service = new PaymentService(repo, merchantFinder);

      const first = await service.createPayment('mer_123', {
        orderId: 'ORD_RETRY_1',
        amountPaise: 75000,
        idempotencyKey: 'idem_retry_key_123'
      });

      const retry = await service.createPayment('mer_123', {
        orderId: 'ORD_RETRY_1',
        amountPaise: 75000,
        idempotencyKey: 'idem_retry_key_123'
      });

      assert.strictEqual(first.payment.id, retry.payment.id);
      assert.strictEqual(first.payment.checkoutReference, retry.payment.checkoutReference);
      assert.strictEqual(first.payment.orderId, retry.payment.orderId);
      assert.strictEqual(repo.payments.size, 1);
    });

    it('4. Different idempotency keys create independent payment requests', async () => {
      const repo = new MockPaymentRepository();
      const service = new PaymentService(repo, merchantFinder);

      const first = await service.createPayment('mer_123', {
        orderId: 'ORD_DIFF_1',
        amountPaise: 30000,
        idempotencyKey: 'idem_key_AAA'
      });

      const second = await service.createPayment('mer_123', {
        orderId: 'ORD_DIFF_2',
        amountPaise: 40000,
        idempotencyKey: 'idem_key_BBB'
      });

      assert.notStrictEqual(first.payment.id, second.payment.id);
      assert.strictEqual(first.payment.idempotencyKey, 'idem_key_AAA');
      assert.strictEqual(second.payment.idempotencyKey, 'idem_key_BBB');
      assert.strictEqual(repo.payments.size, 2);
    });

    it('5. Cancelling a payment request does not block subsequent new requests for the same merchant', async () => {
      const repo = new MockPaymentRepository();
      const service = new PaymentService(repo, merchantFinder);

      // Create first payment (e.g. without idempotency key or with fresh key)
      const first = await service.createPayment('mer_123', {
        orderId: 'ORD_CANCEL_PREV',
        amountPaise: 25000
      });

      // Cancel the first payment
      await service.cancelPayment('mer_123', first.payment.id);
      const cancelledPayment = await service.getPayment('mer_123', first.payment.id);
      assert.strictEqual(cancelledPayment.payment.status, PaymentStatus.CANCELLED);

      // Create a second payment request by the same merchant
      const second = await service.createPayment('mer_123', {
        orderId: 'ORD_AFTER_CANCEL',
        amountPaise: 35000
      });

      assert.ok(second.payment.id);
      assert.strictEqual(second.payment.status, PaymentStatus.PENDING);
      assert.notStrictEqual(first.payment.id, second.payment.id);
    });

    it('6. Two different merchants can use the exact same idempotency key without conflict', async () => {
      const repo = new MockPaymentRepository();
      const service = new PaymentService(repo, (id: string) => {
        if (id === 'mer_123' || id === 'mer_456') {
          return Promise.resolve({
            _id: id,
            name: `Merchant ${id}`,
            upiConfig: {
              vpa: `${id}@okhdfcbank`,
              businessName: `Store ${id}`,
              isAcceptingPayments: true
            }
          });
        }
        return Promise.resolve(null);
      });

      const sharedKey = 'shared_partner_idem_key_456';

      const mer1Payment = await service.createPayment('mer_123', {
        orderId: 'ORD_MER1',
        amountPaise: 10000,
        idempotencyKey: sharedKey
      });

      const mer2Payment = await service.createPayment('mer_456', {
        orderId: 'ORD_MER2',
        amountPaise: 20000,
        idempotencyKey: sharedKey
      });

      assert.strictEqual(mer1Payment.payment.merchantId, 'mer_123');
      assert.strictEqual(mer2Payment.payment.merchantId, 'mer_456');
      assert.notStrictEqual(mer1Payment.payment.id, mer2Payment.payment.id);
      assert.strictEqual(mer1Payment.payment.idempotencyKey, sharedKey);
      assert.strictEqual(mer2Payment.payment.idempotencyKey, sharedKey);
    });

    it('7. Handles concurrent duplicate creation requests with the same idempotency key gracefully', async () => {
      const repo = new MockPaymentRepository();
      const service = new PaymentService(repo, merchantFinder);

      const idemKey = 'idem_concurrent_999';

      // Launch 3 concurrent creation attempts with identical idempotencyKey and orderId
      const [res1, res2, res3] = await Promise.all([
        service.createPayment('mer_123', {
          orderId: 'ORD_CONCURRENT_1',
          amountPaise: 50000,
          idempotencyKey: idemKey
        }),
        service.createPayment('mer_123', {
          orderId: 'ORD_CONCURRENT_1',
          amountPaise: 50000,
          idempotencyKey: idemKey
        }),
        service.createPayment('mer_123', {
          orderId: 'ORD_CONCURRENT_1',
          amountPaise: 50000,
          idempotencyKey: idemKey
        })
      ]);

      // All returned responses must reference the same payment request
      assert.strictEqual(res1.payment.id, res2.payment.id);
      assert.strictEqual(res2.payment.id, res3.payment.id);
      assert.strictEqual(res1.payment.orderId, 'ORD_CONCURRENT_1');
      assert.strictEqual(repo.payments.size, 1);
    });
  });

  describe('Merchant Bank Account Resolution & Validation Suite', () => {
    const validMerchantId = '507f1f77bcf86cd799439011';
    const otherMerchantId = '507f1f77bcf86cd799439099';
    const validBankAccountId = '507f1f77bcf86cd799439022';
    const otherBankAccountId = '507f1f77bcf86cd799439033';
    const disabledBankAccountId = '507f1f77bcf86cd799439044';
    const defaultVpaBankAccountId = '507f1f77bcf86cd799439055';

    const mockBankAccounts: any[] = [
      {
        _id: validBankAccountId,
        merchantId: validMerchantId,
        bankName: 'HDFC Bank',
        upiId: 'merchant.hdfc@okhdfcbank',
        accountSuffix: '9876',
        accountHolderName: 'Merchant HDFC Account',
        isActive: true,
        isDefault: false
      },
      {
        _id: defaultVpaBankAccountId,
        merchantId: validMerchantId,
        bankName: 'Yes Bank Default',
        upiId: '9372663143@yespop',
        accountSuffix: '4321',
        accountHolderName: 'Rajiv Sharma',
        isActive: true,
        isDefault: true
      },
      {
        _id: otherBankAccountId,
        merchantId: otherMerchantId,
        bankName: 'ICICI Bank',
        upiId: 'other@okicici',
        accountSuffix: '1122',
        accountHolderName: 'Other Merchant Account',
        isActive: true,
        isDefault: true
      },
      {
        _id: disabledBankAccountId,
        merchantId: validMerchantId,
        bankName: 'Disabled Union Bank',
        upiId: 'alerts@testbank.example',
        accountSuffix: '0562',
        accountHolderName: 'Disabled Account',
        isActive: false,
        isDefault: false
      }
    ];

    const merchantWithUpi = {
      _id: validMerchantId,
      name: 'Test Merchant',
      upiConfig: {
        vpa: '9372663143@yespop',
        businessName: 'Test Merchant',
        isAcceptingPayments: true
      }
    };

    const setupMocks = () => {
      const origFindOne = MerchantBankAccountModel.findOne;
      (MerchantBankAccountModel as any).findOne = (query: any) => {
        let match = mockBankAccounts.find(acc => {
          if (query._id && acc._id !== query._id.toString()) return false;
          if (query.merchantId && acc.merchantId !== query.merchantId.toString()) return false;
          if (query.isActive !== undefined && acc.isActive !== query.isActive) return false;
          if (query.upiId && acc.upiId !== query.upiId) return false;
          return true;
        });

        return {
          sort: (_sortObj: any) => ({
            lean: () => Promise.resolve(match ? { ...match } : null)
          }),
          lean: () => Promise.resolve(match ? { ...match } : null)
        };
      };

      return () => {
        MerchantBankAccountModel.findOne = origFindOne;
      };
    };

    it('1. Valid enabled bank account belonging to merchant resolves correctly', async () => {
      const restore = setupMocks();
      try {
        const repo = new MockPaymentRepository();
        const service = new PaymentService(repo, async () => merchantWithUpi);

        const result = await service.createPayment(validMerchantId, {
          orderId: 'ORD_BANK_VALID',
          amountPaise: 100,
          bankAccountId: validBankAccountId
        });

        assert.strictEqual(result.payment.bankAccountId, validBankAccountId);
        assert.strictEqual(result.payment.bankName, 'HDFC Bank');
        assert.strictEqual(result.payment.merchantVpa, 'merchant.hdfc@okhdfcbank');
        assert.ok(result.payment.upiUri.includes('pa=merchant.hdfc@okhdfcbank'));
        assert.ok(!result.payment.upiUri.includes('%40'));
        assert.strictEqual(result.payment.amountPaise, 100);
      } finally {
        restore();
      }
    });

    it('2. Account belonging to another merchant is rejected (tenant isolation)', async () => {
      const restore = setupMocks();
      try {
        const repo = new MockPaymentRepository();
        const service = new PaymentService(repo, async () => merchantWithUpi);

        await assert.rejects(
          service.createPayment(validMerchantId, {
            orderId: 'ORD_CROSS_TENANT',
            amountPaise: 500,
            bankAccountId: otherBankAccountId
          }),
          (err: any) => {
            assert.strictEqual(err.code, 'BANK_ACCOUNT_NOT_FOUND');
            assert.strictEqual(err.statusCode, 404);
            assert.ok(err.message.includes('Specified merchant bank account not found or is disabled'));
            return true;
          }
        );
      } finally {
        restore();
      }
    });

    it('3. Nonexistent account ID is rejected', async () => {
      const restore = setupMocks();
      try {
        const repo = new MockPaymentRepository();
        const service = new PaymentService(repo, async () => merchantWithUpi);

        await assert.rejects(
          service.createPayment(validMerchantId, {
            orderId: 'ORD_NONEXISTENT',
            amountPaise: 500,
            bankAccountId: '507f1f77bcf86cd799439088'
          }),
          (err: any) => {
            assert.strictEqual(err.code, 'BANK_ACCOUNT_NOT_FOUND');
            assert.strictEqual(err.statusCode, 404);
            assert.ok(err.message.includes('Specified merchant bank account not found or is disabled'));
            return true;
          }
        );
      } finally {
        restore();
      }
    });

    it('4. Disabled account is rejected with BANK_ACCOUNT_NOT_FOUND', async () => {
      const restore = setupMocks();
      try {
        const repo = new MockPaymentRepository();
        const service = new PaymentService(repo, async () => merchantWithUpi);

        await assert.rejects(
          service.createPayment(validMerchantId, {
            orderId: 'ORD_DISABLED_ACC',
            amountPaise: 500,
            bankAccountId: disabledBankAccountId
          }),
          (err: any) => {
            assert.strictEqual(err.code, 'BANK_ACCOUNT_NOT_FOUND');
            assert.strictEqual(err.statusCode, 404);
            assert.ok(err.message.includes('Specified merchant bank account not found or is disabled'));
            return true;
          }
        );
      } finally {
        restore();
      }
    });

    it('5. Missing account ID succeeds and resolves default VPA', async () => {
      const restore = setupMocks();
      try {
        const repo = new MockPaymentRepository();
        const service = new PaymentService(repo, async () => merchantWithUpi);

        const result = await service.createPayment(validMerchantId, {
          orderId: 'ORD_NO_ACCOUNT_ID',
          amountPaise: 250
        });

        assert.strictEqual(result.payment.amountPaise, 250);
        assert.ok(result.payment.merchantVpa);
        assert.ok(result.payment.upiUri);
      } finally {
        restore();
      }
    });

    it('6. Correct UPI ID passed into QR generation (never test placeholders)', async () => {
      const restore = setupMocks();
      try {
        const repo = new MockPaymentRepository();
        const service = new PaymentService(repo, async () => merchantWithUpi);

        const result = await service.createPayment(validMerchantId, {
          orderId: 'ORD_QR_TEST',
          amountPaise: 100,
          bankAccountId: validBankAccountId
        });

        // Must encode merchant.hdfc@okhdfcbank and never alerts@testbank.example
        assert.strictEqual(result.payment.merchantVpa, 'merchant.hdfc@okhdfcbank');
        assert.ok(result.payment.upiUri.includes('pa=merchant.hdfc@okhdfcbank'));
        assert.ok(!result.payment.upiUri.includes('%40'));
        assert.ok(!result.payment.upiUri.includes('alerts@testbank.example'));
      } finally {
        restore();
      }
    });

    it('7. Default VPA selection correctly resolves to its bank account', async () => {
      const restore = setupMocks();
      try {
        const repo = new MockPaymentRepository();
        const service = new PaymentService(repo, async () => merchantWithUpi);

        // When no bankAccountId is specified (Default VPA selected)
        const result = await service.createPayment(validMerchantId, {
          orderId: 'ORD_DEFAULT_VPA_RESOLVE',
          amountPaise: 100
        });

        // Should resolve to defaultVpaBankAccountId since its upiId matches merchant.upiConfig.vpa
        assert.strictEqual(result.payment.bankAccountId, defaultVpaBankAccountId);
        assert.strictEqual(result.payment.bankName, 'Yes Bank Default');
        assert.strictEqual(result.payment.merchantVpa, '9372663143@yespop');
        assert.ok(result.payment.upiUri.includes('pa=9372663143@yespop'));
        assert.ok(!result.payment.upiUri.includes('%40'));
      } finally {
        restore();
      }
    });

    it('8. REGRESSION: PaymentService uses defensive merchant resolution for string merchant IDs', async () => {
      const restore = setupMocks();
      try {
        const repo = new MockPaymentRepository();
        // PaymentService created without explicit merchantFinder defaults to findMerchantByIdDefensive
        const service = new PaymentService(repo, async (id: string) => {
          if (id === validMerchantId) return merchantWithUpi;
          return null;
        });

        const result = await service.createPayment(validMerchantId, {
          orderId: 'ORD_STRING_ID_RESOLVE',
          amountPaise: 500
        });

        assert.strictEqual(result.payment.merchantName, 'Rajiv Sharma');
        assert.strictEqual(result.payment.amountPaise, 500);
        assert.ok(result.payment.upiUri.includes('am=5.00'));
      } finally {
        restore();
      }
    });

    it('9. REGRESSION: PaymentService throws MERCHANT_NOT_FOUND when merchant does not exist', async () => {
      const repo = new MockPaymentRepository();
      const service = new PaymentService(repo, async () => null);

      await assert.rejects(
        async () => {
          await service.createPayment('non_existent_merchant', {
            orderId: 'ORD_NON_EXISTENT',
            amountPaise: 100
          });
        },
        (err: any) => {
          assert.strictEqual(err.code, 'MERCHANT_NOT_FOUND');
          assert.strictEqual(err.message, 'Merchant account not found');
          return true;
        }
      );
    });
  });
});
