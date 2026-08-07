import React, { useState } from 'react';
import EnterpriseHeader from './EnterpriseHeader';
import EnterpriseSidebar from './EnterpriseSidebar';
import EnterpriseFooter from './EnterpriseFooter';
import { User } from 'firebase/auth';
import { UserRole, AppPermissions } from '../../hooks/usePermission';
import { Plus, RotateCcw, Download, Upload } from 'lucide-react';

interface EnterpriseShellProps {
  currentUser: User | null;
  currentUserProfile: { role: UserRole; name: string; email: string } | null;
  userRole: UserRole;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  onSignOut: () => void;
  permissions: AppPermissions;
  isModuleAccessible: (modId: string) => boolean;
  onOpenForm: () => void;
  onResetDemoData: () => void;
  onExportJSON: () => void;
  onToggleImport: () => void;
  showImport: boolean;
  children: React.ReactNode;
}

export default function EnterpriseShell({
  currentUser,
  currentUserProfile,
  userRole,
  activeTab,
  setActiveTab,
  onSignOut,
  permissions,
  isModuleAccessible,
  onOpenForm,
  onResetDemoData,
  onExportJSON,
  onToggleImport,
  showImport,
  children,
}: EnterpriseShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div id="inventory-app-container" className="min-h-screen flex flex-col bg-slate-50 font-sans text-slate-800 antialiased selection:bg-blue-100 selection:text-blue-900">
      
      {/* ENTERPRISE HEADER */}
      <EnterpriseHeader
        currentUser={currentUser}
        currentUserProfile={currentUserProfile}
        userRole={userRole}
        activeTab={activeTab}
        onSignOut={onSignOut}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
        onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
        permissions={permissions}
        onOpenForm={onOpenForm}
        onResetDemoData={onResetDemoData}
        onExportJSON={onExportJSON}
        onToggleImport={onToggleImport}
        showImport={showImport}
      />

      {/* MIDDLE CONTAINER: SIDEBAR + MAIN MODULE CONTENT */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        
        {/* ENTERPRISE SIDEBAR */}
        <EnterpriseSidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
          isMobileOpen={isMobileSidebarOpen}
          setIsMobileOpen={setIsMobileSidebarOpen}
          isModuleAccessible={isModuleAccessible}
          permissions={permissions}
        />

        {/* MAIN WORKSPACE CONTENT AREA */}
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 space-y-5 max-w-7xl mx-auto w-full">
          {/* Page-Specific Operational Action Bar */}
          {(activeTab === 'inventory' || activeTab === 'products' || activeTab === 'dashboard') && (
            <div className="bg-white border border-slate-200/90 rounded-xl p-3 sm:px-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
              <div className="flex flex-wrap items-center gap-2">
                {(permissions.editProduct || permissions.createProduct) && (
                  <button
                    id="register-new-item-button"
                    type="button"
                    onClick={onOpenForm}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition shadow-xs hover:shadow-sm cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Register Product</span>
                  </button>
                )}

                {permissions.manageSettings && (
                  <button
                    id="reset-demo-data-button"
                    type="button"
                    onClick={onResetDemoData}
                    title="Restore default product catalog"
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer shadow-3xs"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
                    <span>Load Demo</span>
                  </button>
                )}

                {permissions.manageSettings && (
                  <button
                    id="export-backup-json-button"
                    type="button"
                    onClick={onExportJSON}
                    title="Download full catalog backup in JSON"
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer shadow-3xs"
                  >
                    <Download className="h-3.5 w-3.5 text-slate-400" />
                    <span>Export Backup</span>
                  </button>
                )}

                {permissions.manageSettings && (
                  <button
                    id="import-backup-toggle-button"
                    type="button"
                    onClick={onToggleImport}
                    title="Import inventory data from JSON backup"
                    className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition cursor-pointer shadow-3xs ${
                      showImport
                        ? 'bg-slate-100 text-slate-800 border-slate-350 shadow-inner'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Upload className="h-3.5 w-3.5 text-slate-400" />
                    <span>Import JSON</span>
                  </button>
                )}
              </div>

              <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-slate-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Active Workspace: <strong className="text-slate-800 capitalize">{activeTab}</strong></span>
              </div>
            </div>
          )}

          {children}
        </main>
      </div>

      {/* ENTERPRISE FOOTER / STATUS BAR */}
      <EnterpriseFooter
        userRole={userRole}
        userEmail={currentUser?.email}
      />
    </div>
  );
}
