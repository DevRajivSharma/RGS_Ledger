import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  ShoppingBag,
  Users,
  Link2,
  RotateCcw,
  Landmark,
  FileCheck2,
  KeyRound,
  Webhook,
  ShieldCheck,
  Settings,
  ShieldAlert,
  Code2
} from 'lucide-react';

interface SidebarProps {
  businessName?: string;
  isSandbox?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  businessName = 'Acme Store',
  isSandbox = true
}) => {
  const navItems = [
    { name: 'Overview', path: '/', icon: LayoutDashboard },
    { name: 'Transactions', path: '/transactions', icon: ArrowLeftRight },
    { name: 'Orders', path: '/orders', icon: ShoppingBag },
    { name: 'Customers', path: '/customers', icon: Users },
    { name: 'Payment Links', path: '/payment-links', icon: Link2 },
    { name: 'Refunds', path: '/refunds', icon: RotateCcw },
    { name: 'Settlements', path: '/settlements', icon: Landmark },
    { name: 'Reconciliation', path: '/reconciliation', icon: FileCheck2 },
    { name: 'API Keys', path: '/api-keys', icon: KeyRound },
    { name: 'Webhooks', path: '/webhooks', icon: Webhook },
    { name: 'KYC & Compliance', path: '/kyc', icon: ShieldCheck },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen fixed left-0 top-0 z-30">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-9 w-9 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
            RL
          </div>
          <div>
            <h1 className="font-extrabold text-base tracking-tight text-white">RGS Ledger</h1>
            <p className="text-xs text-slate-400 font-medium truncate max-w-[120px]">{businessName}</p>
          </div>
        </div>
      </div>

      {/* Environment Mode Indicator */}
      <div className="px-5 py-3">
        <div className={`px-3 py-1.5 rounded-md flex items-center justify-between text-xs font-semibold ${
          isSandbox ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
        }`}>
          <span className="flex items-center space-x-1.5">
            <span className={`h-2 w-2 rounded-full ${isSandbox ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`}></span>
            <span>{isSandbox ? 'TEST SANDBOX' : 'LIVE PRODUCTION'}</span>
          </span>
          <span className="text-[10px] opacity-75 font-mono">v1.0</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.name}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Developer Portal Quick Link */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/50">
        <a
          href="http://localhost:5175"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-xs text-slate-300 font-medium border border-slate-700/50 transition-colors"
        >
          <span className="flex items-center space-x-2">
            <Code2 className="h-4 w-4 text-blue-400" />
            <span>Developer Portal</span>
          </span>
          <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded">Docs</span>
        </a>
      </div>
    </aside>
  );
};
