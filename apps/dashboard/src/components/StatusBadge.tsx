import React from 'react';

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const upper = (status || '').toUpperCase();

  let colorClasses = 'bg-slate-800 text-slate-300 border-slate-700';

  if (['SUCCESS', 'CAPTURED', 'APPROVED', 'SETTLED', 'ACTIVE', 'PAID', 'MATCHED'].includes(upper)) {
    colorClasses = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  } else if (['FAILED', 'REJECTED', 'CANCELLED', 'LOST', 'DISCREPANCY'].includes(upper)) {
    colorClasses = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  } else if (['PENDING', 'PROCESSING', 'ATTEMPTED', 'UNDER_REVIEW', 'OPEN'].includes(upper)) {
    colorClasses = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  } else if (['REFUNDED', 'PARTIALLY_REFUNDED', 'PROCESSED'].includes(upper)) {
    colorClasses = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
  } else if (['EXPIRED', 'DEACTIVATED'].includes(upper)) {
    colorClasses = 'bg-slate-700/40 text-slate-400 border-slate-600/30';
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${colorClasses}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current mr-1.5 opacity-80"></span>
      {upper.replace(/_/g, ' ')}
    </span>
  );
};
