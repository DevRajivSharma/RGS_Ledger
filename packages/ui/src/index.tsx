import React from 'react';
import { PaymentStatus } from '@rgs-ledger/shared-types';

/**
 * Visual badge for Payment Status
 */
export const StatusBadge: React.FC<{ status: PaymentStatus }> = ({ status }) => {
  const styles: Record<PaymentStatus, string> = {
    [PaymentStatus.PENDING]: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    [PaymentStatus.PARTIAL_SUCCESS]: 'bg-blue-100 text-blue-800 border-blue-300',
    [PaymentStatus.SUCCESS]: 'bg-green-100 text-green-800 border-green-300',
    [PaymentStatus.REVIEW_REQUIRED]: 'bg-amber-100 text-amber-900 border-amber-400',
    [PaymentStatus.EXPIRED]: 'bg-gray-100 text-gray-700 border-gray-300',
    [PaymentStatus.CANCELLED]: 'bg-rose-100 text-rose-800 border-rose-300',
    [PaymentStatus.RECONCILIATION_REQUIRED]: 'bg-red-100 text-red-800 border-red-300',
  };

  const labels: Record<PaymentStatus, string> = {
    [PaymentStatus.PENDING]: 'Pending Payment',
    [PaymentStatus.PARTIAL_SUCCESS]: 'Partial Success (1 Evidence)',
    [PaymentStatus.SUCCESS]: 'Verified Success (Dual-Source)',
    [PaymentStatus.REVIEW_REQUIRED]: 'Review Required',
    [PaymentStatus.EXPIRED]: 'Expired',
    [PaymentStatus.CANCELLED]: 'Cancelled',
    [PaymentStatus.RECONCILIATION_REQUIRED]: 'Reconciliation Required',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles[status]}`}>
      {labels[status]}
    </span>
  );
};

/**
 * Dual-Source Evidence Indicator
 */
export interface DualSourceIndicatorProps {
  hasEmail: boolean;
  hasAndroid: boolean;
}

export const DualSourceIndicator: React.FC<DualSourceIndicatorProps> = ({ hasEmail, hasAndroid }) => {
  return (
    <div className="flex items-center space-x-3 text-xs font-medium">
      <div className={`flex items-center space-x-1 ${hasEmail ? 'text-green-600' : 'text-gray-400'}`}>
        <span>●</span>
        <span>Email Evidence: {hasEmail ? 'Verified' : 'Pending'}</span>
      </div>
      <div className={`flex items-center space-x-1 ${hasAndroid ? 'text-green-600' : 'text-gray-400'}`}>
        <span>●</span>
        <span>Android Evidence: {hasAndroid ? 'Verified' : 'Pending'}</span>
      </div>
    </div>
  );
};

/**
 * Mandatory Fintech Non-Custodial Disclosure Banner
 */
export const NonCustodialDisclosureBanner: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <aside
      aria-label="Payment Disclaimers"
      className={`p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 ${className}`}
    >
      <p className="font-semibold mb-1">Fintech Architecture Notice:</p>
      <p>
        RGS Ledger is a non-custodial UPI payment evidence matching platform. Funds transfer directly
        from the payer to the merchant&apos;s configured UPI ID. RGS Ledger does not hold funds, maintain wallets,
        or provide bank settlement. &apos;SUCCESS&apos; indicates that dual-source evidence policy rules were fulfilled,
        not a direct bank-authoritative confirmation.
      </p>
    </aside>
  );
};
