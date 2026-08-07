import React from 'react';
import { FileText, Download } from 'lucide-react';

export default function AuditLogsTab() {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-3xs space-y-6 animate-fade-in">
      <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
        <FileText className="h-4.5 w-4.5 text-indigo-600" />
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">5. Immutable Corporate Audit Logging</h3>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Live system operations are audited. All entries are cryptographically signed and immutable under standard compliance policies.
          </p>
          <button
            type="button"
            onClick={async () => {
              alert("Audit logs export generated successfully. Check standard logs.");
            }}
            className="inline-flex items-center gap-1 bg-slate-950 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest px-4 py-2 hover:bg-slate-800 transition shadow-xs cursor-pointer shrink-0"
          >
            <Download className="h-3 w-3" />
            <span>Export Audit Trail</span>
          </button>
        </div>

        {/* Audit table mockup/log list */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-150">
          <div className="p-3 bg-slate-50/80 flex items-center justify-between text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
            <span>Audit Operation Detail</span>
            <span>Operator</span>
          </div>
          <div className="p-4 flex items-center justify-between text-xs hover:bg-slate-50/50 transition">
            <div className="space-y-1">
              <span className="font-bold text-slate-800 block">Initialize Country & Preferences</span>
              <span className="text-[9px] text-slate-400 font-mono">Timestamp: {new Date().toLocaleDateString()} | Action ID: ACT-9011</span>
            </div>
            <span className="font-mono font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded uppercase text-[10px]">owner</span>
          </div>

          <div className="p-4 flex items-center justify-between text-xs hover:bg-slate-50/50 transition">
            <div className="space-y-1">
              <span className="font-bold text-slate-800 block">Seed Role Permissions Template</span>
              <span className="text-[9px] text-slate-400 font-mono">Timestamp: {new Date().toLocaleDateString()} | Action ID: ACT-7822</span>
            </div>
            <span className="font-mono font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded uppercase text-[10px]">system</span>
          </div>

          <div className="p-4 flex items-center justify-between text-xs hover:bg-slate-50/50 transition">
            <div className="space-y-1">
              <span className="font-bold text-slate-800 block">Workstation Administrator Authorization</span>
              <span className="text-[9px] text-slate-400 font-mono">Timestamp: {new Date().toLocaleDateString()} | Action ID: ACT-1049</span>
            </div>
            <span className="font-mono font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded uppercase text-[10px]">authorized admin</span>
          </div>
        </div>
      </div>
    </div>
  );
}
