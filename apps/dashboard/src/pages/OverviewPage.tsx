import React, { useEffect, useState } from 'react';
import {
  IndianRupee,
  CreditCard,
  CheckCircle2,
  XCircle,
  TrendingUp,
  ArrowUpRight
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { MetricCard } from '../components/MetricCard';
import { StatusBadge } from '../components/StatusBadge';
import { apiRequest } from '../services/api';
import { formatCurrency } from '@rgs-ledger/shared';
import { Link } from 'react-router-dom';

const METHOD_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6'];

export const OverviewPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const res = await apiRequest('/reports/overview');
      if (res.success && res.data) {
        setData(res.data);
      }
      setLoading(false);
    }
    loadData();
  }, []);

  const kpis = data?.kpis || {
    grossCapturedPaise: 0,
    totalOrders: 0,
    successfulCount: 0,
    failedCount: 0,
    successRate: 0,
    averageTransactionPaise: 0
  };

  const chartData = data?.dailyVolume?.map((d: any) => ({
    date: d.date.slice(5),
    volume: d.volumePaise / 100
  })) || [];

  const pieData = data?.methodDistribution?.map((m: any) => ({
    name: m.method.replace('_', ' '),
    value: m.count
  })) || [];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">Merchant Overview</h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time financial metrics, payment volume, and transaction velocity.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            to="/orders"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-500/20 transition-all flex items-center space-x-1.5"
          >
            <span>+ Create Order</span>
          </Link>
          <Link
            to="/payment-links"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-all"
          >
            <span>+ Payment Link</span>
          </Link>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Gross Captured Volume"
          value={formatCurrency(kpis.grossCapturedPaise, 'INR')}
          change="12.4%"
          isPositive={true}
          icon={IndianRupee}
          subtext="vs last 7 days"
        />
        <MetricCard
          title="Total Orders"
          value={kpis.totalOrders.toString()}
          change="8.1%"
          isPositive={true}
          icon={CreditCard}
          subtext="total payment attempts"
        />
        <MetricCard
          title="Payment Success Rate"
          value={`${kpis.successRate}%`}
          change="2.3%"
          isPositive={kpis.successRate >= 80}
          icon={CheckCircle2}
          subtext={`${kpis.successfulCount} success / ${kpis.failedCount} failed`}
        />
        <MetricCard
          title="Average Ticket Size"
          value={formatCurrency(kpis.averageTransactionPaise, 'INR')}
          icon={TrendingUp}
          subtext="per successful capture"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Volume Area Chart */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white">Daily Payment Volume (₹)</h3>
              <p className="text-xs text-slate-400">Captured volume over the last 7 days</p>
            </div>
            <span className="text-[11px] font-semibold text-blue-400 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">
              Live Feed
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="volumeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#64748B" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="volume" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#volumeGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Methods Distribution */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Payment Method Share</h3>
            <p className="text-xs text-slate-400">Breakdown by customer checkout choice</p>
          </div>

          <div className="h-48 w-full flex items-center justify-center my-2">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={4}>
                    {pieData.map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={METHOD_COLORS[index % METHOD_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0F172A', borderColor: '#334155', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-slate-500">No payment method data yet</div>
            )}
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-800">
            {pieData.map((item: any, i: number) => (
              <div key={item.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center space-x-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: METHOD_COLORS[i % METHOD_COLORS.length] }}></span>
                  <span className="text-slate-300">{item.name}</span>
                </span>
                <span className="font-semibold text-white">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Recent Transactions</h3>
            <p className="text-xs text-slate-400">Latest settled and captured payments</p>
          </div>
          <Link to="/transactions" className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center space-x-1">
            <span>View All</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/50 border-b border-slate-800 text-slate-400 font-semibold">
                <th className="py-3 px-4">Payment ID</th>
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data?.recentTransactions && data.recentTransactions.length > 0 ? (
                data.recentTransactions.map((tx: any) => (
                  <tr key={tx.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-blue-400 font-medium">{tx.id}</td>
                    <td className="py-3 px-4 font-mono text-slate-300">{tx.orderId}</td>
                    <td className="py-3 px-4 font-bold text-white">{formatCurrency(tx.amount, tx.currency)}</td>
                    <td className="py-3 px-4 text-slate-300 font-medium">{tx.method}</td>
                    <td className="py-3 px-4">
                      <StatusBadge status={tx.status} />
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No transactions recorded yet. Create an order or test checkout to see live records.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
