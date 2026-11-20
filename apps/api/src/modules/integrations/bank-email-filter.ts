/**
 * Bank Email Candidate Filter and Parser Strategy
 *
 * Provides selective multi-tier evaluation for incoming bank transaction credit emails:
 * 1. Blacklist evaluation (Job portals, shopping, delivery, promotional, marketing).
 * 2. Bank domain/sender validation (supports standard Indian banks and generic merchant custom templates).
 * 3. Credit vs Debit classification.
 * 4. Transaction keyword scoring (subject and body text).
 * 5. Extraction of amount, currency, account mask, UTR/RRN, and payee details.
 */

import { TemplateManager } from '../templates/template-manager.js';

export interface CandidateEvaluationResult {
  isCandidate: boolean;
  rejectionReason?: string;
  isDebit?: boolean;
  score: number;
  extracted?: {
    amountPaise?: number;
    amountRupees?: string;
    utr?: string;
    accountIdentifier?: string;
    payerOrPayee?: string;
    bankName?: string;
  };
}

export interface BankEmailPattern {
  name: string;
  senderDomains: string[];
  senderKeywords: string[];
}

export class BankEmailCandidateFilter {
  /**
   * Known non-bank domains / keywords to reject immediately.
   * Prevents recruitment, e-commerce orders, delivery updates, and marketing emails
   * from cluttering evidence pipelines.
   */
  private static readonly EXCLUDED_SENDER_DOMAINS = [
    'indeed.com',
    'indeedmail.com',
    'indeedemail.com',
    'bounces.indeed.com',
    'notifications.indeed.com',
    'messages.indeed.com',
    'linkedin.com',
    'naukri.com',
    'recruiter.naukri.com',
    'glassdoor.com',
    'monster.com',
    'foundit.in',
    'shine.com',
    'internshala.com',
    'timesjobs.com',
    'amazon.com',
    'amazon.in',
    'amazon.co.uk',
    'amazon.ca',
    'amazonpay.in',
    'amazonpay.com',
    'order.amazon.in',
    'sellercentral.amazon.in',
    'flipkart.com',
    'flipkartpay.com',
    'myntra.com',
    'swiggy.in',
    'zomato.com',
    'uber.com',
    'ola.com',
    'olacabs.com',
    'bookmyshow.com',
    'makemytrip.com',
    'goibibo.com',
    'netflix.com',
    'spotify.com',
    'hotstar.com',
    'apple.com',
    'google.com',
    'facebookmail.com',
    'twitter.com',
    'x.com',
    'instagram.com',
    'pinterest.com',
    'medium.com',
    'quora.com',
    'coursera.org',
    'udemy.com'
  ];

  private static readonly EXCLUDED_SUBJECT_PATTERNS = [
    /\b(?:job|jobs|hiring|interview|career|careers|application|resume|cv|recruiter|candidate|vacancy|vacancies|stipend|salary)\b/i,
    /\b(?:order placed|order confirmed|order received|order dispatched|order cancelled|shipped|out for delivery|delivered|item arrived|track your order|track shipment)\b/i,
    /\b(?:subscription|plan renewed|membership|newsletter|promotions|deals of the day|cashback|voucher|coupon|refund for your order|payment received for order)\b/i,
    /\b(?:webinar|event invitation|survey|feedback requested|rate your)\b/i,
    /\b(?:welcome to|verify your email|reset your password|otp for login)\b/i
  ];

  private static readonly EXCLUDED_BODY_PATTERNS = [
    /\b(?:apply now|job description|salary:\s*(?:inr|rs|₹)|stipend:\s*(?:inr|rs|₹)|we have received your (?:application|resume|cv)|shortlisted for|interview scheduled|walk-in interview|hiring for)\b/i,
    /\b(?:order (?:id|#|details|summary)|delivery address|shipping address|items in your order|estimated delivery|dispatch details|track your package)\b/i
  ];

  /**
   * Standard Indian banking institutions & UPI handles.
   * Not strictly exclusive: unrecognized senders with high financial transaction scores
   * are still permitted to prevent dropping legitimate unlisted banks.
   */
  public static readonly KNOWN_BANK_PATTERNS: BankEmailPattern[] = [
    { name: 'HDFC Bank', senderDomains: ['hdfcbank.net', 'hdfcbank.com'], senderKeywords: ['hdfc'] },
    { name: 'ICICI Bank', senderDomains: ['icicibank.com', 'icicibank.co.in'], senderKeywords: ['icici'] },
    { name: 'State Bank of India', senderDomains: ['sbi.co.in'], senderKeywords: ['sbi', 'onlinesbi'] },
    { name: 'Axis Bank', senderDomains: ['axisbank.com'], senderKeywords: ['axis'] },
    { name: 'Kotak Mahindra Bank', senderDomains: ['kotak.com'], senderKeywords: ['kotak'] },
    { name: 'Punjab National Bank', senderDomains: ['pnb.co.in'], senderKeywords: ['pnb'] },
    { name: 'Bank of Baroda', senderDomains: ['bankofbaroda.co.in', 'bankofbaroda.com'], senderKeywords: ['bob', 'baroda'] },
    { name: 'Canara Bank', senderDomains: ['canarabank.com'], senderKeywords: ['canara'] },
    { name: 'Union Bank of India', senderDomains: ['unionbankofindia.bank', 'unionbankofindia.co.in'], senderKeywords: ['union'] },
    { name: 'IndusInd Bank', senderDomains: ['indusind.com'], senderKeywords: ['indusind'] },
    { name: 'Yes Bank', senderDomains: ['yesbank.in'], senderKeywords: ['yesbank'] },
    { name: 'IDFC FIRST Bank', senderDomains: ['idfcfirstbank.com', 'idfcbank.com'], senderKeywords: ['idfc'] },
    { name: 'Federal Bank', senderDomains: ['federalbank.co.in'], senderKeywords: ['federal'] },
    { name: 'RBL Bank', senderDomains: ['rblbank.com'], senderKeywords: ['rbl'] },
    { name: 'Paytm Payments Bank', senderDomains: ['paytmbank.com', 'paytm.com'], senderKeywords: ['paytm'] },
    { name: 'Airtel Payments Bank', senderDomains: ['airtelbank.com'], senderKeywords: ['airtel'] }
  ];

  /**
   * Evaluates an email candidate across sender, subject, and body text.
   */
  public static evaluateCandidate(input: {
    sender: string;
    subject: string;
    bodyText: string;
    customSenderIdentifiers?: string[];
  }): CandidateEvaluationResult {
    const sender = (input.sender || '').toLowerCase();
    const subject = TemplateManager.normalizeNotificationText(input.subject || '');
    const bodyText = TemplateManager.normalizeNotificationText(input.bodyText || '');

    // 1. Exclude based on sender domain blacklist
    const domainMatch = sender.match(/@([a-z0-9.-]+)/i);
    const senderHost = (domainMatch && domainMatch[1] ? domainMatch[1] : sender).toLowerCase();
    for (const domain of this.EXCLUDED_SENDER_DOMAINS) {
      if (
        senderHost === domain ||
        senderHost.endsWith('.' + domain) ||
        sender.includes(`@${domain}`) ||
        sender.includes(`.${domain}`)
      ) {
        return {
          isCandidate: false,
          rejectionReason: `EXCLUDED_RECRUITMENT_OR_COMMERCE_DOMAIN: ${domain}`,
          score: -100
        };
      }
    }

    // 2. Exclude based on subject keywords (jobs, deliveries, promo)
    for (const pattern of this.EXCLUDED_SUBJECT_PATTERNS) {
      if (pattern.test(subject)) {
        return {
          isCandidate: false,
          rejectionReason: 'EXCLUDED_SUBJECT_CATEGORY',
          score: -80
        };
      }
    }

    // 2b. Exclude based on body content (job applications, e-commerce orders/shipments)
    for (const pattern of this.EXCLUDED_BODY_PATTERNS) {
      if (pattern.test(bodyText)) {
        return {
          isCandidate: false,
          rejectionReason: 'EXCLUDED_RECRUITMENT_OR_ORDER_BODY_CONTENT',
          score: -90
        };
      }
    }

    // 3. Classify Credit vs Debit
    // Strong debit keywords:
    const isDebit = this.detectDebit(subject, bodyText);
    if (isDebit) {
      const amountRegex = /(?:Amount[:\s]+(?:INR|Rs\.?|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)|(?:INR|Rs\.?|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?))/i;
      const amountMatch = bodyText.match(amountRegex) || subject.match(amountRegex);
      const rawVal = amountMatch ? (amountMatch[1] || amountMatch[2] || '') : '';
      const amountStr = rawVal.replace(/,/g, '');
      const amountNum = amountStr ? parseFloat(amountStr) : NaN;
      const amountPaise = !isNaN(amountNum) && amountNum > 0 ? Math.round(amountNum * 100) : undefined;

      const accountRegex = /(?:A\/c|Account|acct)[^\d]*([0-9]{3,20}|[Xx*]+[0-9]{2,10})/i;
      const accountMatch = bodyText.match(accountRegex);

      return {
        isCandidate: false,
        rejectionReason: 'DEBIT_TRANSACTION_IGNORED',
        isDebit: true,
        score: -50,
        extracted: {
          amountPaise,
          amountRupees: amountStr,
          accountIdentifier: accountMatch && accountMatch[1] ? accountMatch[1].trim() : undefined
        }
      };
    }

    // 4. Score financial credit patterns
    let score = 0;

    // Check sender match against known banks or merchant custom templates
    const isKnownBank = this.KNOWN_BANK_PATTERNS.some((p) =>
      p.senderDomains.some((d) => sender.includes(d)) ||
      p.senderKeywords.some((k) => sender.includes(k))
    ) || sender.includes('bank');

    const isCustomSender = (input.customSenderIdentifiers || []).some((id) =>
      sender.includes(id.toLowerCase())
    );

    if (isKnownBank || isCustomSender) {
      score += 40;
    }

    // Check subject credit indicators (strict financial credit, not generic "received")
    const creditSubjectPattern = /\b(?:credited|credit|deposit|funds received|upi received|payment received from|neft credit|imps credit|rtgs credit)\b/i;
    const hasCreditSubject = creditSubjectPattern.test(subject);
    if (hasCreditSubject) {
      score += 30;
    }

    // Check body credit indicators
    const creditBodyPattern = /\b(?:has been credited|credited|credited to|credited with|amount credited|received rs|received inr|received ₹|funds credited|transaction type:\s*credit|type:\s*credit)\b/i;
    const hasCreditBody = creditBodyPattern.test(bodyText);
    if (hasCreditBody) {
      score += 25;
    }

    // Check amount presence (mandatory for any transaction evidence)
    const amountRegex = /(?:Amount[:\s]+(?:INR|Rs\.?|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)|(?:INR|Rs\.?|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?))/i;
    const amountMatch = bodyText.match(amountRegex) || subject.match(amountRegex);

    if (amountMatch && (amountMatch[1] || amountMatch[2])) {
      score += 20;
    }

    // Check UTR / RRN / Reference presence (Optional bonus, not mandatory)
    const utrRegex = /(?:UPI(?:\s*Ref)?(?:\s*No\.?)?|Ref(?:\s*No\.?)?|Reference|RRN|IMPS Ref)[:\s]*([a-zA-Z0-9]{10,22})/i;
    const utrMatch = bodyText.match(utrRegex) || subject.match(utrRegex);
    if (utrMatch && utrMatch[1]) {
      score += 15;
    }

    // Check account mask (e.g. A/c ...1234, account ending with 1234, or XX9988)
    const accountRegex = /(?:A\/c|Account|acct)[^\d]*([0-9]{3,20}|[Xx*]+[0-9]{2,10})/i;
    const accountMatch = bodyText.match(accountRegex);
    if (accountMatch && accountMatch[1]) {
      score += 10;
    }

    // Candidate threshold: require at least amount + credit keyword or bank sender + credit keyword.
    // An email that merely mentions an amount without credit context must never be trusted.
    const hasCreditContext = hasCreditSubject || hasCreditBody;
    if (score < 50 || !amountMatch || (!hasCreditContext && !isCustomSender)) {
      return {
        isCandidate: false,
        rejectionReason: 'INSUFFICIENT_FINANCIAL_CREDIT_EVIDENCE',
        score
      };
    }

    // Extract fields
    const rawVal = amountMatch[1] || amountMatch[2] || '';
    const amountStr = rawVal.replace(/,/g, '');
    const amountNum = parseFloat(amountStr);
    const amountPaise = !isNaN(amountNum) && amountNum > 0 ? Math.round(amountNum * 100) : undefined;

    return {
      isCandidate: true,
      score,
      extracted: {
        amountPaise,
        amountRupees: amountStr,
        utr: utrMatch && utrMatch[1] ? utrMatch[1].trim() : undefined,
        accountIdentifier: accountMatch && accountMatch[1] ? accountMatch[1].trim() : undefined,
        bankName: this.KNOWN_BANK_PATTERNS.find((p) => p.senderDomains.some((d) => sender.includes(d)))?.name
      }
    };
  }

  /**
   * Determines if text represents a debit transaction.
   */
  private static detectDebit(subject: string, bodyText: string): boolean {
    const combined = `${subject} ${bodyText}`.toLowerCase();

    // Explicit structured labels take highest precedence
    if (combined.includes('transaction type: credit') || combined.includes('type: credit')) {
      return false;
    }
    if (combined.includes('transaction type: debit') || combined.includes('type: debit')) {
      return true;
    }

    // Phrases that clearly indicate money going out
    const debitKeywords = [
      'has been debited',
      'debited from',
      'debited with',
      'sent to',
      'paid to',
      'transferred to',
      'withdrawn from',
      'spent on',
      'purchase of',
      'payment sent'
    ];

    const creditKeywords = [
      'has been credited',
      'credited to',
      'credited with',
      'received from',
      'deposited into',
      'added to'
    ];

    const hasDebit = debitKeywords.some((kw) => combined.includes(kw));
    const hasCredit = creditKeywords.some((kw) => combined.includes(kw));

    // If both appear (e.g. "Amount debited from X and credited to Y"), check target context
    if (hasDebit && hasCredit) {
      if (combined.includes('credited to your') || combined.includes('credited to a/c')) {
        return false;
      }
      if (combined.includes('debited from your') || combined.includes('debited from a/c')) {
        return true;
      }
    }

    return hasDebit && !hasCredit;
  }
}
