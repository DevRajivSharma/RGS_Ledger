import QRCode from 'qrcode';

/**
 * Parameters required to generate an NPCI-compliant UPI URI and QR code.
 */
export interface UpiPaymentDetails {
  /** Payee Virtual Payment Address (e.g., merchant@bank) */
  payeeVpa: string;
  /** Payee Name / Merchant Business Name */
  payeeName: string;
  /** Amount in integer paise (e.g., 50000 for ₹500.00) */
  amountPaise: number;
  /** Transaction Reference / Order ID */
  orderId: string;
  /** Transaction Note / Description shown on payer's screen */
  note?: string;
  /** Merchant Category Code (optional) */
  mcc?: string;
  /** Currency (Default: INR) */
  currency?: 'INR';
}

/**
 * Deep link intents for mobile UPI apps
 */
export interface UpiIntentLinks {
  generic: string;
  phonepe: string;
  gpay: string;
  paytm: string;
  bhim: string;
}

/**
 * Result of QR generation
 */
export interface UpiQrResult {
  orderId: string;
  amountPaise: number;
  amountRupees: number;
  upiUri: string;
  /** Base64 Data URI of the generated QR code (data:image/png;base64,...) */
  qrDataUrl: string;
  intentLinks: UpiIntentLinks;
}

/**
 * Core UPI Adapter Interface
 * 
 * STRICT FINTECH COMPLIANCE BOUNDARY:
 * This adapter ONLY generates standard NPCI UPI payment URIs and static/dynamic QR codes.
 * It NEVER performs payment creation, status checking, bank callbacks, PSP webhooks,
 * or direct settlement operations.
 */
export interface IUpiAdapter {
  generatePaymentQr(params: UpiPaymentDetails): Promise<UpiQrResult>;
  validateVpa(vpa: string): boolean;
  buildUpiUri(params: UpiPaymentDetails): string;
}

/**
 * Builds a standard, universally compatible NPCI UPI URI (Specification 1.6).
 * 
 * Critical compatibility rules:
 * 1. Payee VPA (`pa`) MUST contain literal '@' (NOT percent-encoded '%40').
 *    Mobile UPI QR scanner regexes (PhonePe, Paytm, BHIM) evaluate the raw VPA and fail on '%40'.
 * 2. Payee name (`pn`) and transaction note (`tn`) MUST use standard percent-encoding ('%20' for spaces, NOT '+').
 * 3. Amount (`am`) is formatted to exactly 2 decimal places.
 * 4. Currency (`cu`) is fixed to 'INR'.
 * 5. Transaction reference (`tr`) contains the unique order reference.
 * 6. `mode=04` MUST NOT be set:
 *    In NPCI specifications, `mode=04` denotes an 'In-App Intent' (app-to-app flow), NOT a camera-scanned QR code.
 *    Including `mode=04` in a camera-scanned QR causes UPI scanner apps (GPay, PhonePe, Paytm) to check for missing
 *    merchant digital certificates/signatures or reject the initiation medium with 'Invalid QR'.
 */
export function buildNpciUpiUri(params: {
  payeeVpa: string;
  payeeName: string;
  amountPaise: number;
  orderId: string;
  note?: string;
  mcc?: string;
}): string {
  const amountRupees = (params.amountPaise / 100).toFixed(2);
  const parts: string[] = [
    `pa=${params.payeeVpa.trim()}`,
    `pn=${encodeURIComponent(params.payeeName.trim())}`,
    `am=${amountRupees}`,
    `tr=${encodeURIComponent(params.orderId.trim())}`,
    `cu=INR`
  ];

  if (params.mcc) {
    parts.push(`mc=${encodeURIComponent(params.mcc.trim())}`);
  }

  if (params.note) {
    parts.push(`tn=${encodeURIComponent(params.note.trim())}`);
  }

  return `upi://pay?${parts.join('&')}`;
}

/**
 * Constructs app-specific mobile deep link intents from an NPCI UPI URI.
 */
export function buildIntentLinks(upiUri: string): UpiIntentLinks {
  const queryString = upiUri.replace(/^upi:\/\/pay\?/, '');
  return {
    generic: upiUri,
    phonepe: `phonepe://pay?${queryString}`,
    gpay: `tez://upi/pay?${queryString}`,
    paytm: `paytmmp://pay?${queryString}`,
    bhim: `upi://pay?${queryString}`
  };
}

/**
 * NPCI UPI Adapter generating universally scannable UPI QR codes and intent links
 */
export class NpciUpiAdapter implements IUpiAdapter {
  private static readonly VPA_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/;

  validateVpa(vpa: string): boolean {
    if (!vpa || typeof vpa !== 'string') return false;
    return NpciUpiAdapter.VPA_REGEX.test(vpa.trim());
  }

  buildUpiUri(params: UpiPaymentDetails): string {
    return buildNpciUpiUri(params);
  }

  async generatePaymentQr(params: UpiPaymentDetails): Promise<UpiQrResult> {
    if (!this.validateVpa(params.payeeVpa)) {
      throw new Error(`Invalid UPI Payee VPA: "${params.payeeVpa}"`);
    }

    if (!Number.isInteger(params.amountPaise) || params.amountPaise <= 0) {
      throw new Error(`Invalid UPI transaction amount in paise: "${params.amountPaise}". Must be positive integer.`);
    }

    const amountRupees = Number((params.amountPaise / 100).toFixed(2));
    const upiUri = buildNpciUpiUri({
      payeeVpa: params.payeeVpa,
      payeeName: params.payeeName,
      amountPaise: params.amountPaise,
      orderId: params.orderId,
      note: params.note,
      mcc: params.mcc
    });

    // High error correction (H) ensures maximum scannability even on reflective or low-brightness screens
    const qrDataUrl = await QRCode.toDataURL(upiUri, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    const intentLinks = buildIntentLinks(upiUri);

    return {
      orderId: params.orderId,
      amountPaise: params.amountPaise,
      amountRupees,
      upiUri,
      qrDataUrl,
      intentLinks
    };
  }
}

/**
 * Factory for creating the configured UPI adapter instance.
 */
export class UpiAdapterFactory {
  private static instance: IUpiAdapter | null = null;

  public static getAdapter(): IUpiAdapter {
    if (!this.instance) {
      this.instance = new NpciUpiAdapter();
    }
    return this.instance;
  }
}
