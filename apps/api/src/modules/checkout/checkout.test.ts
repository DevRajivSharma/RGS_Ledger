import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildIntentLinks } from 'upipay';
import { PaymentStatus } from '@rgs-ledger/shared-types';
import { PublicCheckoutDetails } from '@rgs-ledger/api-contracts';

describe('Public Hosted Checkout Data Contract', () => {
  it('constructs public checkout payload without leaking internal merchant credentials', () => {
    const internalPaymentRecord = {
      _id: 'db_mongo_id_9999',
      merchantId: 'db_merchant_id_1111',
      merchantEmail: 'private-merchant@example.com',
      orderId: 'ORD_EXT_888',
      amountPaise: 125000, // ₹1250.00
      merchantName: 'Store Public Name',
      merchantVpa: 'store@upi',
      upiUri: 'upi://pay?pa=store@upi&pn=Store%20Public%20Name&am=1250.00&cu=INR',
      qrDataUrl: 'data:image/png;base64,sampleFakeQrData',
      checkoutReference: 'chk_test_reference_xyz123',
      status: PaymentStatus.PENDING,
      description: 'Annual Subscription',
      expiresAt: new Date(Date.now() + 900000)
    };

    const intentLinks = buildIntentLinks(internalPaymentRecord.upiUri);

    const publicCheckout: PublicCheckoutDetails = {
      checkoutReference: internalPaymentRecord.checkoutReference,
      merchantName: internalPaymentRecord.merchantName,
      orderId: internalPaymentRecord.orderId,
      amountPaise: internalPaymentRecord.amountPaise,
      amountRupees: internalPaymentRecord.amountPaise / 100,
      qrDataUrl: internalPaymentRecord.qrDataUrl,
      upiUri: internalPaymentRecord.upiUri,
      intentLinks: {
        generic: intentLinks.generic,
        phonepe: intentLinks.phonepe,
        gpay: intentLinks.gpay,
        paytm: intentLinks.paytm,
        bhim: intentLinks.bhim
      },
      status: internalPaymentRecord.status,
      description: internalPaymentRecord.description,
      expiresAt: internalPaymentRecord.expiresAt.toISOString(),
      isExpired: false,
      disclosure: 'Non-custodial UPI: money transfers directly to the merchant bank account. RGS Ledger does not hold funds.'
    };

    // Public structure checks
    assert.strictEqual(publicCheckout.orderId, 'ORD_EXT_888');
    assert.strictEqual(publicCheckout.amountRupees, 1250.0);
    assert.strictEqual(publicCheckout.amountPaise, 125000);
    assert.strictEqual(publicCheckout.status, PaymentStatus.PENDING);
    assert.strictEqual(publicCheckout.isExpired, false);

    // Deep link checks
    assert.ok(publicCheckout.intentLinks.phonepe.startsWith('phonepe://'));
    assert.ok(publicCheckout.intentLinks.gpay.startsWith('tez://'));
    assert.ok(publicCheckout.intentLinks.paytm.startsWith('paytmmp://'));
    assert.ok(publicCheckout.intentLinks.bhim.startsWith('upi://'));

    // Zero-leakage assertion: Internal database IDs and merchant email must NOT be present
    assert.strictEqual((publicCheckout as any).merchantId, undefined);
    assert.strictEqual((publicCheckout as any)._id, undefined);
    assert.strictEqual((publicCheckout as any).merchantEmail, undefined);
  });
});
