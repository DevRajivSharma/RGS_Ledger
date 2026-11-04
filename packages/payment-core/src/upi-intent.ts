import { toMajorUnitString } from '@rgs-ledger/shared';

export interface UPIParams {
  payeeVpa: string;        // pa: Payee virtual address (e.g. merchant@icici)
  payeeName: string;       // pn: Payee Name
  transactionRef: string;  // tr: Transaction reference ID
  transactionNote?: string;// tn: Transaction note
  amountPaise: number;     // am: Transaction amount in minor units
  currency?: string;       // cu: Currency (INR)
  merchantCode?: string;   // mc: Merchant Category Code (MCC)
  url?: string;            // url: Order or transaction reference URL
}

export class GenericUPIIntentProvider {
  /**
   * Validates Indian Virtual Payment Address (VPA) / UPI ID format: username@bank
   */
  static isValidUPIId(upiId: string): boolean {
    if (!upiId) return false;
    const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
    return upiRegex.test(upiId.trim());
  }

  /**
   * Generates standard NPCI compliant UPI Intent URI string
   * e.g. upi://pay?pa=...&pn=...&tr=...&tn=...&am=...&cu=INR
   */
  static generateIntentUri(params: UPIParams): string {
    const amountMajor = toMajorUnitString(params.amountPaise, params.currency || 'INR');
    
    const query = new URLSearchParams({
      pa: params.payeeVpa,
      pn: params.payeeName,
      tr: params.transactionRef,
      tn: params.transactionNote || `Payment ${params.transactionRef}`,
      am: amountMajor,
      cu: params.currency || 'INR'
    });

    if (params.merchantCode) {
      query.set('mc', params.merchantCode);
    }

    if (params.url) {
      query.set('url', params.url);
    }

    return `upi://pay?${query.toString()}`;
  }

  /**
   * Deep-link schemas for popular mobile UPI PSP Apps
   */
  static getAppSpecificLinks(intentUri: string): Record<string, string> {
    const rawQuery = intentUri.replace(/^upi:\/\/pay\?/, '');
    return {
      generic: intentUri,
      gpay: `tez://upi/pay?${rawQuery}`,
      phonepe: `phonepe://pay?${rawQuery}`,
      paytm: `paytmmp://pay?${rawQuery}`,
      bhim: `bhim://pay?${rawQuery}`
    };
  }
}
