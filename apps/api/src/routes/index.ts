import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { MerchantController } from '../controllers/merchant.controller';
import { OrderController } from '../controllers/order.controller';
import { CheckoutController } from '../controllers/checkout.controller';
import { PaymentController } from '../controllers/payment.controller';
import { RefundController } from '../controllers/refund.controller';
import { CustomerController } from '../controllers/customer.controller';
import { PaymentLinkController } from '../controllers/payment-link.controller';
import { ApiKeyController } from '../controllers/api-key.controller';
import { WebhookController } from '../controllers/webhook.controller';
import { SettlementController } from '../controllers/settlement.controller';
import { ReportController } from '../controllers/report.controller';
import { AdminController } from '../controllers/admin.controller';
import { CallbackController } from '../controllers/callback.controller';
import { MerchantProviderController } from '../controllers/merchant-provider.controller';

import { authenticate, authenticateApiKey, requireRole } from '../middleware/auth';
import { enforceTenantIsolation } from '../middleware/tenant';
import { handleIdempotency } from '../middleware/idempotency';
import { validateBody } from '../middleware/validate';
import {
  RegisterMerchantSchema,
  LoginSchema,
  RefreshTokenSchema,
  CreateOrderSchema,
  CreateCheckoutSessionSchema,
  InitiatePaymentSchema,
  CreateRefundSchema,
  CreatePaymentLinkSchema,
  CreateApiKeySchema,
  CreateWebhookEndpointSchema,
  UpdateKycSchema,
  UserRole
} from '@rgs-ledger/shared';

const router = Router();

// ==========================================
// 1. AUTHENTICATION ROUTES
// ==========================================
const authRouter = Router();
authRouter.post('/register', validateBody(RegisterMerchantSchema), AuthController.register);
authRouter.post('/login', validateBody(LoginSchema), AuthController.login);
authRouter.post('/logout', AuthController.logout);
authRouter.post('/refresh', validateBody(RefreshTokenSchema), AuthController.refresh);
authRouter.get('/me', authenticate, AuthController.getMe);
router.use('/auth', authRouter);

// ==========================================
// 2. MERCHANT MANAGEMENT ROUTES
// ==========================================
const merchantRouter = Router();
merchantRouter.use(authenticate, enforceTenantIsolation);
merchantRouter.get('/me', MerchantController.getMe);
merchantRouter.patch('/me', MerchantController.updateMe);
merchantRouter.post('/kyc', validateBody(UpdateKycSchema), MerchantController.updateKyc);
merchantRouter.get('/onboarding', MerchantController.getOnboardingStatus);
router.use('/merchants', merchantRouter);

// ==========================================
// 3. ORDER ROUTES (Supports JWT and API Key)
// ==========================================
const orderRouter = Router();
orderRouter.use(authenticateApiKey, enforceTenantIsolation);
orderRouter.post('/', handleIdempotency, validateBody(CreateOrderSchema), OrderController.createOrder);
orderRouter.get('/:id', OrderController.getOrder);
orderRouter.get('/', OrderController.listOrders);
router.use('/orders', orderRouter);

// ==========================================
// 4. CHECKOUT SESSION ROUTES
// ==========================================
const checkoutRouter = Router();
// Session creation requires merchant auth
checkoutRouter.post('/sessions', authenticateApiKey, enforceTenantIsolation, validateBody(CreateCheckoutSessionSchema), CheckoutController.createSession);
// Public hosted checkout endpoints (No merchant auth required for customer payment page)
checkoutRouter.get('/sessions/:sessionId', CheckoutController.getSession);
checkoutRouter.post('/sessions/:sessionId/initiate', handleIdempotency, validateBody(InitiatePaymentSchema), CheckoutController.initiatePayment);
checkoutRouter.post('/sessions/:sessionId/pay', handleIdempotency, validateBody(InitiatePaymentSchema), CheckoutController.processPayment);
checkoutRouter.post('/sessions/:sessionId/simulate', CheckoutController.simulatePayment);
router.use('/checkout', checkoutRouter);

// Public sandbox provider callback route (simulates bank PSP webhook callbacks)
router.post('/payments/:id/simulate-callback', PaymentController.simulateCallback);

// ==========================================
// PROVIDER CALLBACK ROUTES (Direct Bank/PSP Inbound Webhooks)
// ==========================================
const callbackRouter = Router();
callbackRouter.post('/phonepe', CallbackController.handlePhonePeCallback);
callbackRouter.post('/paytm', CallbackController.handlePaytmCallback);
router.use('/callbacks', callbackRouter);

// ==========================================
// 5. PAYMENT ROUTES
// ==========================================
const paymentRouter = Router();
paymentRouter.use(authenticateApiKey, enforceTenantIsolation);
paymentRouter.post('/initiate', handleIdempotency, validateBody(InitiatePaymentSchema), PaymentController.initiatePayment);
paymentRouter.get('/:id', PaymentController.getPayment);
paymentRouter.get('/', PaymentController.listPayments);
paymentRouter.post('/:id/refund', handleIdempotency, PaymentController.createRefund);
paymentRouter.post('/:id/confirm-manual', requireRole(UserRole.MERCHANT_OWNER, UserRole.MERCHANT_ADMIN, UserRole.FINANCE, UserRole.SUPER_ADMIN, UserRole.ADMIN), MerchantProviderController.confirmManualPayment);
paymentRouter.post('/:id/reconcile', requireRole(UserRole.MERCHANT_OWNER, UserRole.MERCHANT_ADMIN, UserRole.FINANCE, UserRole.SUPER_ADMIN, UserRole.ADMIN), MerchantProviderController.reconcilePayment);
paymentRouter.post('/:id/simulate-callback', PaymentController.simulateCallback);
router.use('/payments', paymentRouter);

// ==========================================
// 6. REFUND ROUTES
// ==========================================
const refundRouter = Router();
refundRouter.use(authenticateApiKey, enforceTenantIsolation);
refundRouter.post('/', handleIdempotency, validateBody(CreateRefundSchema), RefundController.createRefund);
refundRouter.get('/:id', RefundController.getRefund);
refundRouter.get('/', RefundController.listRefunds);
router.use('/refunds', refundRouter);

// ==========================================
// 7. CUSTOMER ROUTES
// ==========================================
const customerRouter = Router();
customerRouter.use(authenticateApiKey, enforceTenantIsolation);
customerRouter.post('/', CustomerController.createCustomer);
customerRouter.get('/:id', CustomerController.getCustomer);
customerRouter.get('/', CustomerController.listCustomers);
router.use('/customers', customerRouter);

// ==========================================
// 8. PAYMENT LINK ROUTES
// ==========================================
const paymentLinkRouter = Router();
paymentLinkRouter.use(authenticateApiKey, enforceTenantIsolation);
paymentLinkRouter.post('/', handleIdempotency, validateBody(CreatePaymentLinkSchema), PaymentLinkController.createLink);
paymentLinkRouter.get('/:id', PaymentLinkController.getLink);
paymentLinkRouter.post('/:id/deactivate', PaymentLinkController.deactivateLink);
paymentLinkRouter.get('/', PaymentLinkController.listLinks);
router.use('/payment-links', paymentLinkRouter);

// ==========================================
// 9. API KEY ROUTES
// ==========================================
const apiKeyRouter = Router();
apiKeyRouter.use(authenticate, enforceTenantIsolation);
apiKeyRouter.post('/', validateBody(CreateApiKeySchema), ApiKeyController.createKey);
apiKeyRouter.get('/', ApiKeyController.listKeys);
apiKeyRouter.post('/:id/rotate', ApiKeyController.rotateKey);
apiKeyRouter.delete('/:id', ApiKeyController.revokeKey);
router.use('/api-keys', apiKeyRouter);

// ==========================================
// 10. WEBHOOK MANAGEMENT ROUTES
// ==========================================
const webhookRouter = Router();
webhookRouter.use(authenticate, enforceTenantIsolation);
webhookRouter.post('/', validateBody(CreateWebhookEndpointSchema), WebhookController.createEndpoint);
webhookRouter.get('/', WebhookController.listEndpoints);
webhookRouter.delete('/:id', WebhookController.deleteEndpoint);
webhookRouter.get('/deliveries', WebhookController.listDeliveries);
webhookRouter.post('/deliveries/:deliveryId/retry', WebhookController.retryDelivery);
router.use('/webhooks', webhookRouter);

// ==========================================
// 11. SETTLEMENT & LEDGER ROUTES
// ==========================================
const settlementRouter = Router();
settlementRouter.use(authenticate, enforceTenantIsolation);
settlementRouter.post('/', SettlementController.createSettlement);
settlementRouter.get('/', SettlementController.listSettlements);
settlementRouter.get('/balance', SettlementController.getBalance);
settlementRouter.get('/journal', SettlementController.getLedgerJournal);
router.use('/settlements', settlementRouter);

// ==========================================
// 12. REPORT & ANALYTICS ROUTES
// ==========================================
const reportRouter = Router();
reportRouter.use(authenticate, enforceTenantIsolation);
reportRouter.get('/overview', ReportController.getOverview);
router.use('/reports', reportRouter);

// ==========================================
// 13. SUPER ADMIN ROUTES (Strict Role Protection)
// ==========================================
const adminRouter = Router();
adminRouter.use(authenticate, requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN));
adminRouter.get('/stats', AdminController.getPlatformStats);
adminRouter.get('/merchants', AdminController.listMerchants);
adminRouter.patch('/merchants/:merchantId/kyc', AdminController.updateMerchantKyc);
adminRouter.get('/audit-logs', AdminController.listAuditLogs);
adminRouter.get('/providers', AdminController.listProviderConfigs);
adminRouter.patch('/providers/:providerId', AdminController.toggleProvider);
adminRouter.get('/provider-accounts', AdminController.listMerchantProviderAccounts);
router.use('/admin', adminRouter);

// ==========================================
// 14. MERCHANT PROVIDER ACCOUNT CONFIGURATION
// ==========================================
const providerAccountRouter = Router();
providerAccountRouter.use(authenticate, enforceTenantIsolation);
providerAccountRouter.get('/', MerchantProviderController.getProviders);
providerAccountRouter.post('/', requireRole(UserRole.MERCHANT_OWNER, UserRole.MERCHANT_ADMIN, UserRole.SUPER_ADMIN, UserRole.ADMIN), MerchantProviderController.saveProvider);
providerAccountRouter.delete('/:providerType', requireRole(UserRole.MERCHANT_OWNER, UserRole.MERCHANT_ADMIN, UserRole.SUPER_ADMIN, UserRole.ADMIN), MerchantProviderController.deleteProvider);
router.use('/merchant/providers', providerAccountRouter);

export default router;
