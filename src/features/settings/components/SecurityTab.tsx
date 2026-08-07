import React from 'react';
import { Lock } from 'lucide-react';

export default function SecurityTab() {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-3xs space-y-6 animate-fade-in">
      <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
        <Lock className="h-4.5 w-4.5 text-indigo-600" />
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">4. Security & Intrusion Protections</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="border border-slate-200 rounded-2xl p-5 space-y-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">Multi-Factor Authentication (MFA)</h4>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Identity validation enforced via secondary authenticator tokens. Required for Owner and Administrator clearances.
          </p>
          <span className="inline-flex text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-150 px-2 py-0.5 rounded-full">ACTIVE FOR OWNERS</span>
        </div>

        <div className="border border-slate-200 rounded-2xl p-5 space-y-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">Secure Session Auto-Timeout</h4>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Automatically sign out inactive sessions after 15 minutes of inactivity to protect workstations in open areas.
          </p>
          <span className="inline-flex text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-150 px-2 py-0.5 rounded-full">SET TO 15 MINS</span>
        </div>

        <div className="border border-slate-200 rounded-2xl p-5 space-y-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">Allowed Corporate IP Whitelisting</h4>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Restrict corporate login scopes exclusively to approved subnet blocks and headquarters office locations.
          </p>
          <span className="inline-flex text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-150 px-2 py-0.5 rounded-full">ALL IPS ENABLED</span>
        </div>

        <div className="border border-slate-200 rounded-2xl p-5 space-y-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-400"></span>
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide">OAuth Identity Proxy Tunnel</h4>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Google single sign-on mapping for active staff. Restricts credentials exposure and mitigates brute force vectors.
          </p>
          <span className="inline-flex text-[9px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">OAUTH ENABLED</span>
        </div>
      </div>
    </div>
  );
}
