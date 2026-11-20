import { describe, it } from 'node:test';
import assert from 'node:assert';
import { UpiAdapterFactory } from './index.js';

describe('NpciUpiAdapter', () => {
  const adapter = UpiAdapterFactory.getAdapter();

  it('validates VPA formats correctly', () => {
    assert.strictEqual(adapter.validateVpa('merchant@icici'), true);
    assert.strictEqual(adapter.validateVpa('store.owner@okhdfcbank'), true);
    assert.strictEqual(adapter.validateVpa('9876543210@paytm'), true);
    assert.strictEqual(adapter.validateVpa('invalid-vpa-without-at'), false);
    assert.strictEqual(adapter.validateVpa('@bank'), false);
    assert.strictEqual(adapter.validateVpa(''), false);
  });

  it('generates QR code and intent links with correct fixed amount from paise', async () => {
    const result = await adapter.generatePaymentQr({
      payeeVpa: 'store@upi',
      payeeName: 'Test Store',
      amountPaise: 49950, // ₹499.50
      orderId: 'ORDER_1001',
      note: 'Payment for Order 1001'
    });

    assert.strictEqual(result.orderId, 'ORDER_1001');
    assert.strictEqual(result.amountPaise, 49950);
    assert.strictEqual(result.amountRupees, 499.5);
    
    // Check URI parameters: literal '@', '%20' for spaces, no 'mode=04'
    assert.ok(result.upiUri.startsWith('upi://pay?'));
    assert.ok(result.upiUri.includes('pa=store@upi'));
    assert.strictEqual(result.upiUri.includes('%40'), false);
    assert.ok(result.upiUri.includes('am=499.50'));
    assert.ok(result.upiUri.includes('pn=Test%20Store'));
    assert.strictEqual(result.upiUri.includes('mode=04'), false);
    assert.strictEqual(result.upiUri.includes('mode='), false);

    // Check QR code image is base64 PNG data URL
    assert.ok(result.qrDataUrl.startsWith('data:image/png;base64,'));

    // Check intent links
    assert.ok(result.intentLinks.phonepe.startsWith('phonepe://'));
    assert.ok(result.intentLinks.gpay.startsWith('tez://'));
    assert.ok(result.intentLinks.paytm.startsWith('paytmmp://'));
    assert.ok(result.intentLinks.bhim.startsWith('upi://'));
  });

  it('throws error for invalid VPA on QR generation', async () => {
    await assert.rejects(
      async () => {
        await adapter.generatePaymentQr({
          payeeVpa: 'invalid-vpa',
          payeeName: 'Test',
          amountPaise: 10000,
          orderId: 'ORDER_1002'
        });
      },
      /Invalid UPI Payee VPA/
    );
  });

  it('rejects non-integer, zero, or negative amounts in paise', async () => {
    await assert.rejects(
      async () => {
        await adapter.generatePaymentQr({
          payeeVpa: 'merchant@upi',
          payeeName: 'Test',
          amountPaise: -500,
          orderId: 'ORDER_1003'
        });
      },
      /Invalid UPI transaction amount in paise/
    );

    await assert.rejects(
      async () => {
        await adapter.generatePaymentQr({
          payeeVpa: 'merchant@upi',
          payeeName: 'Test',
          amountPaise: 0,
          orderId: 'ORDER_1004'
        });
      },
      /Invalid UPI transaction amount in paise/
    );

    await assert.rejects(
      async () => {
        await adapter.generatePaymentQr({
          payeeVpa: 'merchant@upi',
          payeeName: 'Test',
          amountPaise: 49.99,
          orderId: 'ORDER_1005'
        });
      },
      /Invalid UPI transaction amount in paise/
    );
  });
});
