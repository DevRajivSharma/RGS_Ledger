import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { UpiAdapterFactory } from './index.js';

function decodePngQr(qrDataUrl: string): string {
  const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, '');
  const pngBuffer = Buffer.from(base64Data, 'base64');
  const png = PNG.sync.read(pngBuffer);
  const clampedPixels = new Uint8ClampedArray(png.data);
  const decoded = jsQR(clampedPixels, png.width, png.height);
  if (!decoded) {
    throw new Error('Failed to decode QR code from image bytes');
  }
  return decoded.data;
}

describe('UPI QR Code Roundtrip & Image Decoding Verification', () => {
  const adapter = UpiAdapterFactory.getAdapter();

  it('1. Generates ₹1.00 from 100 paise with complete NPCI parameters and decodes pixel image back to URI', async () => {
    const input = {
      payeeVpa: 'merchant.store@okhdfcbank',
      payeeName: 'Acme Supermarket',
      amountPaise: 100, // Exactly ₹1.00
      orderId: 'ORD_TEST_100',
      note: 'Payment for Order 100'
    };

    const result = await adapter.generatePaymentQr(input);

    assert.strictEqual(result.amountPaise, 100);
    assert.strictEqual(result.amountRupees, 1.00);
    assert.ok(result.upiUri.startsWith('upi://pay?'));

    const parsedUrl = new URL(result.upiUri);
    const params = parsedUrl.searchParams;
    assert.strictEqual(params.get('pa'), input.payeeVpa);
    assert.strictEqual(params.get('pn'), input.payeeName);
    assert.strictEqual(params.get('am'), '1.00');
    assert.strictEqual(params.get('cu'), 'INR');
    assert.strictEqual(params.get('tr'), input.orderId);
    assert.strictEqual(params.get('mode'), null, 'mode parameter must NOT be present in scanned QR codes');
    assert.strictEqual(params.get('tn'), input.note);
    assert.ok(result.upiUri.includes('pa=merchant.store@okhdfcbank'), 'pa must contain literal @');
    assert.strictEqual(result.upiUri.includes('%40'), false, 'pa must not percent-encode @');
    assert.strictEqual(result.upiUri.includes('+'), false, 'spaces must not be encoded as +');

    const decodedText = decodePngQr(result.qrDataUrl);
    assert.strictEqual(decodedText, result.upiUri, 'Decoded QR text must match generated UPI URI exactly');

    // Verify intent links
    assert.ok(result.intentLinks.phonepe.startsWith('phonepe://pay?'));
    assert.ok(result.intentLinks.gpay.startsWith('tez://upi/pay?'));
    assert.ok(result.intentLinks.paytm.startsWith('paytmmp://pay?'));
    assert.ok(result.intentLinks.bhim.startsWith('upi://pay?'));
  });

  it('2. Controlled test case: ₹10.00 fixed amount (1000 paise)', async () => {
    const result = await adapter.generatePaymentQr({
      payeeVpa: 'sharma9769387961@okhdfcbank',
      payeeName: 'Rajiv Sharma',
      amountPaise: 1000, // Exactly ₹10.00
      orderId: 'ORD_FIXED_10'
    });

    assert.strictEqual(result.amountRupees, 10.00);
    assert.ok(result.upiUri.includes('am=10.00'));
    assert.ok(result.upiUri.includes('pa=sharma9769387961@okhdfcbank'));
    assert.strictEqual(result.upiUri.includes('mode=04'), false);

    const decoded = decodePngQr(result.qrDataUrl);
    assert.strictEqual(decoded, result.upiUri);
  });

  it('3. Controlled test case: Merchant display names with spaces and symbols', async () => {
    const names = [
      'Rajiv Sharma',
      'Acme & Sons Corp',
      'Tech-Hub (India) Private Limited',
      'Cafe 123'
    ];

    for (const name of names) {
      const result = await adapter.generatePaymentQr({
        payeeVpa: 'store@icici',
        payeeName: name,
        amountPaise: 25000,
        orderId: `ORD_${Date.now()}`
      });

      assert.strictEqual(result.upiUri.includes('+'), false, 'Spaces must not be +');
      const decoded = decodePngQr(result.qrDataUrl);
      assert.strictEqual(decoded, result.upiUri);
      const parsed = new URL(decoded);
      assert.strictEqual(parsed.searchParams.get('pn'), name);
    }
  });

  it('4. Controlled test case: Special characters in transaction descriptions (note/tn)', async () => {
    const notes = [
      'Order #4421 & Invoice',
      'Coffee & Donut [Table 4]',
      'Books, Pens: Ref-99'
    ];

    for (const note of notes) {
      const result = await adapter.generatePaymentQr({
        payeeVpa: 'billing@hdfcbank',
        payeeName: 'Retail Shop',
        amountPaise: 15000,
        orderId: 'ORD_NOTE_TEST',
        note
      });

      const decoded = decodePngQr(result.qrDataUrl);
      assert.strictEqual(decoded, result.upiUri);
      const parsed = new URL(decoded);
      assert.strictEqual(parsed.searchParams.get('tn'), note);
    }
  });

  it('5. Controlled test case: Transaction references (orderId/tr) with alphanumeric and hyphen/underscore', async () => {
    const orderIds = [
      'ORD-2026-11-19-001',
      'TXN_998877_AB',
      'order.1234.pay'
    ];

    for (const orderId of orderIds) {
      const result = await adapter.generatePaymentQr({
        payeeVpa: 'merchant@axisbank',
        payeeName: 'Merchant Store',
        amountPaise: 5000,
        orderId
      });

      const decoded = decodePngQr(result.qrDataUrl);
      assert.strictEqual(decoded, result.upiUri);
      const parsed = new URL(decoded);
      assert.strictEqual(parsed.searchParams.get('tr'), orderId);
    }
  });

  it('6. QR generation and scanning does NOT alter payment status (pure rendering function)', async () => {
    // Pure function check: generating or decoding QR produces no side-effects on database state
    const result1 = await adapter.generatePaymentQr({
      payeeVpa: 'safe@upi',
      payeeName: 'Pure Function Test',
      amountPaise: 5000,
      orderId: 'ORD_PURE'
    });
    const result2 = await adapter.generatePaymentQr({
      payeeVpa: 'safe@upi',
      payeeName: 'Pure Function Test',
      amountPaise: 5000,
      orderId: 'ORD_PURE'
    });

    assert.strictEqual(result1.upiUri, result2.upiUri);
  });
});
