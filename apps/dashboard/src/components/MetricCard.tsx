import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string;
  change?: string;
  isPositive?: boolean;
  icon: LucideIcon;
  subtext?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  change,
  isPositive,
  icon: Icon,
  subtext
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-all shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-400">{title}</p>
        <div className="h-8 w-8 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3">
        <h3 className="text-2xl font-bold tracking-tight text-white">{value}</h3>
      </div>
      <div className="mt-2 flex items-center space-x-2 text-xs">
        {change && (
          <span className={`font-semibold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isPositive ? '↑' : '↓'} {change}
          </span>
        )}
        {subtext && <span className="text-slate-400">{subtext}</span>}
      </div>
    </div>
  );
};
