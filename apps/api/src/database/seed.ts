import bcrypt from 'bcrypt';
import { connectDatabase, disconnectDatabase } from './connection';
import {
  User,
  Merchant,
  ApiKey,
  Order,
  Payment,
  Refund,
  Customer,
  PaymentLink,
  Settlement,
  ProviderConfig
} from './models';
import {
  UserRole,
  KycStatus,
  BusinessType,
  EnvironmentMode,
  OrderStatus,
  PaymentStatus,
  PaymentMethodType,
  RefundStatus,
  SettlementStatus,
  generateApiKey,
  generateRandomId
} from '@rgs-ledger/shared';
import { DoubleEntryLedger } from '@rgs-ledger/payment-core';
import { LedgerService } from '../services/ledger.service';

export async function seedDatabase() {
  console.log('[Seed] Starting RGS Ledger database seeding...');
  await connectDatabase();

  // 1. Create Super Admin User
  const adminEmail = 'admin@rgsledger.com';
  let adminUser = await User.findOne({ email: adminEmail }).exec();
  if (!adminUser) {
    const adminHash = await bcrypt.hash('Admin@RGS1234!', 12);
    adminUser = await User.create({
      email: adminEmail,
      passwordHash: adminHash,
      fullName: 'Platform Super Administrator',
      phone: '+919876543210',
      role: UserRole.SUPER_ADMIN,
      isEmailVerified: true,
      isActive: true
    });
    console.log(`[Seed] Super Admin user created: ${adminEmail}`);
  }

  // 2. Create Demo Merchant
  const merchantId = 'mer_acmestore_demo';
  let merchant = await Merchant.findById(merchantId).exec();
  if (!merchant) {
    merchant = await Merchant.create({
      _id: merchantId,
      businessName: 'Acme Retail Technologies Pvt Ltd',
      businessType: BusinessType.PRIVATE_LIMITED,
      country: 'IN',
      website: 'https://acmeretail.example.in',
      kycStatus: KycStatus.APPROVED,
      environmentMode: EnvironmentMode.SANDBOX,
      isActive: true,
      panNumber: 'AAACA1234F',
      gstin: '27AAACA1234F1Z5',
      bankAccount: {
        accountNumber: '918237461928',
        ifscCode: 'HDFC0001234',
        accountHolderName: 'Acme Retail Technologies Pvt Ltd',
        bankName: 'HDFC Bank'
      },
      address: {
        line1: 'Tower 4, FinTech Cyber Hub',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560100',
        country: 'IN'
      }
    });
    console.log(`[Seed] Demo Merchant created: ${merchant.businessName} (${merchantId})`);
  }

  // 3. Create Merchant Owner User
  const merchantEmail = 'merchant@acmestore.in';
  let merchantUser = await User.findOne({ email: merchantEmail }).exec();
  if (!merchantUser) {
    const ownerHash = await bcrypt.hash('Merchant@RGS1234!', 12);
    merchantUser = await User.create({
      email: merchantEmail,
      passwordHash: ownerHash,
      fullName: 'Vikram Aditya',
      phone: '+919988776655',
      role: UserRole.MERCHANT_OWNER,
      merchantId: merchant._id,
      isEmailVerified: true,
      isActive: true
    });
    console.log(`[Seed] Merchant Owner created: ${merchantEmail}`);
  }

  // 4. Create Standard Sandbox API Key
  const existingKey = await ApiKey.findOne({ merchantId }).exec();
  if (!existingKey) {
    const generated = generateApiKey('SANDBOX');
    await ApiKey.create({
      _id: generateRandomId('key'),
      merchantId,
      name: 'Default Sandbox Test Key',
      keyId: generated.keyId,
      hashedSecret: generated.hashedSecret,
      prefix: generated.prefix,
      environment: EnvironmentMode.SANDBOX,
      isActive: true
    });
    console.log(`[Seed] Test API Key generated: ${generated.keyId}`);
    console.log(`[Seed] Test Secret Key: ${generated.secretKey}`);
  }

  // 5. Seed Provider Configs
  const pCount = await ProviderConfig.countDocuments();
  if (pCount === 0) {
    await ProviderConfig.create([
      {
        providerId: 'sandbox_provider',
        name: 'RGS Sandbox Payment Engine',
        isEnabled: true,
        isSandbox: true,
        priority: 1
      },
      {
        providerId: 'razorpay_partner_adapter',
        name: 'Razorpay Partner Gateway Adapter',
        isEnabled: false,
        isSandbox: false,
        priority: 2,
        config: { note: 'Requires authorized acquiring partnership and RBI PA license approval' }
      },
      {
        providerId: 'cashfree_partner_adapter',
        name: 'Cashfree Partner Gateway Adapter',
        isEnabled: false,
        isSandbox: false,
        priority: 3,
        config: { note: 'Requires authorized acquiring partnership and RBI PA license approval' }
      }
    ]);
    console.log('[Seed] Provider configurations seeded.');
  }

  // 6. Seed Customers & Sample Transactions
  const existingOrders = await Order.countDocuments({ merchantId });
  if (existingOrders === 0) {
    const sampleCustomer = await Customer.create({
      _id: generateRandomId('cust'),
      merchantId,
      name: 'Rahul Sharma',
      email: 'rahul.sharma@example.com',
      phone: '+919876543211',
      totalPaymentsPaise: 499900,
      paymentsCount: 2
    });

    // Sample Order 1: Captured UPI Payment
    const ord1 = await Order.create({
      _id: generateRandomId('ord'),
      merchantId,
      amount: 299900, // ₹2,999.00
      currency: 'INR',
      status: OrderStatus.CAPTURED,
      receipt: 'INV-2026-001',
      customer: { id: String(sampleCustomer._id), name: sampleCustomer.name, email: sampleCustomer.email, phone: sampleCustomer.phone },
      amountPaid: 299900,
      amountRefunded: 0,
      environment: EnvironmentMode.SANDBOX
    });

    const pay1 = await Payment.create({
      _id: generateRandomId('pay'),
      orderId: ord1._id,
      merchantId,
      amount: 299900,
      currency: 'INR',
      status: PaymentStatus.SUCCESS,
      method: PaymentMethodType.UPI_INTENT,
      upiId: 'rahul@okhdfcbank',
      providerPaymentId: `sbx_pay_seeded_${Date.now()}_1`,
      environment: EnvironmentMode.SANDBOX,
      capturedAt: new Date(Date.now() - 3600000)
    });

    // Balanced double-entry journal for pay1
    const j1 = DoubleEntryLedger.createPaymentCaptureJournal({
      merchantId,
      paymentId: String(pay1._id),
      grossAmountMinor: pay1.amount
    });
    await LedgerService.recordJournal(j1);

    // Sample Order 2: Captured Card Payment
    const ord2 = await Order.create({
      _id: generateRandomId('ord'),
      merchantId,
      amount: 200000, // ₹2,000.00
      currency: 'INR',
      status: OrderStatus.CAPTURED,
      receipt: 'INV-2026-002',
      customer: { id: String(sampleCustomer._id), name: sampleCustomer.name, email: sampleCustomer.email, phone: sampleCustomer.phone },
      amountPaid: 200000,
      amountRefunded: 50000,
      environment: EnvironmentMode.SANDBOX
    });

    const pay2 = await Payment.create({
      _id: generateRandomId('pay'),
      orderId: String(ord2._id),
      merchantId,
      amount: 200000,
      currency: 'INR',
      status: PaymentStatus.SUCCESS,
      method: PaymentMethodType.CARD,
      cardNetwork: 'VISA',
      cardLast4: '4242',
      providerPaymentId: `sbx_pay_seeded_${Date.now()}_2`,
      environment: EnvironmentMode.SANDBOX,
      capturedAt: new Date(Date.now() - 7200000)
    });

    const j2 = DoubleEntryLedger.createPaymentCaptureJournal({
      merchantId,
      paymentId: String(pay2._id),
      grossAmountMinor: pay2.amount
    });
    await LedgerService.recordJournal(j2);

    // Partial refund on pay2
    const ref1 = await Refund.create({
      _id: generateRandomId('ref'),
      paymentId: String(pay2._id),
      orderId: String(ord2._id),
      merchantId,
      amount: 50000, // ₹500.00
      currency: 'INR',
      status: RefundStatus.PROCESSED,
      reason: 'Customer requested partial refund on apparel sizing',
      providerRefundId: `sbx_ref_seeded_${Date.now()}`,
      environment: EnvironmentMode.SANDBOX
    });

    const refJ = DoubleEntryLedger.createRefundJournal({
      merchantId,
      refundId: ref1._id,
      refundAmountMinor: ref1.amount
    });
    await LedgerService.recordJournal(refJ);

    // Sample Payment Link
    await PaymentLink.create({
      _id: generateRandomId('plink'),
      merchantId,
      orderId: ord1._id,
      title: 'Annual SaaS Subscription Invoice',
      description: 'Acme Cloud Platform Pro Plan Subscription',
      amount: 299900,
      currency: 'INR',
      status: 'PAID'
    });

    console.log('[Seed] Sample orders, payments, refunds, and double-entry journals created.');
  }

  console.log('[Seed] Database seeding completed successfully.');
}

if (require.main === module) {
  seedDatabase()
    .then(() => disconnectDatabase())
    .catch((err) => {
      console.error('[Seed] Error during seeding:', err);
      process.exit(1);
    });
}
