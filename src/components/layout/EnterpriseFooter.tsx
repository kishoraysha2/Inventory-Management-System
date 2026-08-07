import React from 'react';
import { Shield, Activity, Database, DollarSign, Clock } from 'lucide-react';
import { UserRole } from '../../hooks/usePermission';

interface EnterpriseFooterProps {
  userRole: UserRole;
  userEmail?: string | null;
}

export default function EnterpriseFooter({ userRole, userEmail }: EnterpriseFooterProps) {
  return (
    <footer className="print:hidden border-t border-slate-200/80 bg-white px-4 sm:px-6 py-2 text-slate-500 text-xs shadow-2xs">
      <div className="flex items-center justify-between gap-2 text-[11px] font-medium">
        <div className="flex items-center gap-2.5 text-slate-600">
          <span className="flex items-center gap-1.5 text-emerald-700 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Ready</span>
          </span>
          <span className="text-slate-300">|</span>
          <span>Storage: <strong className="text-slate-800">Firestore</strong></span>
          <span className="text-slate-300 hidden sm:inline">|</span>
          <span className="hidden sm:inline">Clearance: <strong className="text-slate-800 capitalize">{userRole}</strong></span>
        </div>

        <div className="flex items-center gap-2.5 text-slate-500 font-mono text-[11px]">
          <span>USD ($)</span>
          <span className="text-slate-300">|</span>
          <span className="font-bold text-slate-700">v4.2.1</span>
        </div>
      </div>
    </footer>
  );
}
