import React, { useEffect, useState } from 'react';
import { ShieldCheck, Building2, Landmark, FileText, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { apiRequest } from '../services/api';

export const KycPage: React.FC = () => {
  const [kycData, setKycData] = useState<any>(null);
  const [panNumber, setPanNumber] = useState('AAACA1234F');
  const [gstin, setGstin] = useState('27AAACA1234F1Z5');
  const [bankAccount, setBankAccount] = useState({
    accountNumber: '918237461928',
    ifscCode: 'HDFC0001234',
    accountHolderName: 'Acme Retail Technologies Pvt Ltd',
    bankName: 'HDFC Bank'
  });
  const [address, setAddress] = useState({
    line1: 'Tower 4, FinTech Cyber Hub',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560100',
    country: 'IN'
  });
  const [submitting, setSubmitting] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    async function loadKyc() {
      const res = await apiRequest('/merchants/me');
      if (res.success && res.data) {
        setKycData(res.data);
        if (res.data.panNumber) setPanNumber(res.data.panNumber);
        if (res.data.gstin) setGstin(res.data.gstin);
        if (res.data.bankAccount) setBankAccount(res.data.bankAccount);
        if (res.data.address) setAddress(res.data.address);
      }
    }
    loadKyc();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSavedSuccess(false);

    const res = await apiRequest('/merchants/kyc', {
      method: 'POST',
      body: JSON.stringify({
        businessName: kycData?.businessName || 'Acme Store',
        businessType: kycData?.businessType || 'PROPRIETORSHIP',
        panNumber,
        gstin,
        bankAccount,
        address
      })
    });

    setSubmitting(false);
    if (res.success) {
      setSavedSuccess(true);
      setKycData(res.data);
      setTimeout(() => setSavedSuccess(false), 3000);
    }
  };

  const isApproved = kycData?.kycStatus === 'APPROVED';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight">KYC & Compliance Verification</h2>
        <p className="text-xs text-slate-400 mt-1">
          RBI compliance verification, merchant business documentation, and bank account settlement setup.
        </p>
      </div>

      {/* Status Alert Banner */}
      <div className={`p-5 rounded-2xl border flex items-center justify-between ${
        isApproved
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
          : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
      }`}>
        <div className="flex items-center space-x-3">
          {isApproved ? <CheckCircle2 className="h-6 w-6 text-emerald-400" /> : <Clock className="h-6 w-6 text-amber-400" />}
          <div>
            <h4 className="font-bold text-sm text-white">
              {isApproved ? 'KYC Status: Verified & Approved' : 'KYC Status: Under Verification'}
            </h4>
            <p className="text-xs opacity-90 mt-0.5">
              {isApproved
                ? 'Your business profile is fully verified for standard settlement payouts and API transactions.'
                : 'Your documentation is undergoing administrative compliance review. Sandbox transactions remain operational.'}
            </p>
          </div>
        </div>
        <span className="text-xs font-mono font-bold uppercase px-3 py-1 rounded-full bg-slate-900 border border-slate-800">
          {kycData?.kycStatus || 'NOT_STARTED'}
        </span>
      </div>

      {/* KYC Steps Tracker */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center space-x-3">
          <div className="h-8 w-8 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs">
            ✓
          </div>
          <div>
            <p className="text-xs font-bold text-white">Account Created</p>
            <p className="text-[10px] text-slate-400">Identity verified</p>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center space-x-3">
          <div className="h-8 w-8 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs">
            ✓
          </div>
          <div>
            <p className="text-xs font-bold text-white">Email Verified</p>
            <p className="text-[10px] text-slate-400">Ownership confirmed</p>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center space-x-3">
          <div className="h-8 w-8 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center text-xs">
            3
          </div>
          <div>
            <p className="text-xs font-bold text-white">Business Information</p>
            <p className="text-[10px] text-slate-400">PAN & Bank account</p>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center space-x-3">
          <div className={`h-8 w-8 rounded-full font-bold flex items-center justify-center text-xs ${
            isApproved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
          }`}>
            {isApproved ? '✓' : '4'}
          </div>
          <div>
            <p className="text-xs font-bold text-white">Compliance Approval</p>
            <p className="text-[10px] text-slate-400">{isApproved ? 'Approved' : 'Pending review'}</p>
          </div>
        </div>
      </div>

      {/* KYC Form */}
      <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
        <h3 className="text-base font-bold text-white border-b border-slate-800 pb-3 flex items-center space-x-2">
          <Building2 className="h-4 w-4 text-blue-400" />
          <span>Business & Tax Information</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-300">Permanent Account Number (PAN)</label>
            <input
              type="text"
              required
              value={panNumber}
              onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
              placeholder="AAACA1234F"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white uppercase font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300">GSTIN Identification Number</label>
            <input
              type="text"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="27AAACA1234F1Z5"
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white uppercase font-mono focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <h3 className="text-base font-bold text-white border-b border-slate-800 pb-3 pt-2 flex items-center space-x-2">
          <Landmark className="h-4 w-4 text-blue-400" />
          <span>Registered Settlement Bank Account</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-300">Bank Account Number</label>
            <input
              type="text"
              required
              value={bankAccount.accountNumber}
              onChange={(e) => setBankAccount({ ...bankAccount, accountNumber: e.target.value })}
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300">Bank IFSC Code</label>
            <input
              type="text"
              required
              value={bankAccount.ifscCode}
              onChange={(e) => setBankAccount({ ...bankAccount, ifscCode: e.target.value.toUpperCase() })}
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white uppercase font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300">Account Holder Name</label>
            <input
              type="text"
              required
              value={bankAccount.accountHolderName}
              onChange={(e) => setBankAccount({ ...bankAccount, accountHolderName: e.target.value })}
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300">Bank Name</label>
            <input
              type="text"
              required
              value={bankAccount.bankName}
              onChange={(e) => setBankAccount({ ...bankAccount, bankName: e.target.value })}
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <h3 className="text-base font-bold text-white border-b border-slate-800 pb-3 pt-2">
          Registered Physical Address
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-3">
            <label className="text-xs font-medium text-slate-300">Address Line 1</label>
            <input
              type="text"
              required
              value={address.line1}
              onChange={(e) => setAddress({ ...address, line1: e.target.value })}
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300">City</label>
            <input
              type="text"
              required
              value={address.city}
              onChange={(e) => setAddress({ ...address, city: e.target.value })}
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300">State</label>
            <input
              type="text"
              required
              value={address.state}
              onChange={(e) => setAddress({ ...address, state: e.target.value })}
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300">PIN Code</label>
            <input
              type="text"
              required
              value={address.pincode}
              onChange={(e) => setAddress({ ...address, pincode: e.target.value })}
              className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          {savedSuccess && (
            <span className="text-xs font-semibold text-emerald-400">
              ✓ Information saved & submitted for compliance review!
            </span>
          )}
          <div className="ml-auto">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Update KYC Information'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
