import crypto from 'crypto';

/**
 * Custom Error Classes for RGS Ledger SDK
 */
export class RgsError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly details?: unknown;

  constructor(message: string, code = 'RGS_ERROR', statusCode?: number, details?: unknown) {
    super(message);
    this.name = 'RgsError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthenticationError extends RgsError {
  constructor(message = 'Invalid API key or secret', details?: unknown) {
    super(message, 'AUTHENTICATION_FAILED', 401, details);
    this.name = 'AuthenticationError';
  }
}

export class ForbiddenError extends RgsError {
  constructor(message = 'Access forbidden: Missing required API scope', details?: unknown) {
    super(message, 'FORBIDDEN', 403, details);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends RgsError {
  constructor(message = 'Requested resource not found', details?: unknown) {
    super(message, 'NOT_FOUND', 404, details);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends RgsError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class ApiConnectionError extends RgsError {
  constructor(message = 'Unable to connect to RGS Ledger API', details?: unknown) {
    super(message, 'API_CONNECTION_ERROR', 0, details);
    this.name = 'ApiConnectionError';
  }
}

/**
 * Client Configuration Options
 */
export interface RgsClientOptions {
  keyId: string;
  secret: string;
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * Webhook Verification Result
 */
export interface WebhookVerificationResult {
  valid: boolean;
  reason?: string;
}

/**
 * RGS Ledger Node.js SDK Client
 */
export class RgsLedgerClient {
  private readonly keyId: string;
  private readonly secret: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: RgsClientOptions) {
    if (!options.keyId || typeof options.keyId !== 'string') {
      throw new ValidationError('A valid keyId (e.g. rgs_live_... / rgs_test_...) is required');
    }
    if (!options.secret || typeof options.secret !== 'string') {
      throw new ValidationError('A valid API secret is required');
    }

    this.keyId = options.keyId.trim();
    this.secret = options.secret.trim();
    this.baseUrl = (options.baseUrl || 'http://localhost:4000').replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 15000;
  }

  /**
   * Internal HTTP Request Handler
   */
  private async request<T = any>(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: Record<string, any>,
    queryParams?: Record<string, any>
  ): Promise<T> {
    let url = `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    if (queryParams) {
      const sp = new URLSearchParams();
      for (const [key, val] of Object.entries(queryParams)) {
        if (val !== undefined && val !== null) {
          sp.append(key, String(val));
        }
      }
      const qs = sp.toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'rgs-ledger-node-sdk/0.1.0',
          'X-API-Key': this.keyId,
          'X-API-Secret': this.secret
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      clearTimeout(timer);

      let json: any;
      const text = await response.text();
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { message: text };
      }

      if (!response.ok) {
        const errorMsg = json?.error?.message || json?.message || `HTTP ${response.status} Error`;
        const errorCode = json?.error?.code || 'API_ERROR';

        if (response.status === 401) {
          throw new AuthenticationError(errorMsg, json);
        } else if (response.status === 403) {
          throw new ForbiddenError(errorMsg, json);
        } else if (response.status === 404) {
          throw new NotFoundError(errorMsg, json);
        } else if (response.status === 400) {
          throw new ValidationError(errorMsg, json);
        } else {
          throw new RgsError(errorMsg, errorCode, response.status, json);
        }
      }

      return json.data !== undefined ? json.data : json;
    } catch (err: any) {
      clearTimeout(timer);
      if (err instanceof RgsError) {
        throw err;
      }
      if (err.name === 'AbortError') {
        throw new ApiConnectionError(`Request timed out after ${this.timeoutMs}ms`);
      }
      throw new ApiConnectionError(err.message || 'Failed to communicate with RGS Ledger API', err);
    }
  }

  /**
   * Payments API Resource
   */
  public readonly payments = {
    create: async (params: {
      amountPaise: number;
      orderId: string;
      description?: string;
      bankAccountId?: string;
      expiresAt?: string;
      metadata?: Record<string, any>;
    }) => {
      return this.request<{
        payment: any;
        upiUri: string;
        qrDataUrl: string;
        checkoutUrl: string;
      }>('/api/v1/payments', 'POST', params);
    },

    get: async (id: string) => {
      return this.request<any>(`/api/v1/payments/${encodeURIComponent(id)}`, 'GET');
    },

    list: async (params?: { status?: string; limit?: number; skip?: number; orderId?: string }) => {
      return this.request<{ payments: any[]; total: number; limit: number; skip: number }>(
        '/api/v1/payments',
        'GET',
        undefined,
        params
      );
    }
  };

  /**
   * Payment Links API Resource
   */
  public readonly paymentLinks = {
    create: async (params: {
      title: string;
      amountPaise?: number | null;
      description?: string;
      isReusable?: boolean;
      expiresAt?: string;
      metadata?: Record<string, any>;
    }) => {
      return this.request<{ link: any }>('/api/v1/payment-links', 'POST', params);
    },

    get: async (id: string) => {
      return this.request<{ link: any; recentPayments: any[] }>(
        `/api/v1/payment-links/${encodeURIComponent(id)}`,
        'GET'
      );
    },

    revoke: async (id: string) => {
      return this.request<{ link: any }>(
        `/api/v1/payment-links/${encodeURIComponent(id)}/revoke`,
        'POST'
      );
    },

    list: async (params?: { status?: string; limit?: number; skip?: number; search?: string }) => {
      return this.request<{ links: any[]; total: number; limit: number; skip: number }>(
        '/api/v1/payment-links',
        'GET',
        undefined,
        params
      );
    }
  };

  /**
   * Reconciliation Cases API Resource
   */
  public readonly reconciliation = {
    listCases: async (params?: {
      status?: string;
      severity?: string;
      caseType?: string;
      limit?: number;
      skip?: number;
    }) => {
      return this.request<{ cases: any[]; total: number; limit: number; skip: number }>(
        '/api/v1/reconciliation/cases',
        'GET',
        undefined,
        params
      );
    },

    getCase: async (id: string) => {
      return this.request<{ case: any }>(
        `/api/v1/reconciliation/cases/${encodeURIComponent(id)}`,
        'GET'
      );
    }
  };

  /**
   * Webhooks API Resource & Verification Helper
   */
  public readonly webhooks = {
    listEndpoints: async () => {
      return this.request<{ endpoints: any[] }>('/api/v1/webhooks/endpoints', 'GET');
    },

    createEndpoint: async (params: {
      url: string;
      events?: string[];
      description?: string;
      secret?: string;
    }) => {
      return this.request<any>('/api/v1/webhooks/endpoints', 'POST', params);
    },

    deleteEndpoint: async (id: string) => {
      return this.request<{ id: string }>(
        `/api/v1/webhooks/endpoints/${encodeURIComponent(id)}`,
        'DELETE'
      );
    },

    testEndpoint: async (id: string) => {
      return this.request<{
        success: boolean;
        statusCode?: number;
        latencyMs?: number;
        responseBody?: string;
        errorMessage?: string;
      }>(`/api/v1/webhooks/endpoints/${encodeURIComponent(id)}/test`, 'POST');
    },

    listDeliveries: async (params?: { limit?: number }) => {
      return this.request<{ deliveries: any[] }>(
        '/api/v1/webhooks/deliveries',
        'GET',
        undefined,
        params
      );
    },

    /**
     * Verifies an incoming webhook HMAC signature with timestamp replay protection.
     */
    verifySignature: (
      rawPayload: string,
      signatureHeader: string,
      secret: string,
      toleranceSeconds = 300
    ): WebhookVerificationResult => {
      return RgsLedgerClient.verifyWebhookSignature(rawPayload, signatureHeader, secret, toleranceSeconds);
    }
  };

  /**
   * Static utility for verifying webhook signatures without instantiating the client.
   */
  public static verifyWebhookSignature(
    rawPayload: string,
    signatureHeader: string,
    secret: string,
    toleranceSeconds = 300
  ): WebhookVerificationResult {
    if (!signatureHeader) {
      return { valid: false, reason: 'Missing signature header' };
    }

    const parts = signatureHeader.split(',').reduce<Record<string, string>>((acc, part) => {
      const [key, ...vals] = part.split('=');
      if (key && vals.length > 0) {
        acc[key.trim()] = vals.join('=').trim();
      }
      return acc;
    }, {});

    const timestampStr = parts['t'];
    const signatureHex = parts['v1'];

    if (!timestampStr || !signatureHex) {
      return { valid: false, reason: 'Malformed signature header format. Expected t=<timestamp>,v1=<signature>' };
    }

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) {
      return { valid: false, reason: 'Invalid timestamp in signature' };
    }

    const currentSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(currentSeconds - timestamp) > toleranceSeconds) {
      return { valid: false, reason: 'Webhook signature timestamp outside tolerance window (replay attack protection)' };
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawPayload}`)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const actualBuffer = Buffer.from(signatureHex, 'utf8');

    if (expectedBuffer.length !== actualBuffer.length) {
      return { valid: false, reason: 'Signature mismatch' };
    }

    const isValid = crypto.timingSafeEqual(expectedBuffer, actualBuffer);
    return isValid ? { valid: true } : { valid: false, reason: 'Signature mismatch' };
  }
}

export default RgsLedgerClient;
