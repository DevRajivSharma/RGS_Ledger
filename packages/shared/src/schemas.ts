import { z } from 'zod';
import { BusinessType, PaymentMethodType, EnvironmentMode } from './enums';

// Auth Schemas
export const RegisterMerchantSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain uppercase character')
    .regex(/[a-z]/, 'Must contain lowercase character')
    .regex(/[0-9]/, 'Must contain digit')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
  fullName: z.string().min(2),
  phone: z.string().min(10).max(15),
  businessName: z.string().min(2),
  businessType: z.nativeEnum(BusinessType).default(BusinessType.PROPRIETORSHIP),
  website: z.string().url().optional().or(z.literal('')),
  country: z.string().default('IN')
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1)
});

// Merchant Onboarding & KYC Schema
export const UpdateKycSchema = z.object({
  businessName: z.string().min(2),
  businessType: z.nativeEnum(BusinessType),
  panNumber: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid Indian PAN format'),
  gstin: z.string().optional().or(z.literal('')),
  bankAccount: z.object({
    accountNumber: z.string().min(8),
    ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code format'),
    accountHolderName: z.string().min(2),
    bankName: z.string().min(2)
  }),
  address: z.object({
    line1: z.string().min(3),
    line2: z.string().optional(),
    city: z.string().min(2),
    state: z.string().min(2),
    pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Invalid Indian PIN code'),
    country: z.string().default('IN')
  })
});

// Order Schemas
export const CreateOrderSchema = z.object({
  amount: z.number().int().positive('Amount must be positive integer paise'),
  currency: z.string().length(3).default('INR'),
  receipt: z.string().max(64).optional(),
  notes: z.record(z.string()).optional(),
  customer: z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    phone: z.string().min(10).optional()
  }).optional()
});

// Checkout Session Schema
export const CreateCheckoutSessionSchema = z.object({
  orderId: z.string().min(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  expiresInMinutes: z.number().int().min(5).max(60).default(30)
});

// Payment Initiation Schema
export const InitiatePaymentSchema = z.object({
  orderId: z.string().min(1).optional(),
  paymentId: z.string().min(1).optional(),
  action: z.enum(['SUCCESS', 'FAILED', 'PENDING']).optional(),
  status: z.enum(['SUCCESS', 'FAILED', 'PENDING']).optional(),
  method: z.nativeEnum(PaymentMethodType).optional().default(PaymentMethodType.UPI_QR),
  upiId: z.string().optional(),
  cardDetails: z.object({
    cardNumber: z.string().min(12).max(19),
    expMonth: z.number().int().min(1).max(12),
    expYear: z.number().int().min(2024),
    cvv: z.string().min(3).max(4),
    holderName: z.string().min(2)
  }).optional(),
  bankCode: z.string().optional()
});

// Refund Schema
export const CreateRefundSchema = z.object({
  paymentId: z.string().min(1),
  amount: z.number().int().positive('Refund amount must be positive integer paise'),
  reason: z.string().min(3).max(256),
  notes: z.record(z.string()).optional()
});

// Payment Link Schema
export const CreatePaymentLinkSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().default('INR'),
  title: z.string().min(2).max(128),
  description: z.string().max(500).optional(),
  customer: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional()
  }).optional(),
  expireBy: z.string().datetime().optional()
});

// API Key Creation Schema
export const CreateApiKeySchema = z.object({
  environment: z.nativeEnum(EnvironmentMode).default(EnvironmentMode.SANDBOX),
  name: z.string().min(2).max(64).default('Default API Key')
});

// Webhook Endpoint Schema
export const CreateWebhookEndpointSchema = z.object({
  url: z.string().url('Invalid webhook URL format'),
  events: z.array(z.string()).min(1, 'Subscribe to at least one event'),
  description: z.string().max(256).optional()
});
