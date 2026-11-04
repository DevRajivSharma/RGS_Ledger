import React from 'react';
import { Bell, Search, LogOut, User as UserIcon } from 'lucide-react';

interface HeaderProps {
  userEmail?: string;
  userName?: string;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  userEmail = 'merchant@acmestore.in',
  userName = 'Vikram Aditya',
  onLogout
}) => {
  return (
    <header className="h-16 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-8 flex items-center justify-between sticky top-0 z-20">
      {/* Search Input */}
      <div className="relative w-96">
        <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search transactions, orders, customers (Ctrl+K)..."
          className="w-full bg-slate-950/60 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      {/* User Actions */}
      <div className="flex items-center space-x-4">
        {/* Notifications */}
        <button className="h-9 w-9 rounded-lg bg-slate-800/80 hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors relative">
          <Bell className="h-4 w-4" />
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-blue-500"></span>
        </button>

        {/* User Profile Pill */}
        <div className="flex items-center space-x-3 pl-3 border-l border-slate-800">
          <div className="h-8 w-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xs">
            {userName.charAt(0)}
          </div>
          <div className="text-left hidden md:block">
            <p className="text-xs font-semibold text-slate-200 leading-tight">{userName}</p>
            <p className="text-[10px] text-slate-400 leading-tight truncate max-w-[140px]">{userEmail}</p>
          </div>
          <button
            onClick={onLogout}
            title="Log out"
            className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
