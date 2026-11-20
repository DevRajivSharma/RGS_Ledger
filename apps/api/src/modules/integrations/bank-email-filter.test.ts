import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BankEmailCandidateFilter } from './bank-email-filter.js';

describe('Phase 2B.1 — Bank Email Candidate Filtering & Template Verification', () => {
  test('rejects Indeed job recruitment and alert emails immediately', () => {
    const indeedResult = BankEmailCandidateFilter.evaluateCandidate({
      sender: 'jobalerts-noreply@indeed.com',
      subject: 'New software developer jobs in Bengaluru (INR 12,00,000 - 24,00,000)',
      bodyText: 'Indeed Job Alert: 15 new jobs match your search for Developer. Apply now with your resume.'
    });

    assert.strictEqual(indeedResult.isCandidate, false);
    assert.match(indeedResult.rejectionReason || '', /EXCLUDED_RECRUITMENT_OR_COMMERCE_DOMAIN/);
    assert.strictEqual(indeedResult.score < 0, true);
  });

  test('rejects Amazon order confirmation, delivery, and promotional emails', () => {
    const amazonOrder = BankEmailCandidateFilter.evaluateCandidate({
      sender: 'order-update@amazon.in',
      subject: 'Your Amazon.in order #402-1234567-8901234 has been dispatched',
      bodyText: 'Total: Rs. 1,499.00. Payment received via UPI. Package arriving tomorrow by 9 PM.'
    });

    assert.strictEqual(amazonOrder.isCandidate, false);
    assert.match(amazonOrder.rejectionReason || '', /EXCLUDED_RECRUITMENT_OR_COMMERCE_DOMAIN/);

    const amazonPromo = BankEmailCandidateFilter.evaluateCandidate({
      sender: 'store-news@amazon.in',
      subject: 'Deals of the day: Save up to 50% on Electronics (INR 500 off)',
      bodyText: 'Check out the latest discounts and deals. Limited time offers.'
    });

    assert.strictEqual(amazonPromo.isCandidate, false);
  });

  test('detects genuine HDFC Bank credit email candidate with full extraction', () => {
    const result = BankEmailCandidateFilter.evaluateCandidate({
      sender: 'alerts@hdfcbank.net',
      subject: 'Credit Alert - INR 4,999.00 credited to account XX5678',
      bodyText: 'Dear Customer, INR 4,999.00 has been credited to your account XX5678 on 13-Nov-2026. Info: UPI-998877665544-JOHN DOE. UPI Ref: 998877665544.'
    });

    assert.strictEqual(result.isCandidate, true);
    assert.strictEqual(result.isDebit, undefined);
    assert.strictEqual(result.extracted?.amountPaise, 499900);
    assert.strictEqual(result.extracted?.amountRupees, '4999.00');
    assert.strictEqual(result.extracted?.utr, '998877665544');
    assert.strictEqual(result.extracted?.accountIdentifier, '5678');
    assert.strictEqual(result.extracted?.bankName, 'HDFC Bank');
  });

  test('preserves genuine bank credit notification even when UTR is absent', () => {
    const result = BankEmailCandidateFilter.evaluateCandidate({
      sender: 'alerts@icicibank.com',
      subject: 'Account update: Deposit received',
      bodyText: 'Dear Customer, your account ending with 1234 has been credited with Rs. 750.00 on 13-Nov-2026. Available balance is updated.'
    });

    assert.strictEqual(result.isCandidate, true);
    assert.strictEqual(result.extracted?.amountPaise, 75000);
    assert.strictEqual(result.extracted?.amountRupees, '750.00');
    assert.strictEqual(result.extracted?.utr, undefined); // No UTR present, but candidate preserved!
    assert.strictEqual(result.extracted?.accountIdentifier, '1234');
  });

  test('classifies debit notification accurately and marks isDebit=true', () => {
    const result = BankEmailCandidateFilter.evaluateCandidate({
      sender: 'alerts@axisbank.com',
      subject: 'Transaction Alert: INR 1,200.00 debited',
      bodyText: 'Dear Customer, your account ending 4321 has been debited by INR 1,200.00 for payment at Merchant Store. UPI Ref 123123123123.'
    });

    assert.strictEqual(result.isCandidate, false);
    assert.strictEqual(result.isDebit, true);
    assert.strictEqual(result.rejectionReason, 'DEBIT_TRANSACTION_IGNORED');
  });

  test('handles unknown sender with high financial scoring (credit alert from cooperative bank)', () => {
    const result = BankEmailCandidateFilter.evaluateCandidate({
      sender: 'notifications@saraswatbank.in',
      subject: 'Credit Alert: Payment received via UPI',
      bodyText: 'Your account XXXXXX9876 has been credited with INR 3,500.00 on 13-11-2026. UPI Ref: 332211445566.'
    });

    // Score from credit subject + credit body + amount + UTR allows candidate acceptance even if not in default hardcoded list
    assert.strictEqual(result.isCandidate, true);
    assert.strictEqual(result.extracted?.amountPaise, 350000);
    assert.strictEqual(result.extracted?.utr, '332211445566');
  });

  test('rejects malformed email content with no amount or financial wording', () => {
    const result = BankEmailCandidateFilter.evaluateCandidate({
      sender: 'support@bank.com',
      subject: 'System maintenance scheduled for Sunday',
      bodyText: 'Our online banking portals will be briefly unavailable from 2:00 AM to 4:00 AM for maintenance.'
    });

    assert.strictEqual(result.isCandidate, false);
    assert.strictEqual(result.rejectionReason, 'INSUFFICIENT_FINANCIAL_CREDIT_EVIDENCE');
  });

  test('respects merchant custom template sender identifiers', () => {
    const customResult = BankEmailCandidateFilter.evaluateCandidate({
      sender: 'custom-pay@regionalfintech.org',
      subject: 'Payment credit notification',
      bodyText: 'Amount ₹10,000.00 credited to account 778899. Reference: 554433221100.',
      customSenderIdentifiers: ['custom-pay@regionalfintech.org']
    });

    assert.strictEqual(customResult.isCandidate, true);
    assert.strictEqual(customResult.extracted?.amountPaise, 1000000);
    assert.strictEqual(customResult.extracted?.utr, '554433221100');
  });
});
