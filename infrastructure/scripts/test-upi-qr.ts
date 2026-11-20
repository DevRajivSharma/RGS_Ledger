import { NpciUpiAdapter } from '../../packages/upi-adapter/src/index.js';

async function test() {
  const adapter = new NpciUpiAdapter();
  const result = await adapter.generatePaymentQr({
    payeeVpa: 'sharma9769387961@okhdfcbank',
    payeeName: 'Rajiv Sharma',
    amountPaise: 100,
    orderId: 'ORD_TEST_100',
    note: 'Payment for Order ORD_TEST_100'
  });

  console.log('Current Generated UPI URI:');
  console.log(result.upiUri);
  console.log('\nIntent Links:');
  console.log(JSON.stringify(result.intentLinks, null, 2));
}

test().catch(console.error);
