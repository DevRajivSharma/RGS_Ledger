/**
 * RGS LEDGER — ENVIRONMENT CONFIGURATION & SECURITY VALIDATOR
 *
 * Enforces production security invariants:
 * - Fails safely if JWT secrets use development defaults or placeholders.
 * - Fails safely if ENCRYPTION_KEY is missing, malformed, or uses example keys.
 * - Fails safely if COOKIE_SECRET or WEBHOOK_SIGNING_SECRET are weak or defaults.
 * - Fails safely if PAYMENT_ENVIRONMENT is LIVE but sandbox credentials or local URLs are used.
 * - Ensures live providers have complete credentials and no sandbox fallback.
 */

export interface ValidationIssue {
  variable: string;
  category: 'Security' | 'Provider' | 'Networking' | 'Database' | 'General';
  status: 'ERROR' | 'WARNING';
  message: string;
}

export interface ValidationSummary {
  valid: boolean;
  errors: string[];
  warnings: string[];
  issues: ValidationIssue[];
}

const INSECURE_KEY_WORDS = [
  'replace_with',
  'change_in_production',
  'dev_access_secret',
  'dev_refresh_secret',
  'dev_cookie_secret',
  'whsec_platform_default',
  'whsec_default',
  'whsec_dev',
  'example',
  'placeholder'
];

const KNOWN_EXAMPLE_ENCRYPTION_KEYS = [
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '1111111111111111111111111111111111111111111111111111111111111111'
];

function containsInsecureKeyword(value: string): boolean {
  const lower = value.toLowerCase();
  return INSECURE_KEY_WORDS.some(k => lower.includes(k));
}

/**
 * Validates the runtime environment against fintech production security rules.
 */
export function validateEnvironment(env: Record<string, string | undefined> = process.env): ValidationSummary {
  const issues: ValidationIssue[] = [];

  const nodeEnv = (env.NODE_ENV || 'development').toLowerCase();
  const paymentEnv = (env.PAYMENT_ENVIRONMENT || 'SANDBOX').toUpperCase();
  const isProduction = nodeEnv === 'production' || paymentEnv === 'LIVE';
  const isLive = paymentEnv === 'LIVE';

  // ---------------------------------------------------------------------------
  // 1. JWT Security Validation
  // ---------------------------------------------------------------------------
  const jwtAccess = env.JWT_ACCESS_SECRET || '';
  if (!jwtAccess) {
    issues.push({
      variable: 'JWT_ACCESS_SECRET',
      category: 'Security',
      status: isProduction ? 'ERROR' : 'WARNING',
      message: 'JWT_ACCESS_SECRET is required.'
    });
  } else {
    if (jwtAccess.length < 32) {
      issues.push({
        variable: 'JWT_ACCESS_SECRET',
        category: 'Security',
        status: isProduction ? 'ERROR' : 'WARNING',
        message: 'JWT_ACCESS_SECRET must be at least 32 characters long for adequate cryptographic entropy.'
      });
    }
    if (containsInsecureKeyword(jwtAccess)) {
      issues.push({
        variable: 'JWT_ACCESS_SECRET',
        category: 'Security',
        status: isProduction ? 'ERROR' : 'WARNING',
        message: isProduction
          ? 'Production JWT_ACCESS_SECRET contains development/placeholder text and cannot be used.'
          : 'Using development JWT_ACCESS_SECRET. Rotate before deploying to production.'
      });
    }
  }

  const jwtRefresh = env.JWT_REFRESH_SECRET || '';
  if (!jwtRefresh) {
    issues.push({
      variable: 'JWT_REFRESH_SECRET',
      category: 'Security',
      status: isProduction ? 'ERROR' : 'WARNING',
      message: 'JWT_REFRESH_SECRET is required.'
    });
  } else {
    if (jwtRefresh.length < 32) {
      issues.push({
        variable: 'JWT_REFRESH_SECRET',
        category: 'Security',
        status: isProduction ? 'ERROR' : 'WARNING',
        message: 'JWT_REFRESH_SECRET must be at least 32 characters long.'
      });
    }
    if (containsInsecureKeyword(jwtRefresh)) {
      issues.push({
        variable: 'JWT_REFRESH_SECRET',
        category: 'Security',
        status: isProduction ? 'ERROR' : 'WARNING',
        message: isProduction
          ? 'Production JWT_REFRESH_SECRET contains development/placeholder text and cannot be used.'
          : 'Using development JWT_REFRESH_SECRET. Rotate before deploying to production.'
      });
    }
    if (isProduction && jwtAccess && jwtRefresh === jwtAccess) {
      issues.push({
        variable: 'JWT_REFRESH_SECRET',
        category: 'Security',
        status: 'ERROR',
        message: 'JWT_REFRESH_SECRET must not be identical to JWT_ACCESS_SECRET in production.'
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Master AES-256-GCM Encryption Key Validation
  // ---------------------------------------------------------------------------
  const encKey = env.ENCRYPTION_KEY || '';
  if (!encKey) {
    issues.push({
      variable: 'ENCRYPTION_KEY',
      category: 'Security',
      status: isProduction ? 'ERROR' : 'WARNING',
      message: 'ENCRYPTION_KEY is missing. Required for encrypting merchant credentials at rest.'
    });
  } else {
    const is64Hex = /^[0-9a-fA-F]{64}$/.test(encKey);
    if (!is64Hex) {
      issues.push({
        variable: 'ENCRYPTION_KEY',
        category: 'Security',
        status: isProduction ? 'ERROR' : 'WARNING',
        message: 'ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes AES-256-GCM).'
      });
    }
    if (KNOWN_EXAMPLE_ENCRYPTION_KEYS.includes(encKey.toLowerCase()) || containsInsecureKeyword(encKey)) {
      issues.push({
        variable: 'ENCRYPTION_KEY',
        category: 'Security',
        status: isProduction ? 'ERROR' : 'WARNING',
        message: isProduction
          ? 'Production ENCRYPTION_KEY uses a publicly known example key. Must be cryptographically generated.'
          : 'Using example development ENCRYPTION_KEY.'
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Cookie & Webhook Signing Secrets
  // ---------------------------------------------------------------------------
  const cookieSecret = env.COOKIE_SECRET || '';
  if (!cookieSecret) {
    issues.push({
      variable: 'COOKIE_SECRET',
      category: 'Security',
      status: isProduction ? 'ERROR' : 'WARNING',
      message: 'COOKIE_SECRET is required.'
    });
  } else {
    if (cookieSecret.length < 32) {
      issues.push({
        variable: 'COOKIE_SECRET',
        category: 'Security',
        status: isProduction ? 'ERROR' : 'WARNING',
        message: 'COOKIE_SECRET should be at least 32 characters.'
      });
    }
    if (containsInsecureKeyword(cookieSecret)) {
      issues.push({
        variable: 'COOKIE_SECRET',
        category: 'Security',
        status: isProduction ? 'ERROR' : 'WARNING',
        message: isProduction
          ? 'Production COOKIE_SECRET contains development/placeholder text and cannot be used.'
          : 'Using development COOKIE_SECRET.'
      });
    }
  }

  const webhookSecret = env.WEBHOOK_SIGNING_SECRET || '';
  if (!webhookSecret) {
    issues.push({
      variable: 'WEBHOOK_SIGNING_SECRET',
      category: 'Security',
      status: isProduction ? 'ERROR' : 'WARNING',
      message: 'WEBHOOK_SIGNING_SECRET is required.'
    });
  } else {
    if (webhookSecret.length < 24) {
      issues.push({
        variable: 'WEBHOOK_SIGNING_SECRET',
        category: 'Security',
        status: isProduction ? 'ERROR' : 'WARNING',
        message: 'WEBHOOK_SIGNING_SECRET must be at least 24 characters.'
      });
    }
    if (containsInsecureKeyword(webhookSecret)) {
      issues.push({
        variable: 'WEBHOOK_SIGNING_SECRET',
        category: 'Security',
        status: isProduction ? 'ERROR' : 'WARNING',
        message: isProduction
          ? 'Production WEBHOOK_SIGNING_SECRET contains development/placeholder text and cannot be used.'
          : 'Using default development WEBHOOK_SIGNING_SECRET.'
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Live Environment & Provider Credentials Validation
  // ---------------------------------------------------------------------------
  if (isLive) {
    if (nodeEnv === 'development') {
      issues.push({
        variable: 'NODE_ENV',
        category: 'General',
        status: 'ERROR',
        message: 'PAYMENT_ENVIRONMENT is set to LIVE, but NODE_ENV is set to development. Real transactions require production environment.'
      });
    }

    // Check PhonePe platform credentials
    const phonepeMid = env.PHONEPE_MERCHANT_ID || '';
    if (phonepeMid) {
      if (phonepeMid === 'PGTESTPAYUAT' || phonepeMid.toUpperCase().includes('UAT') || phonepeMid.toUpperCase().includes('TEST')) {
        issues.push({
          variable: 'PHONEPE_MERCHANT_ID',
          category: 'Provider',
          status: 'ERROR',
          message: 'PAYMENT_ENVIRONMENT is LIVE, but PHONEPE_MERCHANT_ID is using a sandbox/UAT test identifier.'
        });
      }
      if (env.PHONEPE_ENV === 'sandbox') {
        issues.push({
          variable: 'PHONEPE_ENV',
          category: 'Provider',
          status: 'ERROR',
          message: 'PAYMENT_ENVIRONMENT is LIVE, but PHONEPE_ENV is set to sandbox.'
        });
      }
      if (!env.PHONEPE_SALT_KEY || !env.PHONEPE_SALT_INDEX) {
        issues.push({
          variable: 'PHONEPE_SALT_KEY',
          category: 'Provider',
          status: 'ERROR',
          message: 'PhonePe is configured as a live provider but PHONEPE_SALT_KEY or PHONEPE_SALT_INDEX is missing.'
        });
      }
      if (env.PHONEPE_SALT_KEY === '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399') {
        issues.push({
          variable: 'PHONEPE_SALT_KEY',
          category: 'Provider',
          status: 'ERROR',
          message: 'PAYMENT_ENVIRONMENT is LIVE, but PHONEPE_SALT_KEY is using the public sandbox UAT salt key.'
        });
      }
    }

    // Check Paytm platform credentials
    const paytmMid = env.PAYTM_MERCHANT_ID || '';
    if (paytmMid) {
      if (paytmMid === 'STAGE_MID_PAYTM_99214' || paytmMid.startsWith('STAGE_')) {
        issues.push({
          variable: 'PAYTM_MERCHANT_ID',
          category: 'Provider',
          status: 'ERROR',
          message: 'PAYMENT_ENVIRONMENT is LIVE, but PAYTM_MERCHANT_ID is using a staging test identifier.'
        });
      }
      if (env.PAYTM_ENV === 'sandbox') {
        issues.push({
          variable: 'PAYTM_ENV',
          category: 'Provider',
          status: 'ERROR',
          message: 'PAYMENT_ENVIRONMENT is LIVE, but PAYTM_ENV is set to sandbox.'
        });
      }
      if (!env.PAYTM_MERCHANT_KEY) {
        issues.push({
          variable: 'PAYTM_MERCHANT_KEY',
          category: 'Provider',
          status: 'ERROR',
          message: 'Paytm is configured as a live provider but PAYTM_MERCHANT_KEY is missing.'
        });
      }
      if (env.PAYTM_MERCHANT_KEY === 'STAGE_MKEY_PAYTM_8819273' || env.PAYTM_MERCHANT_KEY?.startsWith('STAGE_')) {
        issues.push({
          variable: 'PAYTM_MERCHANT_KEY',
          category: 'Provider',
          status: 'ERROR',
          message: 'PAYMENT_ENVIRONMENT is LIVE, but PAYTM_MERCHANT_KEY is using a staging key.'
        });
      }
    }

    // Check Service URLs
    const urls = [
      { name: 'API_URL', val: env.API_URL },
      { name: 'CHECKOUT_URL', val: env.CHECKOUT_URL },
      { name: 'DASHBOARD_URL', val: env.DASHBOARD_URL }
    ];
    for (const u of urls) {
      if (u.val && (u.val.includes('localhost') || u.val.includes('127.0.0.1'))) {
        issues.push({
          variable: u.name,
          category: 'Networking',
          status: 'ERROR',
          message: `In LIVE mode, ${u.name} cannot point to localhost (${u.val}). Must be a public HTTPS domain.`
        });
      }
    }

    // Check MongoDB
    const mongoUri = env.MONGODB_URI || '';
    if (mongoUri.includes('127.0.0.1:27017') || mongoUri.includes('localhost:27017')) {
      if (!mongoUri.includes('@')) {
        issues.push({
          variable: 'MONGODB_URI',
          category: 'Database',
          status: 'WARNING',
          message: 'In LIVE production mode, MONGODB_URI appears to be an unauthenticated local MongoDB instance.'
        });
      }
    }
  }

  const errors = issues.filter(i => i.status === 'ERROR').map(i => `[${i.variable}] ${i.message}`);
  const warnings = issues.filter(i => i.status === 'WARNING').map(i => `[${i.variable}] ${i.message}`);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    issues
  };
}

/**
 * Asserts that the production environment is securely configured.
 * Throws a fatal Error if any security error is detected.
 */
export function assertProductionEnvironment(env: Record<string, string | undefined> = process.env): void {
  const result = validateEnvironment(env);
  if (!result.valid) {
    const errorList = result.errors.map(e => `  - ${e}`).join('\n');
    throw new Error(
      `[Security Error] Production environment configuration validation failed with ${result.errors.length} fatal errors:\n${errorList}\n` +
      `Startup aborted to protect platform integrity.`
    );
  }
}
