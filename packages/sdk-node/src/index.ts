import {
  verifyWebhookSignature,
  OrderDTO,
  PaymentDTO,
  RefundDTO,
  PaymentLinkDTO,
  CheckoutSessionDTO,
  ApiResponse
} from '@rgs-ledger/shared';

export interface RgsLedgerOptions {
  keySecret: string;
  keyId?: string;
  baseUrl?: string;
  timeout?: number;
}

export class RgsLedgerError extends Error {
  public code: string;
  public status: number;
  public details?: any;

  constructor(message: string, code: string = 'API_ERROR', status: number = 500, details?: any) {
    super(message);
    this.name = 'RgsLedgerError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class RgsLedger {
  private keySecret: string;
  private keyId?: string;
  private baseUrl: string;
  private timeout: number;

  constructor(options: RgsLedgerOptions) {
    if (!options.keySecret) {
      throw new Error('RGS Ledger: keySecret is required for server SDK authentication.');
    }
    this.keySecret = options.keySecret;
    this.keyId = options.keyId;
    this.baseUrl = (options.baseUrl || 'http://localhost:4000/api/v1').replace(/\/$/, '');
    this.timeout = options.timeout || 15000;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.keySecret}`,
      'x-api-key': this.keySecret,
      ...(options.headers as Record<string, string> || {})
    };

    if (this.keyId) {
      headers['x-api-key-id'] = this.keyId;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });

      const json = (await response.json()) as ApiResponse<T>;

      if (!response.ok || !json.success) {
        throw new RgsLedgerError(
          json.error?.message || `Request failed with status ${response.status}`,
          json.error?.code || 'UNKNOWN_ERROR',
          response.status,
          json.error?.details
        );
      }

      return json.data as T;
    } catch (err: any) {
      if (err instanceof RgsLedgerError) throw err;
      throw new RgsLedgerError(err.message || 'Network request failed', 'NETWORK_ERROR', 0);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public orders = {
    create: (data: {
      amount: number; // in paise
      currency?: string;
      receipt?: string;
      notes?: Record<string, string>;
      customer?: { name?: string; email?: string; phone?: string };
    }): Promise<OrderDTO> => {
      return this.request<OrderDTO>('/orders', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    fetch: (orderId: string): Promise<OrderDTO> => {
      return this.request<OrderDTO>(`/orders/${orderId}`, { method: 'GET' });
    },

    list: (params?: { page?: number; limit?: number; status?: string }): Promise<{ orders: OrderDTO[]; total: number }> => {
      const query = new URLSearchParams(params as any).toString();
      return this.request<{ orders: OrderDTO[]; total: number }>(`/orders?${query}`, { method: 'GET' });
    }
  };

  public checkout = {
    createSession: (data: {
      orderId: string;
      successUrl: string;
      cancelUrl: string;
      expiresInMinutes?: number;
    }): Promise<CheckoutSessionDTO> => {
      return this.request<CheckoutSessionDTO>('/checkout/sessions', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    fetchSession: (sessionId: string): Promise<CheckoutSessionDTO> => {
      return this.request<CheckoutSessionDTO>(`/checkout/sessions/${sessionId}`, { method: 'GET' });
    }
  };

  public payments = {
    fetch: (paymentId: string): Promise<PaymentDTO> => {
      return this.request<PaymentDTO>(`/payments/${paymentId}`, { method: 'GET' });
    },

    list: (params?: { page?: number; limit?: number; orderId?: string }): Promise<{ payments: PaymentDTO[]; total: number }> => {
      const query = new URLSearchParams(params as any).toString();
      return this.request<{ payments: PaymentDTO[]; total: number }>(`/payments?${query}`, { method: 'GET' });
    }
  };

  public refunds = {
    create: (data: {
      paymentId: string;
      amount: number; // in paise
      reason: string;
      notes?: Record<string, string>;
    }): Promise<RefundDTO> => {
      return this.request<RefundDTO>('/refunds', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    fetch: (refundId: string): Promise<RefundDTO> => {
      return this.request<RefundDTO>(`/refunds/${refundId}`, { method: 'GET' });
    }
  };

  public paymentLinks = {
    create: (data: {
      amount: number;
      title: string;
      description?: string;
      currency?: string;
      customer?: { name?: string; email?: string; phone?: string };
    }): Promise<PaymentLinkDTO> => {
      return this.request<PaymentLinkDTO>('/payment-links', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    fetch: (linkId: string): Promise<PaymentLinkDTO> => {
      return this.request<PaymentLinkDTO>(`/payment-links/${linkId}`, { method: 'GET' });
    },

    deactivate: (linkId: string): Promise<PaymentLinkDTO> => {
      return this.request<PaymentLinkDTO>(`/payment-links/${linkId}/deactivate`, { method: 'POST' });
    }
  };

  public webhooks = {
    verifySignature: (
      payload: string,
      signatureHeader: string,
      secret: string,
      toleranceSeconds: number = 300
    ): boolean => {
      return verifyWebhookSignature(payload, signatureHeader, secret, toleranceSeconds);
    }
  };
}

export default RgsLedger;
