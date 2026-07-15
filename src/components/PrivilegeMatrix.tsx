import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Lock, 
  Unlock, 
  Save, 
  RotateCcw, 
  ChevronDown, 
  ChevronUp, 
  AlertTriangle,
  CheckCircle,
  Clock,
  User,
  Info
} from 'lucide-react';
import { db, auth, logSystemActivity } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { AppPermissions, UserRole, ROLE_PERMISSIONS_TEMPLATES } from '../hooks/usePermission';

const mergePrivileges = (role: UserRole, dbPrivs?: Partial<AppPermissions>): AppPermissions => {
  const template = ROLE_PERMISSIONS_TEMPLATES[role];
  if (!dbPrivs) return { ...template };
  const merged = { ...template };
  for (const key of Object.keys(template) as Array<keyof AppPermissions>) {
    if (dbPrivs[key] !== undefined) {
      merged[key] = dbPrivs[key] as boolean;
    }
  }
  return merged;
};

const ROLE_LABELS: Record<UserRole, string> = {
  owner: '👑 Owner / Founder',
  admin: '🔒 Administrator',
  manager: '💼 Operations Manager',
  supervisor: '📋 Floor Supervisor',
  accountant: '💰 Senior Accountant',
  cashier: '🛒 Registered Cashier',
  salesman: '👥 Sales Executive',
  viewer: '👁️ System Auditor',
};

const ROLE_SUBTITLES: Record<UserRole, string> = {
  owner: 'Ultimate clearance. Immortal access.',
  admin: 'Corporate admin controls. Restricted from Owner.',
  manager: 'Manages branches and general operations.',
  supervisor: 'Controls inventory limits and stock flows.',
  accountant: 'Full billing, ledger, and tax controls.',
  cashier: 'Daily counter checkout and retail transactions.',
  salesman: 'Direct customer orders and sales leads.',
  viewer: 'Read-only access across all corporate modules.',
};

interface PrivilegeMeta {
  key: keyof AppPermissions;
  label: string;
  description: string;
}

const PRIVILEGES_BY_CATEGORY: Record<string, PrivilegeMeta[]> = {
  'Dashboard': [
    { key: 'viewDashboard', label: 'View Dashboard', description: 'Enable access to the general home screen layout.' },
    { key: 'viewDashboardStats', label: 'View Dashboard Stats', description: 'Allow viewing consolidated analytics & counters.' }
  ],
  'Inventory': [
    { key: 'viewInventory', label: 'View Stock Inventory', description: 'Access standard warehouse stock levels.' },
    { key: 'manageInventory', label: 'Manage Stock Inventory', description: 'Perform physical count corrections & adjust volumes.' }
  ],
  'Customers': [
    { key: 'viewCustomers', label: 'Browse Customers', description: 'Browse customer list and accounts.' },
    { key: 'createCustomer', label: 'Register New Customer', description: 'Add a new client profile to the system.' },
    { key: 'editCustomer', label: 'Update Customer Info', description: 'Alter general details and address listings.' },
    { key: 'deleteCustomer', label: 'Delete Customer Profile', description: 'Permanently purge customers from corporate ledger.' }
  ],
  'Suppliers': [
    { key: 'viewSuppliers', label: 'Browse Suppliers', description: 'Browse active wholesalers and vendor lists.' },
    { key: 'createSupplier', label: 'Register New Supplier', description: 'Initiate vendor records.' },
    { key: 'editSupplier', label: 'Update Supplier Info', description: 'Alter vendor email, cell phone, or categories.' },
    { key: 'deleteSupplier', label: 'Delete Supplier Profile', description: 'Hard remove supply chain profile records.' }
  ],
  'Due Ledger': [
    { key: 'viewLedger', label: 'View Due Ledger', description: 'Access payment schedules, receivables, and payables.' },
    { key: 'createPayment', label: 'Create Ledger Payment', description: 'Settle invoices and update customer balances.' },
    { key: 'voidPayment', label: 'Void Ledger Payment', description: 'Undo payments with full financial ledger back-step.' }
  ],
  'Products': [
    { key: 'viewProducts', label: 'Browse ERP Catalog', description: 'Access inventory product codes & unit prices.' },
    { key: 'createProduct', label: 'Register New Product', description: 'Add new brand codes and stock rules.' },
    { key: 'editProduct', label: 'Update Product Data', description: 'Amend barcodes, margins, and descriptions.' },
    { key: 'deleteProduct', label: 'Delete Product Listing', description: 'Remove catalog products from standard use.' },
    { key: 'viewProductCost', label: 'View Product Costs', description: 'See unit cost pricing, profit margin calculations and asset valuations.' }
  ],
  'Sales': [
    { key: 'viewSales', label: 'View Sales History', description: 'Inspect prior invoice records and invoice line items.' },
    { key: 'createSale', label: 'Draft Live Invoice', description: 'Activate Point of Sale cash desks and checkout orders.' },
    { key: 'editSale', label: 'Amend Draft Invoice', description: 'Edit uncommitted quotes/invoices before transaction.' },
    { key: 'voidSale', label: 'Void Invoice Transaction', description: 'Revoke live sales and rollback customer limits.' }
  ],
  'Procurement': [
    { key: 'viewProcurement', label: 'Browse Purchase Records', description: 'Verify past goods intake profiles.' },
    { key: 'createProcurement', label: 'Log Wholesales Intake', description: 'Order bulk items from valid suppliers.' },
    { key: 'voidProcurement', label: 'Void Purchase Orders', description: 'Reject bulk product intake listings.' }
  ],
  'Reports': [
    { key: 'viewReports', label: 'Audit Stock Log Reports', description: 'Verify warehouse item histories and system logs.' },
    { key: 'viewFinancialReports', label: 'Access Balance Sheet Reports', description: 'Inspect corporate balance sheet, profit and loss, assets & liabilities.' }
  ],
  'Expenses': [
    { key: 'viewExpenses', label: 'View Expenses', description: 'Enable browsing and inspection of the corporate Expense list.' },
    { key: 'createExpense', label: 'Create Expense', description: 'Register new corporate expenditures and cash ledger outflows.' },
    { key: 'editExpense', label: 'Update Expense Details', description: 'Amend existing active expenses and category tags.' },
    { key: 'voidExpense', label: 'Void Expense Transaction', description: 'Mark expenses as void, restoring balance sheets and cash ledger.' }
  ],
  'User Access': [
    { key: 'viewUsers', label: 'Examine Security Directory', description: 'View current active employee credentials.' },
    { key: 'manageUsers', label: 'Manage Identity Directory', description: 'Approve profiles or trigger security checks.' },
    { key: 'assignRoles', label: 'Change Security Clearance', description: 'Assign different corporate levels to users.' }
  ],
  'System': [
    { key: 'viewSettings', label: 'View Store Settings', description: 'Examine store corporate name, address, and VAT registration.' },
    { key: 'manageSettings', label: 'Update Store Config & Clean Demo', description: 'Modify corporate settings or clean demo items.' },
    { key: 'voidAny', label: 'Void Any Transaction Override', description: 'Bypass ordinary safety states to revoke final ledger balances.' }
  ]
};

// Calculate total privileges count across categories
const TOTAL_PRIVILEGES_COUNT = Object.values(PRIVILEGES_BY_CATEGORY).reduce((sum, list) => sum + list.length, 0);

interface PrivilegeMatrixProps {
  currentUserRole: UserRole;
}

export default function PrivilegeMatrix({ currentUserRole }: PrivilegeMatrixProps) {
  const [dbRoles, setDbRoles] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<UserRole>('admin');
  const [draftPrivileges, setDraftPrivileges] = useState<AppPermissions | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Group Collapsing
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    Dashboard: true,
    Inventory: true,
    Customers: false,
    Suppliers: false,
    'Due Ledger': false,
    Products: false,
    Sales: false,
    Procurement: false,
    Reports: false,
    Expenses: false,
    'User Access': false,
    System: false,
  });

  // Check if current user role permits access
  const hasAccessToMatrix = currentUserRole === 'owner' || currentUserRole === 'admin';

  // Listen to Firestore updates
  useEffect(() => {
    if (!hasAccessToMatrix) {
      setLoading(false);
      return;
    }

    const colRef = collection(db, 'rolePermissions');
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const rolesData: Record<string, any> = {};
      snapshot.forEach(docSnap => {
        rolesData[docSnap.id] = docSnap.data();
      });
      setDbRoles(rolesData);
      setLoading(false);
    }, (err) => {
      console.warn("Failed to subscribe to rolePermissions in viewport, using fallbacks.", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [hasAccessToMatrix]);

  // Load selected role privileges into draft
  useEffect(() => {
    if (!selectedRole || loading) return;

    const data = dbRoles[selectedRole];
    const initialPrivileges = mergePrivileges(selectedRole, data?.privileges);
    setDraftPrivileges(initialPrivileges);
    setSaveStatus(null);
  }, [selectedRole, dbRoles, loading]);

  if (!hasAccessToMatrix) {
    return (
      <div id="privilege-matrix-denied" className="flex flex-col items-center justify-center py-16 text-center space-y-4">
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="font-sans text-base font-bold text-slate-800">Clearance Unauthorized</h3>
        <p className="text-xs text-slate-400 max-w-sm">
          Your current credentials role ({currentUserRole}) does not possess authorization to adjust or review store privileges matrices.
        </p>
      </div>
    );
  }

  // Retrieve current active metadata
  const currentRoleDoc = dbRoles[selectedRole];
  const lastUpdatedBy = currentRoleDoc?.lastUpdatedBy || 'System Default';
  const lastUpdatedTime = currentRoleDoc?.lastUpdatedTime 
    ? new Date(currentRoleDoc.lastUpdatedTime).toLocaleString() 
    : 'Default ERP Setup';

  // Hierarchy Editing Locks
  const isSelectedRoleEditable = () => {
    if (currentUserRole === 'owner') {
      // Owner can configure all roles EXCEPT Owner (self self-lockout guard)
      return selectedRole !== 'owner';
    }
    if (currentUserRole === 'admin') {
      // Admin can configure managers, supervisors, cashiers, salesmen, viewers, accountants
      // Admin CANNOT edit Owner or Admin
      return selectedRole !== 'owner' && selectedRole !== 'admin';
    }
    return false;
  };

  const isEditable = isSelectedRoleEditable();

  // Highlight modified fields
  const hasUnsavedChanges = () => {
    if (!draftPrivileges) return false;
    const original = mergePrivileges(selectedRole, dbRoles[selectedRole]?.privileges);
    
    return Object.keys(original).some(key => {
      const pKey = key as keyof AppPermissions;
      return draftPrivileges[pKey] !== original[pKey];
    });
  };

  const changesExist = hasUnsavedChanges();

  // Toggle Single Switch
  const handleToggle = (key: keyof AppPermissions) => {
    if (!isEditable || !draftPrivileges) return;
    setDraftPrivileges({
      ...draftPrivileges,
      [key]: !draftPrivileges[key]
    });
    setSaveStatus(null);
  };

  // Expand / Collapse all
  const setAllCategories = (expanded: boolean) => {
    const nextStates: Record<string, boolean> = {};
    Object.keys(PRIVILEGES_BY_CATEGORY).forEach(c => {
      nextStates[c] = expanded;
    });
    setExpandedCategories(nextStates);
  };

  const getBaselineStatus = (roleKey: UserRole, roleData?: any) => {
    if (roleKey === 'owner') return 'default';

    const privileges = mergePrivileges(roleKey, roleData?.privileges);
    const baseline = mergePrivileges(roleKey, roleData?.ownerBaselinePrivileges);

    // Deep compare all keys
    const isIdentical = Object.keys(ROLE_PERMISSIONS_TEMPLATES[roleKey]).every(key => {
      const k = key as keyof AppPermissions;
      return privileges[k] === baseline[k];
    });

    if (isIdentical) {
      return 'default'; // Using Company Default
    }

    const baselineTime = roleData?.baselineUpdatedTime;
    const lastUpdateTime = roleData?.lastUpdatedTime;

    if (baselineTime && lastUpdateTime && new Date(baselineTime) > new Date(lastUpdateTime)) {
      return 'updated'; // Owner Baseline Updated
    }

    return 'customized'; // Customized
  };

  const handleSaveAsDefault = async () => {
    if (currentUserRole !== 'owner' || selectedRole === 'owner' || saving || !draftPrivileges) return;
    
    setSaving(true);
    setSaveStatus(null);
    try {
      const userEmail = auth.currentUser?.email || 'authorized_owner';
      const timestamp = new Date().toISOString();
      const docRef = doc(db, 'rolePermissions', selectedRole);

      // Save draftPrivileges as both active privileges and ownerBaselinePrivileges
      await setDoc(docRef, {
        role: selectedRole,
        privileges: draftPrivileges,
        ownerBaselinePrivileges: draftPrivileges,
        baselineUpdatedBy: userEmail,
        baselineUpdatedTime: timestamp,
        lastUpdatedBy: userEmail,
        lastUpdatedTime: timestamp
      });

      await logSystemActivity(
        'Baseline Saved',
        `Determined official "${selectedRole.toUpperCase()}" company default baseline privileges by ${userEmail}`
      );

      setSaveStatus({ 
        type: 'success', 
        text: `Official Company Default Baseline for "${ROLE_LABELS[selectedRole]}" has been established and synchronized.` 
      });
    } catch (err: any) {
      console.error(err);
      setSaveStatus({ type: 'error', text: err?.message || 'Access Denied. See security permissions.' });
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = async () => {
    if (currentUserRole !== 'owner' || selectedRole === 'owner' || saving) return;

    const baseline = dbRoles[selectedRole]?.ownerBaselinePrivileges || ROLE_PERMISSIONS_TEMPLATES[selectedRole];
    
    const confirmReset = window.confirm(
      `Are you sure you want to restore "${ROLE_LABELS[selectedRole]}" privileges back to Owner defaults?\nThis will revert all custom edits.`
    );
    if (!confirmReset) return;

    setSaving(true);
    setSaveStatus(null);

    try {
      const userEmail = auth.currentUser?.email || 'authorized_owner';
      const timestamp = new Date().toISOString();
      const docRef = doc(db, 'rolePermissions', selectedRole);

      // Restore active privileges back to ownerBaselinePrivileges, while keeping baseline field itself unchanged
      await setDoc(docRef, {
        role: selectedRole,
        privileges: baseline,
        ownerBaselinePrivileges: baseline,
        baselineUpdatedBy: dbRoles[selectedRole]?.baselineUpdatedBy || 'system_auto_seed',
        baselineUpdatedTime: dbRoles[selectedRole]?.baselineUpdatedTime || timestamp,
        lastUpdatedBy: userEmail,
        lastUpdatedTime: timestamp
      });

      // Update local draft as well
      setDraftPrivileges({ ...baseline });

      await logSystemActivity(
        'Baseline Reset',
        `Restored "${selectedRole.toUpperCase()}" to Owner baseline template by ${userEmail}`
      );

      setSaveStatus({ 
        type: 'success', 
        text: `Successfully restored "${ROLE_LABELS[selectedRole]}" back to the configured Company Default Baseline.` 
      });
    } catch (err: any) {
      console.error(err);
      setSaveStatus({ type: 'error', text: err?.message || 'Access Denied. Revert operation aborted.' });
    } finally {
      setSaving(false);
    }
  };

  // Save changes via standard Firebase SDK
  const handleSave = async () => {
    if (!isEditable || !draftPrivileges || !changesExist || saving) return;
    setSaving(true);
    setSaveStatus(null);

    try {
      const docRef = doc(db, 'rolePermissions', selectedRole);
      const userEmail = auth.currentUser?.email || 'authorized_user';
      const timestamp = new Date().toISOString();

      await setDoc(docRef, {
        role: selectedRole,
        privileges: draftPrivileges,
        lastUpdatedBy: userEmail,
        lastUpdatedTime: timestamp
      });

      await logSystemActivity(
        'Privilege Matrix Save',
        `Modified privileges of role "${selectedRole.toUpperCase()}" by ${userEmail}`
      );

      setSaveStatus({ type: 'success', text: `Successfully updated privileges for "${ROLE_LABELS[selectedRole]}".` });
    } catch (err: any) {
      console.error(err);
      setSaveStatus({ type: 'error', text: err?.message || 'Access Denied. Check Firestore security permissions.' });
    } finally {
      setSaving(false);
    }
  };

  // Reset to Loaded state
  const handleDiscard = () => {
    const original = mergePrivileges(selectedRole, dbRoles[selectedRole]?.privileges);
    setDraftPrivileges({ ...original });
    setSaveStatus(null);
  };

  return (
    <div id="privilege-matrix-core" className="space-y-6">
      
      {/* HEADER CONTROLS Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-slate-50/50 border border-slate-150 rounded-2xl p-4 gap-4">
        <div className="space-y-0.5">
          <h4 className="font-sans text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <Lock className="w-4 h-4 text-indigo-600 animate-pulse" />
            <span>Interactive Privilege Security Matrix</span>
          </h4>
          <p className="text-[11px] text-slate-400">
            Define dynamic attribute-level permission overrides across <strong>{TOTAL_PRIVILEGES_COUNT} core enterprise privileges</strong>
          </p>
        </div>

        {/* Global Expand & Collapse Shortcuts */}
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono self-end sm:self-center">
          <button 
            type="button"
            onClick={() => setAllCategories(true)}
            className="hover:text-indigo-600 bg-white border border-slate-200 shadow-2xs hover:border-slate-300 rounded px-2.5 py-1 transition-all cursor-pointer font-bold"
          >
            Expand All Categories
          </button>
          <button 
            type="button"
            onClick={() => setAllCategories(false)}
            className="hover:text-indigo-600 bg-white border border-slate-200 shadow-2xs hover:border-slate-300 rounded px-2.5 py-1 transition-all cursor-pointer font-bold"
          >
            Collapse All
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400">
          <span className="font-mono text-xs flex justify-center items-center gap-2">
            <span className="w-2.5 h-2.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
            Syncing Dynamic Matrix configurations...
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT PANEL — Roles Navigation */}
          <div className="lg:col-span-4 space-y-3">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono font-bold px-1 select-none">Enterprise Role Templates</p>
            <div id="roles-templates-list" className="space-y-1.5">
              {(Object.keys(ROLE_PERMISSIONS_TEMPLATES) as UserRole[]).map((roleKey) => {
                const isActive = selectedRole === roleKey;
                const editable = currentUserRole === 'owner' 
                  ? roleKey !== 'owner' 
                  : currentUserRole === 'admin' 
                    ? (roleKey !== 'owner' && roleKey !== 'admin')
                    : false;

                const loadedPermissions = mergePrivileges(roleKey, dbRoles[roleKey]?.privileges);
                const activeCount = Object.values(loadedPermissions).filter(val => val === true).length;

                return (
                  <button
                    key={roleKey}
                    id={`role-btn-${roleKey}`}
                    type="button"
                    onClick={() => {
                      if (changesExist) {
                        const confirmLeave = window.confirm(`You have unsaved changes to ${ROLE_LABELS[selectedRole]}. Leaving will discard. Continue?`);
                        if (!confirmLeave) return;
                      }
                      setSelectedRole(roleKey);
                    }}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all duration-150 relative cursor-pointer overflow-hidden group ${
                      isActive 
                        ? 'bg-indigo-50/40 border-indigo-200 shadow-sm' 
                        : 'bg-white hover:bg-slate-50/40 border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    {/* Active highlight bar */}
                    {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600" />}

                    <div className="flex justify-between items-center">
                      <div>
                        <span className={`font-sans text-xs font-bold ${isActive ? 'text-indigo-900 font-extrabold' : 'text-slate-700'}`}>
                          {ROLE_LABELS[roleKey]}
                        </span>
                        <p className="text-[10px] text-slate-430 mt-0.5 line-clamp-1">{ROLE_SUBTITLES[roleKey]}</p>
                      </div>

                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`font-mono text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          isActive 
                            ? 'bg-indigo-100 text-indigo-700' 
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {activeCount}/{TOTAL_PRIVILEGES_COUNT} Actives
                        </span>
                        
                        {roleKey !== 'owner' && (
                          (() => {
                            const status = getBaselineStatus(roleKey, dbRoles[roleKey]);
                            if (status === 'default') {
                              return (
                                <span className="inline-flex items-center gap-0.5 font-mono text-[8px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.2 rounded" title="Using Company Default">
                                  🟢 DEFAULT
                                </span>
                              );
                            } else if (status === 'updated') {
                              return (
                                <span className="inline-flex items-center gap-0.5 font-mono text-[8px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.2 rounded animate-pulse" title="Owner Baseline Updated">
                                  🔵 UPDATED
                                </span>
                              );
                            } else {
                              return (
                                <span className="inline-flex items-center gap-0.5 font-mono text-[8px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.2 rounded" title="Customized">
                                  🟡 CUSTOM
                                </span>
                              );
                            }
                          })()
                        )}
                        
                        {!editable && (
                          <span className="font-mono text-[8px] text-rose-500 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-100 flex items-center gap-0.5 scale-95" title="Read Only Level">
                            <Lock className="w-2 h-2" />
                            <span>LOCKED</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT PANEL — Multi-collapsible Privileges Category Panel */}
          <div className="lg:col-span-8 space-y-4">
            
            {/* TARGET SELECTION CARD META */}
            <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-md flex flex-col sm:flex-row justify-between gap-4 border border-slate-950 relative overflow-hidden select-none">
              <div className="absolute right-0 bottom-0 transform translate-x-12 translate-y-6 opacity-5 pointer-events-none">
                <Shield className="w-48 h-48" />
              </div>

              <div className="space-y-1.5 z-10">
                <span className="bg-indigo-600 text-white font-mono text-[9px] font-extrabold px-2.5 py-1 rounded-md tracking-widest uppercase">
                  Active Directory Configuration
                </span>
                <h3 className="font-sans text-base font-bold text-slate-50 flex flex-wrap items-center gap-1.5 mt-1">
                  <span>{ROLE_LABELS[selectedRole]}</span>
                  {isEditable ? (
                    <span className="font-mono text-[9px] font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-900/60 rounded px-1.5 py-0.5 flex items-center gap-0.5">
                      <Unlock className="w-2.5 h-2.5" />
                      Editable Clearance
                    </span>
                  ) : (
                    <span className="font-mono text-[9px] font-bold text-rose-400 bg-rose-950/50 border border-rose-900/60 rounded px-1.5 py-0.5 flex items-center gap-0.5">
                      <Lock className="w-2.5 h-2.5" />
                      Read Only Blocked
                    </span>
                  )}
                  {selectedRole !== 'owner' && (
                    (() => {
                      const status = getBaselineStatus(selectedRole, dbRoles[selectedRole]);
                      if (status === 'default') {
                        return (
                          <span className="font-mono text-[9px] font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-900/60 rounded px-1.5 py-0.5 flex items-center gap-0.5" title="Using Company Default">
                            🟢 COMPANY DEFAULT
                          </span>
                        );
                      } else if (status === 'updated') {
                        return (
                          <span className="font-mono text-[9px] font-bold text-indigo-400 bg-indigo-950/50 border border-indigo-900/60 rounded px-1.5 py-0.5 flex items-center gap-0.5 animate-pulse" title="Owner Baseline Updated">
                            🔵 BASELINE UPDATED
                          </span>
                        );
                      } else {
                        return (
                          <span className="font-mono text-[9px] font-bold text-amber-400 bg-amber-950/50 border border-amber-900/60 rounded px-1.5 py-0.5 flex items-center gap-0.5" title="Customized">
                            🟡 CUSTOM OVERRIDES
                          </span>
                        );
                      }
                    })()
                  )}
                </h3>
                <p className="text-[11px] text-slate-350">{ROLE_SUBTITLES[selectedRole]}</p>
              </div>

              <div className="border-t sm:border-t-0 sm:border-l border-slate-700/50 pt-3 sm:pt-0 sm:pl-5 flex flex-col justify-center text-[10px] space-y-1 text-slate-300 font-mono min-w-44 z-10">
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Updated: {lastUpdatedTime}</span>
                </div>
                <div className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate max-w-40">Editor: {lastUpdatedBy}</span>
                </div>
              </div>
            </div>

            {/* OWNER BASELINE CONTROL DECK */}
            {currentUserRole === 'owner' && selectedRole !== 'owner' && (
              <div id="owner-baseline-deck" className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-sans text-xs font-bold text-slate-800">Owner Baselines & Reverts</span>
                    {(() => {
                      const status = getBaselineStatus(selectedRole, dbRoles[selectedRole]);
                      if (status === 'default') {
                        return <span className="font-mono text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.2">🟢 Synced</span>;
                      } else if (status === 'updated') {
                        return <span className="font-mono text-[9px] font-bold text-indigo-100 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.2">🔵 Revert Pending</span>;
                      } else {
                        return <span className="font-mono text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.2">🟡 Overridden</span>;
                      }
                    })()}
                  </div>
                  <p className="text-[10px] text-slate-400">Establish standard templates or instantly roll back employee group permissions.</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                  <button
                    id="btn-save-as-default"
                    type="button"
                    onClick={handleSaveAsDefault}
                    disabled={saving}
                    className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 text-[11px] font-bold shadow-2xs transition-all cursor-pointer font-sans"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>💾 Save As Company Default</span>
                  </button>
                  <button
                    id="btn-reset-to-default"
                    type="button"
                    onClick={handleResetToDefault}
                    disabled={saving}
                    className="flex items-center gap-1 bg-white border border-slate-200 hover:border-slate-300 disabled:opacity-50 text-slate-700 rounded-lg px-3 py-1.5 text-[11px] font-bold shadow-2xs hover:bg-slate-50 transition-all cursor-pointer font-sans"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                    <span>↩️ Reset To Owner Default</span>
                  </button>
                </div>
              </div>
            )}

            {/* ERROR / SUCCESS Banner Notifications */}
            {saveStatus && (
              <div id="save-status-msg" className={`flex items-start gap-2.5 p-3.5 rounded-xl border text-xs leading-relaxed ${
                saveStatus.type === 'success' 
                  ? 'bg-emerald-50 border-emerald-150 text-emerald-800' 
                  : 'bg-rose-50 border-rose-150 text-rose-800'
              }`}>
                {saveStatus.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
                )}
                <span>{saveStatus.text}</span>
              </div>
            )}

            {/* Read-Only Restriction Notice for the configuration panel */}
            {!isEditable && (
              <div className="bg-amber-50/50 border border-amber-150 text-amber-800 p-3.5 rounded-xl flex items-start gap-2.5 text-xs">
                <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>View Only Level:</strong> Your workspace security clearance tier is restricted from reconfiguring {ROLE_LABELS[selectedRole]} permissions. Only {selectedRole === 'owner' || selectedRole === 'admin' ? 'the Owner' : 'the Owner or Admin'} can alter this role.
                </span>
              </div>
            )}

            {/* SAVE CONTROLS FLOOR */}
            {changesExist && isEditable && (
              <div id="save-sticky-banner" className="bg-indigo-50 border border-indigo-150 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in shadow-xs">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-indigo-600 animate-bounce" />
                  <div>
                    <h5 className="text-xs font-bold text-indigo-900">Pending Changes Detected</h5>
                    <p className="text-[10px] text-indigo-700">You have altered clearance levels. Don't forget to push changes to Firestore.</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={handleDiscard}
                    disabled={saving}
                    className="flex items-center gap-1 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 rounded-lg px-3 py-1.5 text-[11px] font-bold shadow-2xs hover:bg-slate-50 transition-all cursor-pointer font-sans"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                    Discard Changes
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-750 text-white rounded-lg px-4 py-1.5 text-[11px] font-bold shadow-xs hover:shadow-sm transition-all cursor-pointer font-sans"
                  >
                    <Save className="w-3.5 h-3.5 text-white" />
                    {saving ? 'Writing Security...' : 'Save Matrix Overrides'}
                  </button>
                </div>
              </div>
            )}

            {/* COLLAPSIBLE ACCORDIONS MATRIX */}
            <div className="space-y-3">
              {Object.entries(PRIVILEGES_BY_CATEGORY).map(([categoryName, privilegesList]) => {
                const isExpanded = expandedCategories[categoryName];

                // Calculate category-specific counts
                const totalInCategory = privilegesList.length;
                const activeInCategory = draftPrivileges 
                  ? privilegesList.filter(item => draftPrivileges[item.key] === true).length
                  : 0;

                return (
                  <div 
                    key={categoryName} 
                    id={`category-wrapper-${categoryName.replace(/\s+/g, '-').toLowerCase()}`}
                    className="border border-slate-150 rounded-xl bg-white overflow-hidden shadow-2xs"
                  >
                    
                    {/* ACCORDION TRIGGER */}
                    <button
                      type="button"
                      onClick={() => setExpandedCategories({
                        ...expandedCategories,
                        [categoryName]: !isExpanded
                      })}
                      className="w-full flex justify-between items-center p-3.5 bg-slate-50 hover:bg-slate-100/50 transition-colors cursor-pointer text-left select-none"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-sans text-xs font-bold text-slate-800 tracking-tight">
                          {categoryName}
                        </span>
                        <span className="font-mono text-[9px] bg-slate-200/50 font-bold border border-slate-200/40 text-slate-600 rounded px-2 py-0.2">
                          {activeInCategory} / {totalInCategory} Allowed
                        </span>
                      </div>

                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </button>

                    {/* COLLAPSED BODY SECTION */}
                    {isExpanded && (
                      <div className="divide-y divide-slate-100 px-4 bg-white">
                        {privilegesList.map((privilege) => {
                          const value = draftPrivileges ? draftPrivileges[privilege.key] : false;
                          
                          return (
                            <div 
                              key={privilege.key} 
                              className="py-3 flex items-center justify-between gap-4 py-3 hover:bg-slate-50/20 transition-colors"
                            >
                              <div className="space-y-0.5 max-w-[80%]">
                                <label 
                                  htmlFor={`toggle-${privilege.key}`}
                                  className={`text-xs font-bold tracking-tight block ${
                                    value ? 'text-slate-800' : 'text-slate-600'
                                  }`}
                                >
                                  {privilege.label}
                                </label>
                                <p className="text-[10px] text-slate-400 leading-relaxed">
                                  {privilege.description}
                                </p>
                              </div>

                              {/* STYLISH TOGGLE SWITCH */}
                              <div className="flex items-center">
                                <button
                                  id={`toggle-${privilege.key}`}
                                  type="button"
                                  role="switch"
                                  aria-checked={value}
                                  disabled={!isEditable}
                                  onClick={() => handleToggle(privilege.key)}
                                  className={`relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ring-offset-2 focus:ring-1 focus:ring-indigo-500 ${
                                    value ? 'bg-indigo-600' : 'bg-slate-200'
                                  } ${!isEditable ? 'opacity-40 cursor-not-allowed' : ''}`}
                                >
                                  <span
                                    aria-hidden="true"
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-180 ease-in-out ${
                                      value ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
