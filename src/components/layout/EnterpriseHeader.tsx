import React, { useState } from 'react';
import {
  Box,
  Search,
  Bell,
  ChevronDown,
  LogOut,
  Shield,
  Crown,
  Plus,
  RotateCcw,
  Download,
  Upload,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Building2,
  GitBranch,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import { User } from 'firebase/auth';
import { UserRole, AppPermissions } from '../../hooks/usePermission';
import { ERP_NAVIGATION_GROUPS } from '../../theme/navigationConfig';

interface EnterpriseHeaderProps {
  currentUser: User | null;
  currentUserProfile: { role: UserRole; name: string; email: string } | null;
  userRole: UserRole;
  activeTab: string;
  onSignOut: () => void;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMobileSidebar: () => void;
  permissions: AppPermissions;
  onOpenForm: () => void;
  onResetDemoData: () => void;
  onExportJSON: () => void;
  onToggleImport: () => void;
  showImport: boolean;
}

export default function EnterpriseHeader({
  currentUser,
  currentUserProfile,
  userRole,
  activeTab,
  onSignOut,
  isSidebarCollapsed,
  onToggleSidebar,
  onOpenMobileSidebar,
  permissions,
  onOpenForm,
  onResetDemoData,
  onExportJSON,
  onToggleImport,
  showImport,
}: EnterpriseHeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState('Apex Global Supply Ltd.');
  const [selectedBranch, setSelectedBranch] = useState('Austin HQ Branch');

  // Compute Breadcrumb trail based on current activeTab
  let categoryLabel = 'Main';
  let moduleName = 'Dashboard';

  for (const group of ERP_NAVIGATION_GROUPS) {
    const item = group.items.find((i) => i.routeKey === activeTab);
    if (item) {
      categoryLabel = group.label;
      moduleName = item.displayName;
      break;
    }
  }

  return (
    <header
      id="dashboard-header-section"
      className="print:hidden sticky top-0 z-20 bg-white border-b border-slate-200/90 shadow-2xs transition-all duration-200"
    >
      {/* UPPER MAIN HEADER BAR */}
      <div className="px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 sm:gap-6">
        
        {/* LEFT SECTION: Brand, Sidebar Toggle, Breadcrumbs & Entity Switchers */}
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          {/* Mobile Hamburger Button */}
          <button
            id="mobile-navigation-hamburger"
            type="button"
            onClick={onOpenMobileSidebar}
            className="md:hidden p-2 rounded-xl text-slate-600 hover:text-blue-600 hover:bg-slate-100 active:scale-95 transition cursor-pointer border border-slate-200 bg-white shadow-3xs shrink-0"
            title="Open Mobile Navigation"
            aria-label="Open Mobile Navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Desktop Sidebar Collapse Toggle */}
          <button
            type="button"
            onClick={onToggleSidebar}
            className="hidden md:flex p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer border border-slate-200 bg-slate-50"
            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            aria-label={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="h-4.5 w-4.5 text-blue-600" />
            ) : (
              <PanelLeftClose className="h-4.5 w-4.5" />
            )}
          </button>

          {/* Brand Logo & Name */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-xs font-bold shrink-0">
              <Box className="h-4.5 w-4.5" />
            </div>
            <div className="hidden sm:flex flex-col">
              <div className="flex items-center gap-2 leading-none">
                <span className="font-sans text-sm sm:text-base font-extrabold tracking-tight text-slate-900">
                  NEXUS ERP
                </span>
                <span className="text-slate-400 font-mono text-[9px] font-bold uppercase tracking-widest bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md">
                  v4.2.1
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-semibold tracking-wide">
                Enterprise Inventory Suite
              </span>
            </div>
          </div>

          <div className="hidden lg:block h-5 w-px bg-slate-200 shrink-0 mx-1" />

          {/* BREADCRUMBS */}
          <div className="hidden lg:flex items-center gap-1.5 text-xs font-semibold text-slate-500 truncate">
            <span className="text-slate-400 hover:text-slate-600 transition cursor-pointer">Nexus ERP</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
            <span className="text-slate-400">{categoryLabel}</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
            <span className="text-slate-900 font-bold bg-slate-100 px-2 py-0.5 rounded-md text-xs border border-slate-200/60">
              {moduleName}
            </span>
          </div>

          {/* RESERVED LAYOUT SPACE FOR FUTURE COMPANY & BRANCH SWITCHERS (UI ONLY) */}
          <div className="hidden xl:flex items-center gap-2 ml-2">
            {/* Company Switcher Placeholder */}
            <div className="relative group">
              <button
                type="button"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                title="Company Entity (Future Readiness)"
              >
                <Building2 className="h-3.5 w-3.5 text-blue-600" />
                <span className="max-w-[130px] truncate">{selectedCompany}</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>
            </div>

            {/* Branch Switcher Placeholder */}
            <div className="relative group">
              <button
                type="button"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                title="Branch Operations Center (Future Readiness)"
              >
                <GitBranch className="h-3.5 w-3.5 text-indigo-600" />
                <span className="max-w-[120px] truncate">{selectedBranch}</span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>
            </div>
          </div>
        </div>

        {/* CENTER / RIGHT SECTION: Global Search, Quick Actions, Notifications & Profile */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
          
          {/* SEARCH PLACEHOLDER (UI ONLY) */}
          <div className="hidden md:flex items-center relative w-48 xl:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              readOnly
              placeholder="Search enterprise... (Ctrl + K)"
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-600 outline-none cursor-pointer focus:border-blue-500 transition shadow-3xs"
            />
            <kbd className="hidden xl:inline-block absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9px] font-bold text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200 shadow-3xs">
              ⌘K
            </kbd>
          </div>

          {/* NOTIFICATION ICON PLACEHOLDER (UI ONLY) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer border border-slate-200 bg-white relative shadow-3xs"
              title="System Alerts & Notifications"
              aria-label="System Notifications"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-600 rounded-full ring-2 ring-white animate-pulse" />
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 z-50 text-xs space-y-3 animate-fade-in">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-blue-600" /> Enterprise Notifications
                  </span>
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                    2 New
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/80 transition cursor-pointer">
                    <p className="font-bold text-slate-800">Automated Audit Complete</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Stock Card reconciliation verified successfully across 14 categories.</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-100 hover:bg-amber-50 transition cursor-pointer">
                    <p className="font-bold text-amber-900">Low Stock Warning</p>
                    <p className="text-[11px] text-amber-700 mt-0.5">3 inventory items have dropped below target reorder thresholds.</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* USER PROFILE INFO & ROLE BADGE */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            {/* User Name & Email */}
            <div className="hidden lg:flex flex-col items-end text-right min-w-0">
              <span className="text-slate-900 font-bold text-xs leading-none truncate max-w-[130px]">
                {currentUserProfile?.name || currentUser?.email?.split('@')[0]}
              </span>
              <span className="text-slate-400 font-mono text-[10px] font-semibold truncate max-w-[140px] mt-0.5">
                {currentUser?.email}
              </span>
            </div>

            {/* Admin/Role Badge */}
            <span
              id="user-role-badge"
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-extrabold uppercase border shadow-3xs select-none shrink-0 ${
                userRole === 'owner'
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white border-amber-400 font-extrabold shadow-[0_0_12px_rgba(245,158,11,0.45)]'
                  : userRole === 'admin'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold'
                  : userRole === 'accountant'
                  ? 'bg-blue-50 border-blue-200 text-blue-700 font-bold'
                  : userRole === 'cashier'
                  ? 'bg-amber-50 border-amber-200 text-amber-700 font-bold'
                  : 'bg-slate-50 border-slate-200 text-slate-600 font-semibold'
              }`}
            >
              {userRole === 'owner' ? (
                <Crown className="w-3 h-3 text-white fill-amber-100 shrink-0 animate-pulse" />
              ) : (
                <Shield className="w-2.5 h-2.5 shrink-0" />
              )}
              <span className="leading-none">{userRole}</span>
            </span>

            {/* Log Out Button */}
            <button
              type="button"
              onClick={onSignOut}
              className="font-sans font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer shrink-0 border border-transparent hover:border-rose-100"
              title="Log Out of Workstation"
              aria-label="Log Out of Workstation"
            >
              <LogOut className="w-4 h-4 hover:rotate-12 transition-transform" />
              <span className="hidden sm:inline text-xs">Log Out</span>
            </button>
          </div>

        </div>
      </div>
    </header>
  );
}
