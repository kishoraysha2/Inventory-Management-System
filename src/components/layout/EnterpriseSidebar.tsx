import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, PanelLeftClose, PanelLeftOpen, X, Shield, Box } from 'lucide-react';
import { ERP_NAVIGATION_GROUPS, ERPSidebarGroup, ERPNavItem } from '../../theme/navigationConfig';

interface EnterpriseSidebarProps {
  activeTab: string;
  setActiveTab: (tab: any) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  isModuleAccessible: (modId: string) => boolean;
  permissions: any;
}

export default function EnterpriseSidebar({
  activeTab,
  setActiveTab,
  isCollapsed,
  setIsCollapsed,
  isMobileOpen,
  setIsMobileOpen,
  isModuleAccessible,
  permissions,
}: EnterpriseSidebarProps) {
  const desktopNavRef = React.useRef<HTMLDivElement | null>(null);
  const mobileNavRef = React.useRef<HTMLDivElement | null>(null);

  // Auto-scroll active menu item into view when activeTab or sidebar collapse state changes
  React.useEffect(() => {
    const autoScrollActiveItem = () => {
      if (desktopNavRef.current) {
        const activeEl = desktopNavRef.current.querySelector('[aria-current="page"]');
        if (activeEl) {
          activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
      if (mobileNavRef.current) {
        const activeEl = mobileNavRef.current.querySelector('[aria-current="page"]');
        if (activeEl) {
          activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    };

    const timer = setTimeout(autoScrollActiveItem, 60);
    return () => clearTimeout(timer);
  }, [activeTab, isCollapsed, isMobileOpen]);

  // Helper function to check item visibility based on module accessibility and explicit permission checks
  const isItemVisible = (item: ERPNavItem): boolean => {
    // First check general module accessibility
    if (!isModuleAccessible(item.id)) return false;

    // Check custom required permissions if defined
    if (item.requiredPermission) {
      if (typeof item.requiredPermission === 'function') {
        return item.requiredPermission(permissions);
      }
      if (typeof item.requiredPermission === 'string') {
        return !!permissions[item.requiredPermission];
      }
    }
    return true;
  };

  const renderNavGroup = (group: ERPSidebarGroup, isMobile: boolean = false) => {
    const visibleItems = group.items.filter(isItemVisible);
    if (visibleItems.length === 0) return null;

    return (
      <div key={group.id} className="space-y-1.5 py-2">
        {/* Category Header Label */}
        {(!isCollapsed || isMobile) ? (
          <div className="px-3.5 py-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 select-none">
            <span>{group.label}</span>
          </div>
        ) : (
          <div className="w-full flex justify-center py-1">
            <div className="w-6 h-px bg-slate-800" />
          </div>
        )}

        {/* Group Nav Items */}
        <div className="space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.routeKey;

            return (
              <button
                key={item.id}
                id={isMobile ? item.mobileElementId : item.elementId}
                type="button"
                onClick={() => {
                  setActiveTab(item.routeKey);
                  if (isMobile) setIsMobileOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 group relative cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isActive
                    ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-900/40'
                    : 'text-slate-300 hover:bg-slate-800/90 hover:text-white'
                } ${isCollapsed && !isMobile ? 'justify-center px-0' : ''}`}
                title={isCollapsed && !isMobile ? item.displayName : undefined}
                aria-current={isActive ? 'page' : undefined}
                tabIndex={0}
              >
                {/* Active Left Pill Accent */}
                {isActive && (!isCollapsed || isMobile) && (
                  <motion.div
                    layoutId="activeNavIndicator"
                    className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-white rounded-r-full shadow-xs"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}

                <Icon className={`h-4.5 w-4.5 shrink-0 transition-transform duration-150 group-hover:scale-110 ${
                  isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'
                }`} />

                {(!isCollapsed || isMobile) && (
                  <span className="truncate flex-1 text-left">{item.displayName}</span>
                )}

                {/* Collapsed Tooltip Hover Preview */}
                {isCollapsed && !isMobile && (
                  <div className="absolute left-full ml-3 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xl border border-slate-700 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 z-50 whitespace-nowrap">
                    {item.displayName}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* DESKTOP SIDEBAR CONTAINER */}
      <aside
        className={`hidden md:flex flex-col h-full min-h-0 bg-slate-900 border-r border-slate-800 text-slate-300 transition-all duration-300 ease-in-out shrink-0 select-none ${
          isCollapsed ? 'w-20' : 'w-60'
        }`}
      >
        {/* SIDEBAR HEADER / BRANDING BANNER */}
        <div className="h-14 px-4 border-b border-slate-800/80 flex items-center justify-between gap-3 shrink-0">
          {!isCollapsed ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-xs shrink-0">
                <Box className="h-4 w-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-sans text-xs font-extrabold tracking-tight text-white uppercase truncate">
                  Nexus Inventory
                </span>
                <span className="text-[9px] font-mono text-slate-400 font-bold uppercase tracking-widest leading-none">
                  Enterprise Suite
                </span>
              </div>
            </div>
          ) : (
            <div className="w-full flex justify-center">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-xs">
                <Box className="h-4.5 w-4.5" />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            aria-label={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-4 w-4 text-blue-400" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* NAVIGATION LINKS SCROLL AREA */}
        <div
          ref={desktopNavRef}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-1 custom-sidebar-scrollbar"
        >
          {ERP_NAVIGATION_GROUPS.map((group) => renderNavGroup(group, false))}
        </div>

        {/* SIDEBAR FOOTER METADATA */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 shrink-0">
          {!isCollapsed ? (
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono font-semibold">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>v4.2.1 Stable</span>
              </span>
              <span className="text-slate-500">Firestore</span>
            </div>
          ) : (
            <div className="flex justify-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500" title="System Connected" />
            </div>
          )}
        </div>
      </aside>

      {/* MOBILE RESPONSIVE SLIDE-OVER DRAWER */}
      <AnimatePresence>
        {isMobileOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex">
            {/* Backdrop Overlay */}
            <motion.div
              id="mobile-drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileOpen(false)}
              className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs"
            />

            {/* Slide-over Drawer Panel */}
            <motion.div
              id="mobile-drawer-panel"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-4/5 max-w-xs bg-slate-900 text-slate-300 h-full flex flex-col shadow-2xl z-10 border-r border-slate-800"
            >
              {/* Drawer Header */}
              <div className="h-16 px-5 border-b border-slate-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md">
                    <Box className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h2 className="font-sans text-sm font-extrabold text-white tracking-tight uppercase">
                      NEXUS ERP
                    </h2>
                    <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                      Navigation Menu
                    </p>
                  </div>
                </div>

                <button
                  id="mobile-drawer-close"
                  type="button"
                  onClick={() => setIsMobileOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  title="Close Navigation"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Drawer Scrollable Content */}
              <div
                ref={mobileNavRef}
                className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-2 custom-sidebar-scrollbar"
              >
                {ERP_NAVIGATION_GROUPS.map((group) => renderNavGroup(group, true))}
              </div>

              {/* Drawer Footer */}
              <div className="p-4 border-t border-slate-800 bg-slate-950/60 text-xs text-slate-400 font-mono flex items-center justify-between shrink-0">
                <span>Enterprise ERP Suite</span>
                <span className="bg-slate-800 px-2 py-0.5 rounded text-[10px] text-slate-300 font-bold">v4.2.1</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
