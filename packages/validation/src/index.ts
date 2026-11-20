import { z } from 'zod';
import {
  PaymentStatus,
  EvidenceSource,
  EvidenceProvider,
  EvidenceChannel,
  EvidenceStatus,
  TransactionType,
  TemplateLifecycleStatus
} from '@rgs-ledger/shared-types';

/** Standard UPI VPA Regex (e.g. username@bank or phone@upi) */
export const UPI_VPA_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/;

/** Standard UTR / RRN Regex (12-digit alphanumeric or numeric) */
export const UTR_REGEX = /^[a-zA-Z0-9]{10,22}$/;

/**
 * Environment Variables Schema with defensive alias mappings
 * Supports JWT_SECRET -> JWT_ACCESS_SECRET and CORS_ORIGIN -> ALLOWED_CORS_ORIGINS
 */
export const EnvironmentRawSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),
  MERCHANT_DASHBOARD_URL: z.string().url().default('http://localhost:3001'),
  HOSTED_CHECKOUT_URL: z.string().url().default('http://localhost:3002'),
  FRONTEND_URL: z.string().url().default('http://localhost:3001'),
  ALLOWED_CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001,http://localhost:3002'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().default(10),
  MONGODB_MIN_POOL_SIZE: z.coerce.number().default(2),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must be at least 16 characters'),
  ENCRYPTION_KEY_HEX: z.string().min(32, 'ENCRYPTION_KEY_HEX must be at least 32 characters hex'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(120),
  PAYMENT_EXPIRY_MS: z.coerce.number().default(900000), // 15 mins
  EVIDENCE_RECONCILIATION_WINDOW_MS: z.coerce.number().default(86400000), // 24 hours
  SCHEDULER_SHARED_SECRET: z.string().min(16, 'SCHEDULER_SHARED_SECRET must be at least 16 characters'),
  ADMIN_BOOTSTRAP_SECRET: z.string().min(16, 'ADMIN_BOOTSTRAP_SECRET must be at least 16 characters').optional().default('default_dev_bootstrap_secret_min_16_chars'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().optional().default(''),
  _explicitMerchantDashboardUrl: z.boolean().optional(),
  _explicitHostedCheckoutUrl: z.boolean().optional(),
  _explicitFrontendUrl: z.boolean().optional()
});

export const EnvironmentSchema = z.preprocess((val: unknown) => {
  if (typeof val !== 'object' || val === null) return val;
  const raw = { ...(val as Record<string, unknown>) };

  // Alias support: JWT_SECRET -> JWT_ACCESS_SECRET
  if (!raw.JWT_ACCESS_SECRET && raw.JWT_SECRET) {
    raw.JWT_ACCESS_SECRET = raw.JWT_SECRET;
  }

  // Alias support: CORS_ORIGIN -> ALLOWED_CORS_ORIGINS
  if (!raw.ALLOWED_CORS_ORIGINS && raw.CORS_ORIGIN) {
    raw.ALLOWED_CORS_ORIGINS = raw.CORS_ORIGIN;
  }

  // Fallback sync between MERCHANT_DASHBOARD_URL and FRONTEND_URL
  if (!raw.FRONTEND_URL && raw.MERCHANT_DASHBOARD_URL) {
    raw.FRONTEND_URL = raw.MERCHANT_DASHBOARD_URL;
  }
  if (!raw.MERCHANT_DASHBOARD_URL && raw.FRONTEND_URL) {
    raw.MERCHANT_DASHBOARD_URL = raw.FRONTEND_URL;
  }

  // Preserve explicit flags for production URL validation
  if (raw.MERCHANT_DASHBOARD_URL) {
    (raw as any)._explicitMerchantDashboardUrl = true;
  }
  if (raw.HOSTED_CHECKOUT_URL) {
    (raw as any)._explicitHostedCheckoutUrl = true;
  }
  if (raw.FRONTEND_URL) {
    (raw as any)._explicitFrontendUrl = true;
  }

  return raw;
}, EnvironmentRawSchema).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production') {
    if (!data.ADMIN_BOOTSTRAP_SECRET || data.ADMIN_BOOTSTRAP_SECRET === 'default_dev_bootstrap_secret_min_16_chars') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ADMIN_BOOTSTRAP_SECRET must be explicitly configured in production and cannot use development fallback default',
        path: ['ADMIN_BOOTSTRAP_SECRET']
      });
    }
    if (data.JWT_ACCESS_SECRET.includes('your_super_secret') || data.JWT_ACCESS_SECRET.includes('test_')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_ACCESS_SECRET cannot use placeholder or test values in production',
        path: ['JWT_ACCESS_SECRET']
      });
    }
    if (data.ENCRYPTION_KEY_HEX === '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ENCRYPTION_KEY_HEX cannot use placeholder example key in production',
        path: ['ENCRYPTION_KEY_HEX']
      });
    }
    if (data.SCHEDULER_SHARED_SECRET.includes('replace_with') || data.SCHEDULER_SHARED_SECRET.includes('test_')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SCHEDULER_SHARED_SECRET cannot use placeholder values in production',
        path: ['SCHEDULER_SHARED_SECRET']
      });
    }
    if ((data as any)._explicitMerchantDashboardUrl && (data.MERCHANT_DASHBOARD_URL.includes('localhost') || data.MERCHANT_DASHBOARD_URL.includes('127.0.0.1'))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'MERCHANT_DASHBOARD_URL cannot use localhost or loopback in production',
        path: ['MERCHANT_DASHBOARD_URL']
      });
    }
    if ((data as any)._explicitHostedCheckoutUrl && (data.HOSTED_CHECKOUT_URL.includes('localhost') || data.HOSTED_CHECKOUT_URL.includes('127.0.0.1'))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'HOSTED_CHECKOUT_URL cannot use localhost or loopback in production',
        path: ['HOSTED_CHECKOUT_URL']
      });
    }
    if ((data as any)._explicitFrontendUrl && (data.FRONTEND_URL.includes('localhost') || data.FRONTEND_URL.includes('127.0.0.1'))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'FRONTEND_URL cannot use localhost or loopback in production',
        path: ['FRONTEND_URL']
      });
    }
  }
});

export type ValidatedEnvironment = z.infer<typeof EnvironmentSchema>;

/**
 * Payment Creation Input Validation Schema
 */
export const CreatePaymentRequestSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required').max(128),
  amountPaise: z.number().int().positive('Amount in paise must be a positive integer'),
  description: z.string().max(256).optional(),
  bankAccountId: z.string().optional(),
  expiresInMinutes: z.number().int().min(1).max(60).default(15).optional(),
  idempotencyKey: z.string().max(128).optional(),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number format').optional()
});

/**
 * Validates that a string is a valid UPI VPA handle (e.g. name@okaxis, store@upi)
 * and strictly NOT an email address or bank notification domain.
 */
export function isValidUpiVpa(vpa: string): boolean {
  if (!vpa || typeof vpa !== 'string') return false;
  const trimmed = vpa.trim();
  if (!UPI_VPA_REGEX.test(trimmed)) return false;
  const parts = trimmed.split('@');
  if (parts.length !== 2) return false;
  const [handle, domainOrHandle] = parts;
  if (!handle || !domainOrHandle) return false;

  const lowerDomain = domainOrHandle.toLowerCase();

  // Explicit forbidden email domains
  const forbiddenEmailDomains = [
    'gmail.com',
    'googlemail.com',
    'yahoo.com',
    'outlook.com',
    'hotmail.com',
    'icloud.com',
    'proton.me',
    'protonmail.com',
    'zoho.com',
    'mail.com',
    'aol.com'
  ];
  if (forbiddenEmailDomains.includes(lowerDomain)) {
    return false;
  }

  // Common bank notification / institution email domain suffixes
  const forbiddenSuffixes = [
    '.bank',
    '.com',
    '.net',
    '.org',
    '.edu',
    '.gov',
    '.gov.in',
    '.co.in',
    '.co',
    '.io'
  ];
  if (forbiddenSuffixes.some((s) => lowerDomain.endsWith(s))) {
    return false;
  }

  return true;
}

/**
 * Safely normalizes an account number suffix and masked identifier.
 * Input can be "0562", "XX0562", "xx0562", "••••0562", or full account number e.g. "123456789012".
 * NEVER stores plain full account numbers.
 */
export function normalizeAccountIdentifier(rawInput: string): { accountSuffix: string; accountNumberMasked: string } {
  if (!rawInput || typeof rawInput !== 'string') {
    throw new Error('Account number suffix or identifier is required');
  }
  const trimmed = rawInput.trim();
  // Extract all numeric digits
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 2) {
    throw new Error('Account suffix must contain at least 2 numeric digits');
  }
  // If user entered a full account number or long string, only keep the last 4 digits (or up to 6 digits)
  const suffix = digits.length > 6 ? digits.slice(-4) : digits;
  const masked = `XX${suffix}`;

  return {
    accountSuffix: suffix,
    accountNumberMasked: masked
  };
}

/**
 * Merchant Bank Account Creation Schema
 */
export const CreateMerchantBankAccountSchema = z.object({
  bankName: z.string().trim().min(2, 'Bank name must be at least 2 characters').max(100, 'Bank name must not exceed 100 characters'),
  upiId: z.string().trim()
    .min(3, 'UPI ID is required')
    .max(256, 'UPI ID is too long')
    .regex(UPI_VPA_REGEX, 'Invalid UPI ID format (must match name@handle)')
    .refine(isValidUpiVpa, {
      message: 'Account UPI ID must be a valid UPI VPA handle (e.g. name@okaxis, store@upi), not an email address or bank notification sender address'
    }),
  accountNumberMasked: z.string().trim().max(30).optional(),
  accountSuffix: z.string().trim().max(30).optional(),
  accountHolderName: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(255).optional(),
  expectedSenderEmails: z.array(z.string().trim()).optional(),
  expectedSenderDomains: z.array(z.string().trim()).optional(),
  expectedPackageNames: z.array(z.string().trim()).optional(),
  appNames: z.array(z.string().trim()).optional(),
  isDefault: z.boolean().optional()
}).refine(
  (data) => Boolean((data.accountNumberMasked && data.accountNumberMasked.trim()) || (data.accountSuffix && data.accountSuffix.trim())),
  {
    message: 'Account suffix or masked account number is required',
    path: ['accountNumberMasked']
  }
);

/**
 * UPI VPA Configuration Validation Schema
 */
export const UpiConfigSchema = z.object({
  vpa: z.string().regex(UPI_VPA_REGEX, 'Invalid UPI ID format (must match name@handle)'),
  businessName: z.string().min(2, 'Business name must be at least 2 characters').max(100),
  mcc: z.string().regex(/^\d{4}$/, 'MCC must be a 4-digit code').optional(),
  isAcceptingPayments: z.boolean().default(true).optional()
});

/**
 * Merchant Profile Update Schema
 */
export const UpdateMerchantProfileSchema = z.object({
  name: z.string().min(2, 'Merchant name must be at least 2 characters').max(100).optional()
});

/**
 * Authentication Input Schemas
 */
export const RegisterInputSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  merchantName: z.string().min(2, 'Merchant name must be at least 2 characters'),
  upiVpa: z.string().regex(UPI_VPA_REGEX, 'Invalid merchant UPI VPA')
});

export const LoginInputSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

/**
 * Evidence Ingestion Schemas
 */
export const IngestEmailEvidenceSchema = z.object({
  source: z.enum([EvidenceSource.EMAIL_GMAIL, EvidenceSource.EMAIL_OUTLOOK]),
  subject: z.string().min(1),
  bodySnippet: z.string().min(1),
  amountPaise: z.number().int().positive(),
  utr: z.string().regex(UTR_REGEX).optional(),
  senderEmail: z.string().email(),
  timestamp: z.string().datetime(),
  rawPayloadHash: z.string().min(16)
});

export const IngestAndroidEvidenceSchema = z.object({
  deviceId: z.string().min(1).optional(),
  providerMessageId: z.string().optional(),
  packageName: z.string().min(1, 'Package name is required'),
  appName: z.string().optional(),
  notificationTitle: z.string().optional().default(''),
  notificationText: z.string().min(1, 'Notification text is required'),
  amountPaise: z.number().int().positive().optional(),
  amountRupees: z.union([z.number(), z.string()]).optional(),
  utr: z.string().optional(),
  postTime: z.number().positive().optional(),
  rawPayloadHash: z.string().optional(),
  bankAccountId: z.string().optional()
});

/**
 * Device Companion Pairing Schema
 */
export const PairDeviceSchema = z.object({
  pairingCode: z.string().trim().min(6, 'Pairing code must be at least 6 characters').max(16),
  deviceName: z.string().trim().min(2, 'Device name must be at least 2 characters').max(100),
  deviceFingerprint: z.string().trim().min(4, 'Device fingerprint must be at least 4 characters'),
  androidVersion: z.string().trim().optional()
});

/**
 * Device Heartbeat / Status Schema
 */
export const DeviceHeartbeatSchema = z.object({
  androidVersion: z.string().optional(),
  notificationAccessGranted: z.boolean().optional(),
  pendingUploadCount: z.number().int().nonnegative().optional(),
  lastError: z.string().optional()
});

/**
 * Normalized Evidence Validation Schema
 */
export const NormalizedEvidenceSchema = z.object({
  merchantId: z.string().min(1, 'Merchant ID is required'),
  channel: z.enum([EvidenceChannel.EMAIL, EvidenceChannel.ANDROID]),
  provider: z.enum([EvidenceProvider.GMAIL, EvidenceProvider.OUTLOOK, EvidenceProvider.ANDROID_COMPANION]),
  providerMessageId: z.string().min(1, 'Provider message ID is required'),
  senderOrPackage: z.string().min(1, 'Sender email or Android package name is required'),
  accountIdentifier: z.string().nullable().optional(),
  transactionType: z.enum([TransactionType.CREDIT, TransactionType.DEBIT]).default(TransactionType.CREDIT),
  amountPaise: z.number().int().positive('Amount must be positive integer paise'),
  currency: z.literal('INR').default('INR'),
  utr: z.string().nullable().optional(),
  transactionTimestamp: z.date().nullable().optional(),
  receivedAt: z.date().default(() => new Date()),
  status: z.enum([
    EvidenceStatus.RECEIVED,
    EvidenceStatus.NORMALIZED,
    EvidenceStatus.MATCHED,
    EvidenceStatus.UNMATCHED,
    EvidenceStatus.DUPLICATE,
    EvidenceStatus.REJECTED,
    EvidenceStatus.REVIEW_REQUIRED
  ]),
  rejectionReason: z.string().optional(),
  deduplicationHash: z.string().min(16),
  rawPayloadHash: z.string().min(16),
  encryptedRawPayload: z.string().optional(),
  templateId: z.string().optional(),
  templateVersion: z.number().int().positive().optional(),
  matchedPaymentRequestId: z.string().optional()
});

/**
 * Merchant Evidence Template Schemas
 */
export const TemplateLifecycleStatusSchema = z.enum([
  TemplateLifecycleStatus.DISCOVERED,
  TemplateLifecycleStatus.PENDING_APPROVAL,
  TemplateLifecycleStatus.APPROVED,
  TemplateLifecycleStatus.DISABLED,
  TemplateLifecycleStatus.ARCHIVED
]);

export const ReactivateTemplateSchema = z.object({
  switchConflicting: z.boolean().optional().default(false),
  reactivationNotes: z.string().max(500).optional()
});

export const ArchiveTemplateSchema = z.object({
  reason: z.string().max(500).optional()
});

export const CreateTemplateVersionSchema = z.object({
  regexPattern: z.string().min(1).max(1000),
  fieldsMap: z.object({
    amountPaiseExtractor: z.string().optional(),
    utrExtractor: z.string().optional(),
    accountExtractor: z.string().optional(),
    transactionTimestampExtractor: z.string().optional(),
    transactionTypeExtractor: z.string().optional()
  }).optional(),
  samplePayload: z.string().max(2000).optional(),
  changeReason: z.string().max(500).optional()
});

export const CreateTemplateSchema = z.object({
  channel: z.enum([EvidenceChannel.EMAIL, EvidenceChannel.ANDROID]),
  provider: z.enum([EvidenceProvider.GMAIL, EvidenceProvider.OUTLOOK, EvidenceProvider.ANDROID_COMPANION]).optional(),
  bankAccountId: z.string().optional(),
  senderIdentifier: z.string().min(1).max(150).optional(),
  packageName: z.string().max(150).optional(),
  senderHeader: z.string().max(150).optional(),
  name: z.string().min(2).max(100),
  description: z.string().max(255).optional(),
  regexPattern: z.string().min(1).max(1000),
  fieldsMap: z.object({
    amountPaiseExtractor: z.string().optional(),
    utrExtractor: z.string().optional(),
    accountExtractor: z.string().optional(),
    transactionTimestampExtractor: z.string().optional(),
    transactionTypeExtractor: z.string().optional()
  }),
  samplePayload: z.string().max(2000).optional(),
  status: TemplateLifecycleStatusSchema.optional()
}).refine(data => !!(data.senderIdentifier || data.packageName || data.senderHeader), {
  message: 'At least one of senderIdentifier, packageName, or senderHeader is required'
});

export const UpdateTemplateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(255).optional(),
  bankAccountId: z.string().optional(),
  senderIdentifier: z.string().min(1).max(150).optional(),
  packageName: z.string().max(150).optional(),
  senderHeader: z.string().max(150).optional(),
  regexPattern: z.string().min(1).max(1000).optional(),
  fieldsMap: z.object({
    amountPaiseExtractor: z.string().optional(),
    utrExtractor: z.string().optional(),
    accountExtractor: z.string().optional(),
    transactionTimestampExtractor: z.string().optional(),
    transactionTypeExtractor: z.string().optional()
  }).optional(),
  samplePayload: z.string().max(2000).optional(),
  changeReason: z.string().min(1).max(255).optional()
});

export const ApproveTemplateSchema = z.object({
  templateId: z.string().min(1),
  targetVersion: z.number().int().positive(),
  samplePayload: z.string().max(2000).optional(),
  approvalNotes: z.string().max(255).optional()
});

/**
 * Phase 3A: Payment Link Validation Schemas
 */
export const CreatePaymentLinkSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').max(128),
  description: z.string().max(512).optional(),
  amountPaise: z.number().int().min(100, 'Minimum amount is 100 paise (₹1.00)').optional().nullable(),
  bankAccountId: z.string().optional().nullable(),
  isReusable: z.boolean().default(true).optional(),
  expiresAt: z.string().datetime({ offset: true }).or(z.string().datetime()).optional().nullable(),
  metadata: z.record(z.any()).optional()
});

export const InitiateLinkPaymentSchema = z.object({
  amountPaise: z.number().int().min(100, 'Minimum amount is 100 paise (₹1.00)').optional(),
  customerName: z.string().max(100).optional(),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number format').optional()
});

/**
 * Phase 3A: API Credentials Validation Schemas
 */
export const CreateApiKeySchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  environment: z.enum(['PRODUCTION', 'SANDBOX']).default('PRODUCTION').optional(),
  scopes: z.array(z.string()).min(1, 'At least one scope is required').default(['*']).optional(),
  expiresAt: z.string().datetime().optional().nullable()
});

/**
 * Checks whether an IPv4 or IPv6 address belongs to private, loopback, link-local,
 * multicast, broadcast, or reserved address ranges.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;
  const cleanIp = ip.trim().toLowerCase().replace(/^\[|\]$/g, '');

  // IPv6 checks
  if (
    cleanIp === '::1' ||
    cleanIp === '::' ||
    cleanIp.startsWith('fe80:') ||
    cleanIp.startsWith('fc') ||
    cleanIp.startsWith('fd') ||
    cleanIp.startsWith('ff') ||
    cleanIp.startsWith('2001:db8:')
  ) {
    return true;
  }

  // Handle IPv4-mapped IPv6 (::ffff:192.168.1.1)
  let ipv4 = cleanIp;
  if (cleanIp.startsWith('::ffff:')) {
    ipv4 = cleanIp.substring(7);
  }

  // IPv4 octet parsing
  const rawParts = ipv4.split('.');
  if (rawParts.length !== 4) {
    return false;
  }
  const parts = rawParts.map((p) => {
    if (!/^\d+$/.test(p)) return -1;
    return parseInt(p, 10);
  });
  if (parts.some((p) => p < 0 || p > 255)) {
    return false;
  }

  const [a, b, c] = parts as [number, number, number, number];

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;
  // 10.0.0.0/8 (RFC 1918 Private)
  if (a === 10) return true;
  // 100.64.0.0/10 (Shared Address Space / CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (Link-Local, Cloud Metadata Service: 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (RFC 1918 Private)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0 && c === 0) return true;
  // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0 && c === 2) return true;
  // 192.168.0.0/16 (RFC 1918 Private)
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && c === 100) return true;
  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true;
  // 224.0.0.0/4 (Multicast)
  if (a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 (Reserved / Future Use)
  if (a >= 240) return true;

  return false;
}

/**
 * Phase 3A/3B: Webhook Validation Schemas & SSRF Protection
 */
export function isValidWebhookUrl(urlStr: string, isProduction: boolean = false): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, reason: 'Only HTTP and HTTPS protocols are permitted.' };
    }

    const host = parsed.hostname.toLowerCase();

    // Universal SSRF check: cloud metadata IP literals (e.g. 169.254.169.254) are forbidden in all environments
    if (host.startsWith('169.254.') || host === 'metadata.google.internal' || host === 'instance-data') {
      return { valid: false, reason: 'Cloud metadata service endpoints are strictly forbidden.' };
    }

    if (isProduction) {
      if (parsed.protocol !== 'https:') {
        return { valid: false, reason: 'Production webhook endpoints must use HTTPS.' };
      }

      // Check special names and private domain suffixes
      if (
        host === 'localhost' ||
        host === '0.0.0.0' ||
        host.endsWith('.local') ||
        host.endsWith('.internal') ||
        host.endsWith('.localhost') ||
        host.endsWith('.localdomain') ||
        host.endsWith('.home') ||
        host.endsWith('.lan')
      ) {
        return { valid: false, reason: 'Private network addresses, local domains, and localhost are forbidden in production.' };
      }

      // If hostname is directly an IP literal
      if (isPrivateOrReservedIp(host)) {
        return { valid: false, reason: 'Private network addresses and localhost are forbidden in production.' };
      }
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: 'Invalid URL format.' };
  }
}

export const CreateWebhookEndpointSchema = z.object({
  url: z.string().url('A valid URL is required').refine((u) => isValidWebhookUrl(u, false).valid, {
    message: 'Invalid webhook URL protocol.'
  }),
  events: z.array(z.string()).min(1).default(['*']).optional(),
  secret: z.string().min(8).max(128).optional(),
  description: z.string().max(255).optional()
});

/**
 * Phase 3C: Admin Authentication & Operations Validation Schemas
 */
export const AdminLoginSchema = z.object({
  email: z.string().email('Valid admin email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

export const AdminBootstrapSchema = z.object({
  email: z.string().email('Valid admin email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters').default('System Administrator'),
  bootstrapSecret: z.string().min(8, 'Bootstrap secret is required (min 8 characters)')
});

export const SuspendMerchantSchema = z.object({
  reason: z.string().trim().min(3, 'Suspension reason is required (min 3 chars)').max(500)
});

export const ReactivateMerchantSchema = z.object({
  reason: z.string().trim().max(500).optional()
});

export const UpdatePlatformConfigSchema = z.object({
  paymentExpirySeconds: z.number().int().min(300, 'Minimum payment expiry is 300 seconds (5 min)').max(86400, 'Maximum payment expiry is 86400 seconds (24h)').optional(),
  evidenceMatchingWindowSeconds: z.number().int().min(300).max(86400).optional(),
  reconciliationScheduleIntervalSeconds: z.number().int().min(10).max(3600).optional(),
  webhookMaxRetries: z.number().int().min(1).max(10).optional(),
  webhookBackoffFactor: z.number().int().min(1).max(10).optional(),
  evidenceRetentionDays: z.number().int().min(30).max(365).optional(),
  rateLimitPerMinute: z.number().int().min(10).max(1000).optional()
});

export const AdminResolveReconciliationSchema = z.object({
  resolutionStatus: z.enum(['RESOLVED', 'DISMISSED']),
  resolutionNotes: z.string().trim().min(3, 'Resolution notes must be at least 3 characters').max(1000)
});

/**
 * Phase 4A: Merchant Analytics & Reporting Schemas
 */
export const MerchantAnalyticsFilterSchema = z.object({
  timeframe: z.enum(['today', 'yesterday', '7d', '30d', 'custom']).default('7d').optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.nativeEnum(PaymentStatus).optional(),
  bankAccountId: z.string().optional(),
  source: z.enum(['ALL', 'LINK', 'DIRECT']).default('ALL').optional()
});

export const MerchantReportExportSchema = z.object({
  timeframe: z.enum(['today', 'yesterday', '7d', '30d', 'custom']).default('7d').optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.nativeEnum(PaymentStatus).optional(),
  bankAccountId: z.string().optional(),
  source: z.enum(['ALL', 'LINK', 'DIRECT']).default('ALL').optional(),
  reportType: z.enum(['payments', 'evidence', 'reconciliation', 'daily_summary']).default('payments'),
  format: z.enum(['csv']).default('csv')
});

/**
 * Phase 4B: Public Website & Merchant Onboarding Schemas
 */
export const ContactSubmissionSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().email('A valid email address is required'),
  subject: z.string().trim().min(3, 'Subject must be at least 3 characters').max(150),
  message: z.string().trim().min(10, 'Message must be at least 10 characters').max(3000)
});

export const UpdateOnboardingStepSchema = z.object({
  currentStep: z.enum(['business', 'upi', 'email', 'android', 'templates', 'review', 'completed']),
  markStepCompleted: z.enum(['business', 'upi', 'email', 'android', 'templates', 'review']).optional()
});
