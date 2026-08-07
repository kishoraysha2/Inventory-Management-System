import React from 'react';
import { Shield } from 'lucide-react';
import PrivilegeMatrix from '../../../components/PrivilegeMatrix';
import { UserRole } from '../../../hooks/usePermission';

interface UsersRolesTabProps {
  userRole: UserRole | string;
}

export default function UsersRolesTab({ userRole }: UsersRolesTabProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-3xs space-y-6 animate-fade-in">
      <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
        <Shield className="h-4.5 w-4.5 text-indigo-600" />
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">3. Users & Privilege Clearance Matrix</h3>
      </div>
      
      <p className="text-xs text-slate-500 leading-normal">
        Configure role access levels across core ERP modules. The matrix updates local authorization constraints dynamically.
      </p>

      {/* RENDER THE REUSABLE PRIVILEGE MATRIX COMPONENT */}
      <div id="settings-privilege-matrix" className="border border-slate-150 rounded-2xl p-1 bg-slate-50/30">
        <PrivilegeMatrix currentUserRole={userRole as UserRole} />
      </div>
    </div>
  );
}
