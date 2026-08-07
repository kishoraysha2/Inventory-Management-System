import React from 'react';
import { 
  CloudLightning,
  Sparkles,
  Download,
  Upload,
  History,
  Layers,
  FileJson,
  FileArchive,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  AlertTriangle,
  Trash2,
  Lock
} from 'lucide-react';

interface BackupRestoreTabProps {
  backupWorkspaceTab: 'backup_center' | 'restore_center' | 'history';
  setBackupWorkspaceTab: (val: 'backup_center' | 'restore_center' | 'history') => void;
  backupStatus: 'idle' | 'scanning' | 'exporting' | 'completed' | 'error';
  backupProgress: number;
  backupStats: { totalCollections: number; totalDocuments: number; estimatedSizeKB: number };
  collectionDetails: Record<string, number>;
  backupLogs: string[];
  lastBackupTime: string | null;
  handleExportBackup: () => Promise<void>;
  scanDatabase: () => Promise<void>;
  BACKUP_MODULE_GROUPS: any[];
  handleExportModuleBackup: (modId: string) => Promise<void>;
  
  // Restore state
  restoreFile: File | null;
  restoreBackupMeta: any;
  restoreProgress: number;
  restoreStatus: 'idle' | 'parsing' | 'preview' | 'restoring' | 'verifying' | 'completed' | 'error';
  restoreLogs: string[];
  restoreSelectedModules: Record<string, boolean>;
  setRestoreSelectedModules: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  restoreDuplicateStrategy: 'skip' | 'replace' | 'merge' | 'rename';
  setRestoreDuplicateStrategy: (val: 'skip' | 'replace' | 'merge' | 'rename') => void;
  restoreMode: 'merge' | 'replace';
  setRestoreMode: (val: 'merge' | 'replace') => void;
  restoreConfirmationText: string;
  setRestoreConfirmationText: (val: string) => void;
  restoreDependencyStatus: { checked: boolean; satisfied: boolean; missingDeps: string[] };
  handleRestoreFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleExecuteRestore: () => Promise<void>;
  handleClearRestore: () => void;
  
  // History logs
  historyLogs: any[];
  setHistoryLogs: React.Dispatch<React.SetStateAction<any[]>>;
}

export default function BackupRestoreTab({
  backupWorkspaceTab,
  setBackupWorkspaceTab,
  backupStatus,
  backupProgress,
  backupStats,
  collectionDetails,
  backupLogs,
  lastBackupTime,
  handleExportBackup,
  scanDatabase,
  BACKUP_MODULE_GROUPS,
  handleExportModuleBackup,
  restoreFile,
  restoreBackupMeta,
  restoreProgress,
  restoreStatus,
  restoreLogs,
  restoreSelectedModules,
  setRestoreSelectedModules,
  restoreDuplicateStrategy,
  setRestoreDuplicateStrategy,
  restoreMode,
  setRestoreMode,
  restoreConfirmationText,
  setRestoreConfirmationText,
  restoreDependencyStatus,
  handleRestoreFileSelected,
  handleExecuteRestore,
  handleClearRestore,
  historyLogs,
  setHistoryLogs
}: BackupRestoreTabProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* INTRO HERO GRID */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 shadow-md border border-slate-700/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <CloudLightning className="w-48 h-48 text-indigo-400 animate-pulse" />
        </div>
        <div className="max-w-xl space-y-3 relative z-10">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-550/25 border border-indigo-400/30 text-[10px] font-black uppercase tracking-widest text-indigo-300">
            <Sparkles className="h-3 w-3" />
            Enterprise Snapshot Engine
          </span>
          <h3 className="text-lg font-black tracking-tight text-white uppercase">Vault & Disaster Recovery Center</h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Perform full cloud ledger backups, module-specific exports, and secure checksum-validated restore routines. All recovery processes execute with atomic precision to guard data integrity.
          </p>
        </div>
      </div>

      {/* THREE-WAY SUB-TAB NAVIGATION */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setBackupWorkspaceTab('backup_center')}
          className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition cursor-pointer flex items-center gap-2 ${
            backupWorkspaceTab === 'backup_center'
              ? 'border-indigo-600 text-indigo-600 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Download className="h-4 w-4" />
          Backup Center
        </button>
        <button
          type="button"
          onClick={() => setBackupWorkspaceTab('restore_center')}
          className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition cursor-pointer flex items-center gap-2 ${
            backupWorkspaceTab === 'restore_center'
              ? 'border-indigo-600 text-indigo-600 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <Upload className="h-4 w-4" />
          Restore Center
        </button>
        <button
          type="button"
          onClick={() => setBackupWorkspaceTab('history')}
          className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition cursor-pointer flex items-center gap-2 ${
            backupWorkspaceTab === 'history'
              ? 'border-indigo-600 text-indigo-600 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          <History className="h-4 w-4" />
          Audit Log & History
        </button>
      </div>

      {/* SECTION 1: BACKUP CENTER */}
      {backupWorkspaceTab === 'backup_center' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* SNAPSHOT METRIC COUNTERS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center border border-indigo-100 shrink-0">
                <Layers className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Master Collections</span>
                <span className="text-xl font-black text-slate-900 tracking-tight">
                  {backupStatus === 'scanning' ? (
                    <span className="text-slate-300 animate-pulse">Checking...</span>
                  ) : (
                    `${backupStats.totalCollections} Active`
                  )}
                </span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs flex items-center gap-4">
              <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100 shrink-0">
                <FileJson className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Documents Counted</span>
                <span className="text-xl font-black text-slate-900 tracking-tight">
                  {backupStatus === 'scanning' ? (
                    <span className="text-slate-300 animate-pulse">Resolving...</span>
                  ) : (
                    backupStats.totalDocuments.toLocaleString()
                  )}
                </span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-3xs flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center border border-amber-100 shrink-0">
                <FileArchive className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Estimated Size</span>
                <span className="text-xl font-black text-slate-900 tracking-tight">
                  {backupStatus === 'scanning' ? (
                    <span className="text-slate-300 animate-pulse">Sizing...</span>
                  ) : (
                    `${backupStats.estimatedSizeKB.toFixed(2)} KB`
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* LEFT PANEL: FULL EXPORT AND TRACE */}
            <div className="lg:col-span-3 bg-white border border-slate-200 rounded-3xl p-6 shadow-3xs space-y-4">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Full System Backup</h3>
                {lastBackupTime && (
                  <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-150 px-2.5 py-0.5 rounded-full">
                    Download Success: {lastBackupTime}
                  </span>
                )}
              </div>

              {backupStatus === 'exporting' && (
                <div className="space-y-2 bg-slate-50 border border-slate-100 rounded-2xl p-4">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span>Streaming cloud records...</span>
                    <span>{backupProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-slate-900 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${backupProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {backupStatus === 'completed' && (
                <div className="bg-emerald-50 border border-emerald-150 rounded-2xl p-4 flex items-start gap-3 animate-fade-in">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-black text-emerald-800 uppercase tracking-wider">Snapshot Generated</h4>
                    <p className="text-[11px] text-emerald-700 mt-0.5 leading-relaxed">
                      All cloud records verified, wrapped, compressed and transferred locally with manifest.json checksum protection.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleExportBackup}
                  disabled={backupStatus === 'exporting' || backupStatus === 'scanning'}
                  className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-white px-5 py-3 transition cursor-pointer disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  <span>{backupStatus === 'exporting' ? 'Archiving...' : 'Download Full ZIP'}</span>
                </button>

                <button
                  type="button"
                  onClick={scanDatabase}
                  disabled={backupStatus === 'exporting' || backupStatus === 'scanning'}
                  className="flex items-center justify-center gap-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 px-5 py-3 transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 shrink-0 ${backupStatus === 'scanning' ? 'animate-spin' : ''}`} />
                  <span>Sync Ledger Stats</span>
                </button>
              </div>

              {/* Execution Terminal */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Backup Engine Live Logs</label>
                <div className="bg-slate-900 text-slate-200 rounded-2xl p-4 font-mono text-[9px] leading-relaxed h-[180px] overflow-y-auto space-y-1 shadow-inner scrollbar-thin">
                  {backupLogs.length === 0 ? (
                    <div className="text-slate-500 italic">No logs active. Start an operation to stream trace...</div>
                  ) : (
                    backupLogs.map((l, index) => (
                      <div key={index} className={
                        l.startsWith('SUCCESS') ? 'text-emerald-400 font-semibold' :
                        l.startsWith('WARNING') ? 'text-amber-400 font-semibold' :
                        l.startsWith('CRITICAL_ERROR') ? 'text-rose-400 font-black' :
                        'text-slate-300'
                      }>
                        <span className="text-slate-500 mr-2">[{new Date().toLocaleTimeString()}]</span>
                        {l}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT PANEL: MODULE BACKUP CENTER */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-3xs flex flex-col space-y-4">
              <div>
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Independent Module Exporter</h3>
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                  Extract standalone modules into individual JSON tables. Helpful for fast, atomic updates or transferring single components.
                </p>
              </div>

              <div className="flex-1 overflow-y-auto border border-slate-100 rounded-2xl p-3 max-h-[350px] space-y-4 scrollbar-thin">
                {BACKUP_MODULE_GROUPS.map(group => (
                  <div key={group.name} className="space-y-1.5">
                    <h4 className="text-[9px] font-black text-indigo-600 uppercase tracking-widest px-2.5 py-1 bg-indigo-550/5 rounded-lg">
                      {group.name}
                    </h4>
                    <div className="divide-y divide-slate-100">
                      {group.modules.map((mod: any) => {
                        const isSingleton = mod.id.includes('/');
                        const totalDocs = isSingleton ? 1 : (collectionDetails[mod.id] || 0);
                        return (
                          <div key={mod.id} className="py-2.5 px-1.5 flex items-center justify-between hover:bg-slate-50 transition rounded-xl">
                            <div className="space-y-0.5">
                              <span className="text-xs font-bold text-slate-800 tracking-tight block">
                                {mod.name}
                              </span>
                              <span className="text-[9px] text-slate-400 block font-mono">
                                {isSingleton ? 'singleton' : `${totalDocs} docs`} {mod.dependencies.length > 0 && `• deps: ${mod.dependencies.join(', ')}`}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleExportModuleBackup(mod.id)}
                              title={`Download ${mod.name} backup JSON`}
                              className="w-7 h-7 rounded-lg border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 text-slate-600 hover:text-indigo-600 transition flex items-center justify-center cursor-pointer"
                            >
                              <Download className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: RESTORE CENTER */}
      {backupWorkspaceTab === 'restore_center' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* WARNING DISCLOSURE CARD */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-black text-amber-800 uppercase tracking-wider">At-Risk Operations Disclaimer</h4>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                Data restoration directly overwrites or merges ledger documents. Active transactions or posting sequences could experience immediate jumps. <strong>Replace Mode</strong> is highly destructive and deletes all existing active records in the module before restoring.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* LEFT SECTION: RESTORE CONTROL & VERIFIER */}
            <div className="lg:col-span-3 bg-white border border-slate-200 rounded-3xl p-6 shadow-3xs space-y-5">
              
              {/* FILE UPLOAD DRAG AREA */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Choose Backup File (ZIP or JSON)</label>
                <div className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl p-6 text-center transition cursor-pointer relative group bg-slate-50/50">
                  <input
                    type="file"
                    accept=".zip,.json"
                    onChange={handleRestoreFileSelected}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 group-hover:scale-110 transition">
                      <Upload className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-700 block">
                        {restoreFile ? restoreFile.name : 'Click or Drag ZIP / JSON Backup file'}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        {restoreFile ? `${(restoreFile.size / 1024).toFixed(2)} KB` : 'Supports system generated ZIP full archives & module JSON files'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* RESTORE LIVE STATUS / PROGRESS */}
              {(restoreStatus === 'restoring' || restoreStatus === 'verifying' || restoreStatus === 'parsing') && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 animate-pulse">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                      {restoreStatus === 'parsing' ? 'Validating and reading file metadata...' :
                       restoreStatus === 'restoring' ? 'Writing documents to Firestore ledger...' :
                       'Verifying post-restore ledger integrity...'}
                    </span>
                    <span>{restoreProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${restoreProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* RESTORE FAILED ERROR BOX */}
              {restoreStatus === 'error' && (
                <div className="bg-rose-50 border border-rose-150 rounded-2xl p-4 flex items-start gap-3 text-rose-700 animate-fade-in">
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-rose-600" />
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider">Restoration Aborted Safely</h4>
                    <p className="text-[11px] text-rose-700 leading-relaxed mt-0.5">
                      The backup engine rejected execution. No document writes were committed.
                    </p>
                    <div className="mt-2 text-[9px] font-mono bg-rose-100 rounded p-2 text-rose-800 max-h-[80px] overflow-y-auto">
                      {restoreLogs[restoreLogs.length - 1] || 'Unknown verification error'}
                    </div>
                  </div>
                </div>
              )}

              {/* RESTORE COMPLETED SUCCESS BOX */}
              {restoreStatus === 'completed' && (
                <div className="bg-emerald-50 border border-emerald-150 rounded-2xl p-4 flex items-start gap-3 text-emerald-800 animate-fade-in">
                  <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-emerald-600" />
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider">Restoration Executed Successfully</h4>
                    <p className="text-[11px] text-emerald-700 leading-relaxed mt-0.5">
                      Ledger synchronization completed. Smart counter synchronization computed and verified.
                    </p>
                  </div>
                </div>
              )}

              {/* RESTORE ENGINE TRACE CONSOLE */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Restoration Live Trace Logs</label>
                <div className="bg-slate-900 text-slate-200 rounded-2xl p-4 font-mono text-[9px] leading-relaxed h-[180px] overflow-y-auto space-y-1 shadow-inner scrollbar-thin">
                  {restoreLogs.length === 0 ? (
                    <div className="text-slate-500 italic">Waiting for uploader streaming to output logs...</div>
                  ) : (
                    restoreLogs.map((l, index) => (
                      <div key={index} className={
                        l.startsWith('SUCCESS') ? 'text-emerald-400 font-semibold' :
                        l.startsWith('WARNING') ? 'text-amber-400 font-semibold' :
                        l.startsWith('CRITICAL_ERROR') ? 'text-rose-400 font-black' :
                        l.startsWith('ERROR') ? 'text-rose-400 font-bold' :
                        'text-slate-300'
                      }>
                        <span className="text-slate-500 mr-2">[{new Date().toLocaleTimeString()}]</span>
                        {l}
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

            {/* RIGHT SECTION: RESTORE PREVIEW & OPTIONS PANEL */}
            <div className="lg:col-span-2 space-y-4">
              
              {restoreBackupMeta ? (
                <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-3xs space-y-4 animate-fade-in">
                  <div className="pb-3 border-b border-slate-100">
                    {restoreBackupMeta.checksumValid ? (
                      <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        Checksum Validated
                      </span>
                    ) : (
                      <span className="text-[9px] font-black text-rose-600 bg-rose-50 border border-rose-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        Integrity Check Failed
                      </span>
                    )}
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider mt-2">
                      {restoreBackupMeta.backupType === 'module' ? (
                        (() => {
                          const colName = restoreBackupMeta.moduleName;
                          if (colName === 'customers') return 'Customer Restore Mode';
                          if (colName === 'products') return 'Product Restore Mode';
                          if (colName === 'businessProfile/config' || colName === 'businessProfile') return 'Business Profile Restore Mode';
                          const base = colName.split('/')[0];
                          const readable = base.replace(/([A-Z])/g, ' $1').trim();
                          return `${readable.charAt(0).toUpperCase() + readable.slice(1)} Restore Mode`;
                        })()
                      ) : 'Recovery Preview Sheet'}
                    </h3>
                  </div>

                  {!restoreBackupMeta.checksumValid && (
                    <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 text-xs rounded-2xl flex gap-2.5">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                      <div>
                        <strong className="font-bold block text-rose-800">Restore Blocked</strong>
                        Integrity verification failed. This archive has been modified or corrupted after creation. Restore is disabled.
                      </div>
                    </div>
                  )}

                  {/* METADATA LIST */}
                  {restoreBackupMeta.backupType === 'module' ? (
                    <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 text-[10px] font-mono text-slate-600 space-y-2">
                      <div className="flex justify-between pb-1.5 border-b border-slate-200/60">
                        <span className="text-[8px] text-slate-400 uppercase tracking-wider font-sans">Detected Module</span>
                        <span className="font-bold text-indigo-600 font-mono">{restoreBackupMeta.moduleName}</span>
                      </div>
                      <div className="flex justify-between pb-1.5 border-b border-slate-200/60">
                        <span className="text-[8px] text-slate-400 uppercase tracking-wider font-sans">Documents</span>
                        <span className="font-bold text-slate-800 font-mono">{restoreBackupMeta.documentCount} records</span>
                      </div>
                      <div className="flex justify-between pb-1.5 border-b border-slate-200/60">
                        <span className="text-[8px] text-slate-400 uppercase tracking-wider font-sans">Backup Date</span>
                        <span className="font-bold text-slate-800 font-mono">{new Date(restoreBackupMeta.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between pb-1.5 border-b border-slate-200/60">
                        <span className="text-[8px] text-slate-400 uppercase tracking-wider font-sans">ERP Version</span>
                        <span className="font-bold text-slate-800 font-mono">{restoreBackupMeta.erpVersion}</span>
                      </div>
                      <div className="flex justify-between pb-1.5 border-b border-slate-200/60">
                        <span className="text-[8px] text-slate-400 uppercase tracking-wider font-sans">Schema Version</span>
                        <span className="font-bold text-slate-800 font-mono">{restoreBackupMeta.schemaVersion}</span>
                      </div>
                      <div className="flex justify-between pb-1.5 border-b border-slate-200/60">
                        <span className="text-[8px] text-slate-400 uppercase tracking-wider font-sans">Checksum Status</span>
                        <span className={`font-bold font-mono ${restoreBackupMeta.checksumValid ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {restoreBackupMeta.checksumValid ? 'Valid Cryptographic Match' : 'Corrupted / Altered'}
                        </span>
                      </div>
                      <div className="flex justify-between pb-1.5 border-b border-slate-200/60">
                        <span className="text-[8px] text-slate-400 uppercase tracking-wider font-sans">Active Restore Mode</span>
                        <span className="font-bold text-slate-800 font-mono uppercase">{restoreMode} Mode</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[8px] text-slate-400 uppercase tracking-wider font-sans">Dependency Status</span>
                        <span className={`font-bold font-mono flex items-center gap-1 ${
                          !restoreDependencyStatus.checked
                            ? 'text-slate-400'
                            : restoreDependencyStatus.satisfied
                              ? 'text-emerald-600'
                              : 'text-rose-600 font-black animate-pulse'
                        }`}>
                          {!restoreDependencyStatus.checked ? (
                            'Verifying...'
                          ) : restoreDependencyStatus.satisfied ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 inline text-emerald-500" />
                              Satisfied
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="h-3 w-3 inline text-rose-500" />
                              Blocked: Missing {restoreDependencyStatus.missingDeps.join(', ')}
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl text-[10px] font-mono text-slate-600">
                      <div>
                        <span className="text-[8px] text-slate-400 block uppercase">Company</span>
                        <span className="font-bold text-slate-800 line-clamp-1">{restoreBackupMeta.companyName}</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-400 block uppercase">Created By</span>
                        <span className="font-bold text-slate-800 line-clamp-1">{restoreBackupMeta.createdBy}</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-400 block uppercase">Backed Up At</span>
                        <span className="font-bold text-slate-800 line-clamp-1">{new Date(restoreBackupMeta.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-400 block uppercase">Backup Version</span>
                        <span className="font-bold text-slate-800">{restoreBackupMeta.backupVersion}</span>
                      </div>
                      <div className="col-span-2 border-t border-slate-200 pt-2 mt-1">
                        <span className="text-[8px] text-slate-400 block uppercase">Record Package Size</span>
                        <span className="font-bold text-indigo-600 text-xs">{restoreBackupMeta.documentCount} document rows</span>
                      </div>
                    </div>
                  )}

                  {/* SELECTIVE RESTORE MODULE CHECKBOXES */}
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Restore Scope</label>
                    <div className="border border-slate-100 rounded-2xl divide-y divide-slate-100 max-h-[140px] overflow-y-auto scrollbar-thin">
                      {Object.keys(restoreBackupMeta.recordsMap).map(colPath => {
                        const count = Object.keys(restoreBackupMeta.recordsMap[colPath] || {}).length;
                        const isSelected = !!restoreSelectedModules[colPath];
                        return (
                          <div key={colPath} className="p-2 flex items-center justify-between text-xs hover:bg-slate-50">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  setRestoreSelectedModules({
                                    ...restoreSelectedModules,
                                    [colPath]: e.target.checked
                                  });
                                }}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                              />
                              <span className="font-mono text-[10px] text-slate-700 font-semibold line-clamp-1">{colPath}</span>
                            </div>
                            <span className="text-[9px] font-bold text-slate-400 font-mono">{count} records</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* RECOVERY MODES */}
                  <div className="space-y-3 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Restoration Mode</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setRestoreMode('merge')}
                          className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                            restoreMode === 'merge'
                              ? 'bg-indigo-550/10 border-indigo-200 text-indigo-700 font-bold text-xs'
                              : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-500 text-xs'
                          }`}
                        >
                          Merge Mode
                        </button>
                        <button
                          type="button"
                          onClick={() => setRestoreMode('replace')}
                          className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                            restoreMode === 'replace'
                              ? 'bg-rose-50 border-rose-200 text-rose-700 font-bold text-xs'
                              : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-500 text-xs'
                          }`}
                        >
                          Replace Mode
                        </button>
                      </div>
                    </div>

                    {/* DUPLICATE STRATEGY (if Merge Mode) */}
                    {restoreMode === 'merge' && (
                      <div className="space-y-1.5 animate-fade-in">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Duplicate Document Resolution Policy</label>
                        <select
                          value={restoreDuplicateStrategy}
                          onChange={(e: any) => setRestoreDuplicateStrategy(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 text-slate-700 text-xs py-2 px-3 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        >
                          <option value="skip">Skip: Keep Existing Records (Safest)</option>
                          <option value="replace">Replace: Overwrite Entire Record</option>
                          <option value="merge">Merge: Perform Shallow Fields Union</option>
                          <option value="rename">Rename: Save As Copy (e.g. ID_copy)</option>
                        </select>
                      </div>
                    )}

                    {/* DOUBLE SECURITY AUTOCONFIRMATION */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <label className="text-[9px] font-bold text-slate-500 uppercase block">
                        Type <strong className="text-rose-600">RESTORE</strong> to authorize recovery write:
                      </label>
                      <input
                        type="text"
                        value={restoreConfirmationText}
                        onChange={(e) => setRestoreConfirmationText(e.target.value)}
                        placeholder="Authorization string"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    {/* EXECUTE RECOVERY BUTTON */}
                    <button
                      type="button"
                      onClick={handleExecuteRestore}
                      disabled={
                        restoreConfirmationText !== 'RESTORE' ||
                        !Object.values(restoreSelectedModules).some(Boolean) ||
                        restoreStatus === 'restoring' ||
                        restoreStatus === 'verifying' ||
                        !restoreBackupMeta?.checksumValid ||
                        (restoreDependencyStatus.checked && !restoreDependencyStatus.satisfied)
                      }
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white px-5 py-3 transition cursor-pointer disabled:opacity-40"
                    >
                      <RefreshCw className={`h-4 w-4 ${restoreStatus === 'restoring' || restoreStatus === 'verifying' ? 'animate-spin' : ''}`} />
                      <span>Execute Disaster Restore</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 border-dashed rounded-3xl p-8 text-center text-slate-400 h-full flex flex-col items-center justify-center space-y-2">
                  <FileArchive className="h-10 w-10 text-slate-300" />
                  <div>
                    <span className="text-xs font-bold block text-slate-500">Recovery Sheet Offline</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      Upload and parse a backup file on the left to verify cryptographic checksum, content index, and metadata.
                    </span>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: AUDIT LOG & HISTORY */}
      {backupWorkspaceTab === 'history' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* HISTORY TABLE CARD */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-3xs space-y-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Disaster Recovery History Audit</h3>
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('nexus_backup_history');
                  setHistoryLogs([]);
                }}
                className="text-[9px] font-bold text-rose-600 hover:bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-1 flex items-center gap-1 cursor-pointer transition"
              >
                <Trash2 className="h-3 w-3" />
                Clear Logs
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Operation Type</th>
                    <th className="p-3">Scope / Mode</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Operator</th>
                    <th className="p-3">Row Counts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {historyLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 italic">
                        No recovery operations registered in history audit log.
                      </td>
                    </tr>
                  ) : (
                    historyLogs.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition font-mono text-[10px] text-slate-600">
                        <td className="p-3 whitespace-nowrap font-sans text-xs text-slate-700">
                          {new Date(item.timestamp).toLocaleString()}
                        </td>
                        <td className="p-3 whitespace-nowrap capitalize">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold font-sans ${
                            item.type === 'backup'
                              ? 'bg-blue-50 text-blue-700 border border-blue-100'
                              : item.type === 'restore'
                              ? 'bg-indigo-550/10 text-indigo-700 border border-indigo-100'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          }`}>
                            {item.type}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="max-w-[150px] truncate font-sans text-[11px] text-slate-700" title={item.scope}>
                            {item.scope}
                          </div>
                          {item.mode && (
                            <span className="text-[8px] text-slate-400 block uppercase">
                              {item.mode} mode
                            </span>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 font-sans text-[10px] font-black ${
                            item.status === 'success' ? 'text-emerald-600' : 'text-rose-600'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              item.status === 'success' ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}></span>
                            {item.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap font-sans" title={item.operator || 'System'}>
                          {(item.operator || 'System').split('@')[0]}
                        </td>
                        <td className="p-3 whitespace-nowrap text-slate-900 font-bold">
                          {item.documentCount} records
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* RESTORATION PROTOCOL WARNING */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-2">
        <div className="flex items-center gap-2 text-slate-700">
          <Lock className="h-4 w-4 shrink-0" />
          <h4 className="text-xs font-black uppercase tracking-wide">Enterprise Recovery & Audit Standards</h4>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Every backup download, module export, and restore write commits a permanent audit record to the local secure storage. To comply with IFRS and GAAP bookkeeping regulations, restore actions must always be paired with automatic Posting Sequence Counter checks.
        </p>
      </div>
    </div>
  );
}
