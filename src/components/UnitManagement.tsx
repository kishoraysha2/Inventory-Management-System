import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Scale,
  Plus,
  Search,
  Filter,
  Shield,
  ShieldAlert,
  Edit,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  Archive,
  RotateCcw,
  Ban,
  Lock,
  Globe,
  Hash,
  Info,
  Layers,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { UnitMaster, UnitCategory, UnitStatus, Product } from '../types';
import { INITIAL_UNITS } from '../data/defaultUnits';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, setDoc, deleteDoc, writeBatch, collection } from 'firebase/firestore';
import { ConversionManager } from './ConversionManager';

interface UnitManagementProps {
  userRole: string;
  permissions: any;
  units: UnitMaster[];
  setUnits: React.Dispatch<React.SetStateAction<UnitMaster[]>>;
  products?: Product[];
}

const CATEGORY_COLORS: Record<string, string> = {
  Packaging: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  Quantity: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  Weight: 'bg-amber-50 border-amber-200 text-amber-700',
  Liquid: 'bg-cyan-50 border-cyan-200 text-cyan-700',
  Length: 'bg-purple-50 border-purple-200 text-purple-700',
  Area: 'bg-rose-50 border-rose-200 text-rose-700',
  Volume: 'bg-blue-50 border-blue-200 text-blue-700',
};

export const UnitManagement: React.FC<UnitManagementProps> = ({
  userRole,
  permissions,
  units,
  setUnits,
  products = [],
}) => {
  const isAuthorizedToEdit = userRole === 'owner' || userRole === 'admin';

  // Sub-tab state
  const [activeSubTab, setActiveSubTab] = useState<'master' | 'conversions'>('master');

  // State Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('active');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<UnitMaster | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form Fields
  const [formData, setFormData] = useState<{
    unitName: string;
    unitCode: string;
    symbol: string;
    category: UnitCategory;
    status: UnitStatus;
    description: string;
    sortOrder: number;
    allowDecimal: boolean;
    decimalPlaces: number;
    translationsEn: string;
    translationsAr: string;
    translationsBn: string;
  }>({
    unitName: '',
    unitCode: '',
    symbol: '',
    category: 'Packaging',
    status: 'active',
    description: '',
    sortOrder: 1,
    allowDecimal: false,
    decimalPlaces: 0,
    translationsEn: '',
    translationsAr: '',
    translationsBn: '',
  });

  // Calculate Metrics
  const metrics = useMemo(() => {
    const total = units.length;
    const active = units.filter((u) => u.status === 'active').length;
    const inactive = units.filter((u) => u.status === 'inactive').length;
    const archived = units.filter((u) => u.status === 'archived').length;
    const system = units.filter((u) => u.isSystem).length;
    const custom = units.filter((u) => !u.isSystem).length;
    const decimal = units.filter((u) => u.allowDecimal).length;

    return { total, active, inactive, archived, system, custom, decimal };
  }, [units]);

  // Categories list
  const categoriesList = useMemo(() => {
    const set = new Set<string>(['Packaging', 'Quantity', 'Weight', 'Liquid', 'Length', 'Area', 'Volume']);
    units.forEach((u) => set.add(u.category));
    return ['All', ...Array.from(set)];
  }, [units]);

  // Filtered Units
  const filteredUnits = useMemo(() => {
    return units
      .filter((unit) => {
        // Status filter
        if (selectedStatus !== 'all' && unit.status !== selectedStatus) {
          return false;
        }

        // Category filter
        if (selectedCategory !== 'All' && unit.category !== selectedCategory) {
          return false;
        }

        // Search query
        if (search.trim()) {
          const q = search.toLowerCase().trim();
          const matchCode = unit.unitCode.toLowerCase().includes(q);
          const matchName = unit.unitName.toLowerCase().includes(q);
          const matchSymbol = unit.symbol.toLowerCase().includes(q);
          const matchDesc = unit.description?.toLowerCase().includes(q) || false;
          return matchCode || matchName || matchSymbol || matchDesc;
        }

        return true;
      })
      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
  }, [units, selectedCategory, selectedStatus, search]);

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingUnit(null);
    setFormError(null);
    setFormData({
      unitName: '',
      unitCode: '',
      symbol: '',
      category: 'Packaging',
      status: 'active',
      description: '',
      sortOrder: (units.length || 0) + 1,
      allowDecimal: false,
      decimalPlaces: 0,
      translationsEn: '',
      translationsAr: '',
      translationsBn: '',
    });
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (unit: UnitMaster) => {
    setEditingUnit(unit);
    setFormError(null);
    setFormData({
      unitName: unit.unitName,
      unitCode: unit.unitCode,
      symbol: unit.symbol,
      category: unit.category,
      status: unit.status,
      description: unit.description || '',
      sortOrder: unit.sortOrder ?? 1,
      allowDecimal: unit.allowDecimal,
      decimalPlaces: unit.decimalPlaces ?? 0,
      translationsEn: unit.translations?.en || '',
      translationsAr: unit.translations?.ar || '',
      translationsBn: unit.translations?.bn || '',
    });
    setIsModalOpen(true);
  };

  // Save Unit (Create or Edit)
  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const code = formData.unitCode.trim().toUpperCase();
    const name = formData.unitName.trim();
    const symbol = formData.symbol.trim();

    if (!code) {
      setFormError('Unit Code is required.');
      return;
    }
    if (!name) {
      setFormError('Unit Name is required.');
      return;
    }
    if (!symbol) {
      setFormError('Symbol is required.');
      return;
    }

    // Case-Insensitive Duplicate Validation
    const duplicateCode = units.find(
      (u) => (!editingUnit || u.id !== editingUnit.id) && u.unitCode.toLowerCase().trim() === code.toLowerCase()
    );
    if (duplicateCode) {
      setFormError(`Unit Code "${code}" already exists (case-insensitive duplicate). Code must be unique.`);
      return;
    }

    const duplicateName = units.find(
      (u) => (!editingUnit || u.id !== editingUnit.id) && u.unitName.toLowerCase().trim() === name.toLowerCase()
    );
    if (duplicateName) {
      setFormError(`Unit Name "${name}" already exists (case-insensitive duplicate). Name must be unique.`);
      return;
    }

    const now = new Date().toISOString();
    const newUnit: UnitMaster = {
      id: editingUnit ? editingUnit.id : `unit_${code.toLowerCase()}_${Date.now()}`,
      unitName: name,
      unitCode: code,
      symbol: symbol,
      category: formData.category,
      status: formData.status,
      description: formData.description.trim() || undefined,
      createdAt: editingUnit ? editingUnit.createdAt : now,
      updatedAt: now,
      createdBy: editingUnit ? editingUnit.createdBy : userRole.toUpperCase(),
      isSystem: editingUnit ? editingUnit.isSystem : false,
      isDefault: editingUnit ? editingUnit.isDefault : false,
      sortOrder: Number(formData.sortOrder) || 1,
      allowDecimal: formData.allowDecimal,
      decimalPlaces: formData.allowDecimal ? Number(formData.decimalPlaces) || 0 : 0,
      badgeColor: CATEGORY_COLORS[formData.category] ? formData.category.toLowerCase() : 'indigo',
      translations: {
        en: formData.translationsEn.trim() || name,
        ar: formData.translationsAr.trim() || undefined,
        bn: formData.translationsBn.trim() || undefined,
      },
    };

    try {
      // Save to Firestore
      const docRef = doc(db, 'units', newUnit.id);
      await setDoc(docRef, newUnit, { merge: true });

      // Update state & localStorage
      setUnits((prev) => {
        const index = prev.findIndex((u) => u.id === newUnit.id);
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = newUnit;
          return updated;
        }
        return [newUnit, ...prev];
      });

      setFeedback({
        type: 'success',
        message: editingUnit
          ? `Unit "${newUnit.unitCode}" successfully updated.`
          : `Master Unit "${newUnit.unitCode}" successfully cataloged.`,
      });
      setIsModalOpen(false);
    } catch (err: any) {
      let friendlyMsg = 'Failed to persist Unit record to Firestore.';
      try {
        handleFirestoreError(err, editingUnit ? OperationType.UPDATE : OperationType.CREATE, `units/${newUnit.id}`);
      } catch (loggingErr: any) {
        if (loggingErr?.message?.includes('permission-denied') || err?.code === 'permission-denied') {
          friendlyMsg = 'Insufficient permission: Your clearance level does not allow modifying units in Firestore.';
        } else {
          friendlyMsg = err?.message || loggingErr?.message || friendlyMsg;
        }
      }
      setFormError(friendlyMsg);
    }
  };

  // Toggle Status (Disable / Active)
  const handleToggleStatus = async (unit: UnitMaster, newStatus: UnitStatus) => {
    if (!isAuthorizedToEdit) return;

    try {
      const updatedUnit = { ...unit, status: newStatus, updatedAt: new Date().toISOString() };
      await setDoc(doc(db, 'units', unit.id), updatedUnit, { merge: true });

      setUnits((prev) => prev.map((u) => (u.id === unit.id ? updatedUnit : u)));
      setFeedback({
        type: 'success',
        message: `Unit "${unit.unitCode}" status changed to ${newStatus.toUpperCase()}.`,
      });
    } catch (err: any) {
      let friendlyMsg = 'Failed to update unit status in Firestore.';
      try {
        handleFirestoreError(err, OperationType.UPDATE, `units/${unit.id}`);
      } catch (loggingErr: any) {
        if (loggingErr?.message?.includes('permission-denied') || err?.code === 'permission-denied') {
          friendlyMsg = 'Insufficient permission: Cannot update unit status in Firestore.';
        } else {
          friendlyMsg = err?.message || loggingErr?.message || friendlyMsg;
        }
      }
      setFeedback({ type: 'error', message: friendlyMsg });
    }
  };

  // Delete Unit (Blocked for System Units)
  const handleDeleteUnit = async (unit: UnitMaster) => {
    if (!isAuthorizedToEdit) return;

    if (unit.isSystem) {
      setFeedback({
        type: 'error',
        message: `System Unit "${unit.unitCode}" is protected and cannot be hard deleted. You may disable or archive it instead.`,
      });
      return;
    }

    if (!window.confirm(`Are you sure you want to permanently delete Unit "${unit.unitCode} - ${unit.unitName}"?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'units', unit.id));
      setUnits((prev) => prev.filter((u) => u.id !== unit.id));
      setFeedback({
        type: 'success',
        message: `Custom Unit "${unit.unitCode}" deleted successfully.`,
      });
    } catch (err: any) {
      let friendlyMsg = 'Failed to delete unit from Firestore.';
      try {
        handleFirestoreError(err, OperationType.DELETE, `units/${unit.id}`);
      } catch (loggingErr: any) {
        if (loggingErr?.message?.includes('permission-denied') || err?.code === 'permission-denied') {
          friendlyMsg = 'Insufficient permission: Cannot delete unit from Firestore.';
        } else {
          friendlyMsg = err?.message || loggingErr?.message || friendlyMsg;
        }
      }
      setFeedback({ type: 'error', message: friendlyMsg });
    }
  };

  // Seed Default Unit Library
  const handleSeedDefaultLibrary = async () => {
    if (!isAuthorizedToEdit) return;
    setIsSeeding(true);

    try {
      const currentUser = auth.currentUser;
      const uid = currentUser?.uid || '';
      const email = currentUser?.email || '';

      console.log('----------------------------------');
      console.log('AUTH');
      console.log('auth.currentUser.uid:', uid);
      console.log('auth.currentUser.email:', email);
      console.log('----------------------------------');

      console.log('USER DOCUMENT');
      let userDocExists = false;
      let userDocData: any = null;
      if (uid) {
        const userSnap = await getDoc(doc(db, 'users', uid));
        userDocExists = userSnap.exists();
        if (userDocExists) {
          userDocData = userSnap.data();
        }
      }
      console.log('exists():', userDocExists ? 'TRUE' : 'FALSE');
      if (userDocExists) {
        console.log('userDoc JSON:', JSON.stringify(userDocData, null, 2));
      }

      console.log('----------------------------------');
      console.log('RULE INPUT');
      console.log('role:', userDocData?.role || 'N/A');
      console.log('status:', userDocData?.status || 'N/A');

      console.log('----------------------------------');
      console.log('BATCH');
      console.log('INITIAL_UNITS.length:', INITIAL_UNITS.length);
      console.log('First document:', JSON.stringify(INITIAL_UNITS[0], null, 2));
      console.log('Last document:', JSON.stringify(INITIAL_UNITS[INITIAL_UNITS.length - 1], null, 2));

      console.log('----------------------------------');
      console.log('WRITE TEST');
      const now = new Date().toISOString();
      const testDocRef = doc(db, 'units', 'debug_test');
      const testData = {
        id: 'debug_test',
        unitCode: 'TEST',
        unitName: 'Debug Test Unit',
        category: 'Quantity',
        status: 'Active',
        isSystem: false,
        createdAt: now,
        updatedAt: now
      };

      try {
        await setDoc(testDocRef, testData);
        console.log('Isolated write test to units/debug_test: SUCCESS');
      } catch (writeErr: any) {
        console.error('Isolated write test to units/debug_test: FAILED');
        console.error('Complete Firestore Exception:', writeErr);
        console.error('error.code:', writeErr?.code);
        console.error('error.message:', writeErr?.message);
        setFeedback({
          type: 'error',
          message: `Single write test failed: [${writeErr?.code}] ${writeErr?.message}`,
        });
        setIsSeeding(false);
        return; // Do NOT continue batch
      }

      // If single write succeeded, perform batch
      const batch = writeBatch(db);
      INITIAL_UNITS.forEach((unit) => {
        const existing = units.find((u) => u.unitCode.toLowerCase() === unit.unitCode.toLowerCase());
        const docRef = doc(db, 'units', existing ? existing.id : unit.id);
        const dataToSave = existing
          ? { ...unit, ...existing, isSystem: true, updatedAt: now }
          : { ...unit, createdAt: now, updatedAt: now };
        batch.set(docRef, dataToSave, { merge: true });
      });

      try {
        await batch.commit();
        console.log('batch.commit(): SUCCESS');
      } catch (batchErr: any) {
        console.error('batch.commit(): FAILED');
        console.error('Complete Firestore Exception:', batchErr);
        console.error('error.code:', batchErr?.code);
        console.error('error.message:', batchErr?.message);
        throw batchErr;
      }

      // Refresh units in local state
      setUnits((prev) => {
        const mergedMap = new Map<string, UnitMaster>();
        prev.forEach((u) => mergedMap.set(u.id, u));
        INITIAL_UNITS.forEach((u) => {
          if (!mergedMap.has(u.id)) {
            mergedMap.set(u.id, u);
          }
        });
        return Array.from(mergedMap.values());
      });

      setFeedback({
        type: 'success',
        message: `Successfully seeded enterprise master unit library (${INITIAL_UNITS.length} system units cataloged).`,
      });
    } catch (err: any) {
      let friendlyMsg = 'Failed to seed default unit library to Firestore.';
      if (err?.code === 'permission-denied') {
        friendlyMsg = `Permission Denied [${err.code}]: ${err.message}`;
      } else {
        friendlyMsg = err?.message || friendlyMsg;
      }
      setFeedback({ type: 'error', message: friendlyMsg });
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div id="unit-management-container" className="space-y-6">
      {/* BREADCRUMB & PAGE HEADER */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
            <span>Administration</span>
            <ChevronRight className="h-3 w-3 text-slate-300" />
            <span>Master Data</span>
            <ChevronRight className="h-3 w-3 text-slate-300" />
            <span className="text-indigo-600">Unit Management</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-md shrink-0">
              <Scale className="h-5.5 w-5.5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
                Enterprise Master Unit Management
                <span className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-indigo-700 tracking-wider">
                  Sprint 1 Foundation
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                Standardized master units registry for inventory, procurement, sales, and packaging.
              </p>
            </div>
          </div>
        </div>

        {/* TOP ACTION CONTROLS */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            id="seed-units-button"
            type="button"
            onClick={handleSeedDefaultLibrary}
            disabled={!isAuthorizedToEdit || isSeeding}
            title={!isAuthorizedToEdit ? 'Only Owner/Admin can seed unit library' : 'Seed default enterprise unit library'}
            className={`inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-2xs active:scale-98 ${
              !isAuthorizedToEdit ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <RefreshCw className={`h-3.5 w-3.5 text-indigo-600 ${isSeeding ? 'animate-spin' : ''}`} />
            <span>{isSeeding ? 'Seeding Library...' : 'Seed Enterprise Units'}</span>
          </button>

          <button
            id="add-unit-button"
            type="button"
            onClick={handleOpenAdd}
            disabled={!isAuthorizedToEdit}
            title={!isAuthorizedToEdit ? 'Only Owner/Admin can create Master Units' : 'Catalog a new Master Unit'}
            className={`inline-flex items-center gap-2 rounded-xl bg-indigo-600 border border-indigo-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs active:scale-98 ${
              !isAuthorizedToEdit ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <Plus className="h-4 w-4" />
            <span>Create Master Unit</span>
          </button>
        </div>
      </div>

      {/* SUB-NAVIGATION TABS */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
        <button
          onClick={() => setActiveSubTab('master')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all cursor-pointer ${
            activeSubTab === 'master'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Master Units Catalog</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
            activeSubTab === 'master' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {units.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('conversions')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs md:text-sm transition-all cursor-pointer ${
            activeSubTab === 'conversions'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>Unit Conversions</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
            activeSubTab === 'conversions' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            Manager
          </span>
        </button>
      </div>

      {activeSubTab === 'conversions' ? (
        <ConversionManager
          products={products}
          units={units}
          userRole={userRole}
          permissions={permissions}
        />
      ) : (
        <>
          {/* AUTHORIZATION NOTICE IF READ-ONLY */}
          {!isAuthorizedToEdit && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs font-medium text-amber-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Lock className="h-4 w-4 text-amber-600 shrink-0" />
                <span>
                  <strong>Read-Only Access Mode:</strong> Your clearance level (<span className="uppercase font-bold">{userRole}</span>) grants view access to Master Units. Creating, editing, or archiving units requires <strong>Owner</strong> or <strong>Admin</strong> privileges.
                </span>
              </div>
            </div>
          )}

      {/* FEEDBACK STATUS BANNER */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`rounded-xl border p-4 text-xs font-semibold flex items-center justify-between shadow-xs ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="h-4.5 w-4.5 text-rose-600 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-600 transition"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPI METRICS SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Units */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-slate-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Cataloged</span>
            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 font-mono">{metrics.total}</span>
            <span className="text-[10px] font-bold text-slate-500">{metrics.active} Active</span>
          </div>
          <div className="mt-2 text-[10px] text-slate-400 font-medium flex items-center justify-between">
            <span>Inactive: {metrics.inactive}</span>
            <span>Archived: {metrics.archived}</span>
          </div>
        </div>

        {/* System Protected Units */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-slate-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">System Protected</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <Shield className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 font-mono">{metrics.system}</span>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
              Protected
            </span>
          </div>
          <div className="mt-2 text-[10px] text-slate-400 font-medium">
            Core enterprise default library
          </div>
        </div>

        {/* Custom Units */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-slate-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Custom Units</span>
            <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 font-mono">{metrics.custom}</span>
            <span className="text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">
              User Defined
            </span>
          </div>
          <div className="mt-2 text-[10px] text-slate-400 font-medium">
            Created by business team
          </div>
        </div>

        {/* Decimal Enabled */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-slate-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Decimal Supported</span>
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
              <Hash className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900 font-mono">{metrics.decimal}</span>
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
              Fractional
            </span>
          </div>
          <div className="mt-2 text-[10px] text-slate-400 font-medium">
            Supports weight/volume precision
          </div>
        </div>
      </div>

      {/* TOOLBAR CONTROLS (SEARCH & FILTERS) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {[
              { id: 'active', label: 'Active', count: metrics.active },
              { id: 'inactive', label: 'Disabled', count: metrics.inactive },
              { id: 'archived', label: 'Archived', count: metrics.archived },
              { id: 'all', label: 'All Status', count: metrics.total },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedStatus(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                  selectedStatus === tab.id
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>{tab.label}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.25 rounded-full bg-slate-200/60 text-slate-600">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search & Category Filter */}
          <div className="flex flex-col sm:flex-row gap-2.5 flex-1 max-w-xl">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search unit code, name, symbol..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs outline-none focus:border-indigo-400 transition"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Category Select */}
            <div className="min-w-[150px]">
              <div className="relative">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-xs rounded-xl px-3 py-2 outline-none focus:border-indigo-400 pr-8 cursor-pointer"
                >
                  {categoriesList.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat === 'All' ? 'All Categories' : cat}
                    </option>
                  ))}
                </select>
                <Filter className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MASTER UNITS DATA GRID TABLE */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60 text-slate-400 font-bold uppercase text-[10px] tracking-wider select-none">
                <th className="p-4 w-16 text-center">#</th>
                <th className="p-4">Unit Code</th>
                <th className="p-4">Unit Name</th>
                <th className="p-4">Symbol</th>
                <th className="p-4">Category</th>
                <th className="p-4">Precision / Decimal</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUnits.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Scale className="h-10 w-10 text-slate-200" />
                      <p className="font-bold text-slate-600 text-sm">No Master Units match active filters</p>
                      <p className="text-xs text-slate-400 max-w-sm">
                        Try adjusting your search criteria or click "Seed Enterprise Units" to populate default unit library.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUnits.map((unit, idx) => {
                  const categoryStyle = CATEGORY_COLORS[unit.category] || 'bg-slate-50 border-slate-200 text-slate-700';

                  return (
                    <tr
                      key={unit.id}
                      className="group hover:bg-slate-50/60 transition-colors"
                    >
                      {/* Sort Order */}
                      <td className="p-4 text-center font-mono font-bold text-slate-400">
                        {unit.sortOrder ?? idx + 1}
                      </td>

                      {/* Unit Code & Badges */}
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-extrabold text-slate-900 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-lg text-xs uppercase tracking-wider">
                            {unit.unitCode}
                          </span>
                          {unit.isSystem ? (
                            <span
                              title="System Protected Unit (Cannot be hard deleted)"
                              className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.25 text-[9px] font-extrabold uppercase"
                            >
                              <Shield className="h-2.5 w-2.5" />
                              System
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 rounded px-1.5 py-0.25 text-[9px] font-extrabold uppercase">
                              Custom
                            </span>
                          )}
                          {unit.isDefault && (
                            <span className="inline-flex items-center bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.25 text-[9px] font-extrabold uppercase">
                              Default
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Unit Name & Translations */}
                      <td className="p-4">
                        <div>
                          <p className="font-bold text-slate-800 text-xs">{unit.unitName}</p>
                          {unit.description && (
                            <p className="text-[10px] text-slate-400 truncate max-w-xs mt-0.5">
                              {unit.description}
                            </p>
                          )}
                          {unit.translations && (unit.translations.ar || unit.translations.bn) && (
                            <div className="flex gap-2 text-[9px] text-slate-400 font-mono mt-0.5">
                              {unit.translations.ar && <span>🇸🇦 {unit.translations.ar}</span>}
                              {unit.translations.bn && <span>🇧🇩 {unit.translations.bn}</span>}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Symbol */}
                      <td className="p-4">
                        <span className="font-mono font-bold text-indigo-700 bg-indigo-50/70 border border-indigo-100 rounded px-2 py-0.5 text-xs">
                          {unit.symbol}
                        </span>
                      </td>

                      {/* Category */}
                      <td className="p-4">
                        <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ${categoryStyle}`}>
                          {unit.category}
                        </span>
                      </td>

                      {/* Decimal Precision */}
                      <td className="p-4">
                        {unit.allowDecimal ? (
                          <span className="inline-flex items-center gap-1 font-mono text-slate-700 text-[11px] font-bold">
                            <Hash className="h-3 w-3 text-amber-500" />
                            <span>Fractional ({unit.decimalPlaces} decimals)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-mono text-slate-400 text-[11px]">
                            <span>Integer Only (0 dp)</span>
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="p-4 text-center">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${
                            unit.status === 'active'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : unit.status === 'inactive'
                              ? 'bg-amber-50 border-amber-200 text-amber-700'
                              : 'bg-slate-100 border-slate-200 text-slate-600'
                          }`}
                        >
                          <span
                            className={`mr-1 h-1.5 w-1.5 rounded-full ${
                              unit.status === 'active'
                                ? 'bg-emerald-500'
                                : unit.status === 'inactive'
                                ? 'bg-amber-500'
                                : 'bg-slate-400'
                            }`}
                          />
                          {unit.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Edit Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(unit)}
                            disabled={!isAuthorizedToEdit}
                            title={!isAuthorizedToEdit ? 'Permission required to edit' : 'Edit Unit Parameters'}
                            className={`p-1.5 rounded-lg border border-slate-200 bg-white transition shadow-2xs ${
                              !isAuthorizedToEdit
                                ? 'opacity-40 cursor-not-allowed text-slate-300'
                                : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200'
                            }`}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>

                          {/* Toggle Active / Disable */}
                          {unit.status === 'active' ? (
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(unit, 'inactive')}
                              disabled={!isAuthorizedToEdit}
                              title={!isAuthorizedToEdit ? 'Permission required' : 'Disable Unit'}
                              className={`p-1.5 rounded-lg border border-slate-200 bg-white transition shadow-2xs ${
                                !isAuthorizedToEdit
                                  ? 'opacity-40 cursor-not-allowed text-slate-300'
                                  : 'text-slate-500 hover:text-amber-600 hover:bg-amber-50 hover:border-amber-200'
                              }`}
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(unit, 'active')}
                              disabled={!isAuthorizedToEdit}
                              title={!isAuthorizedToEdit ? 'Permission required' : 'Activate Unit'}
                              className={`p-1.5 rounded-lg border border-slate-200 bg-white transition shadow-2xs ${
                                !isAuthorizedToEdit
                                  ? 'opacity-40 cursor-not-allowed text-slate-300'
                                  : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 hover:border-emerald-200'
                              }`}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {/* Archive */}
                          {unit.status !== 'archived' ? (
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(unit, 'archived')}
                              disabled={!isAuthorizedToEdit || unit.isSystem}
                              title={
                                unit.isSystem
                                  ? 'System units cannot be archived'
                                  : !isAuthorizedToEdit
                                  ? 'Permission required'
                                  : 'Archive Unit'
                              }
                              className={`p-1.5 rounded-lg border border-slate-200 bg-white transition shadow-2xs ${
                                !isAuthorizedToEdit || unit.isSystem
                                  ? 'opacity-30 cursor-not-allowed text-slate-300'
                                  : 'text-slate-500 hover:text-purple-600 hover:bg-purple-50 hover:border-purple-200'
                              }`}
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </button>
                          ) : null}

                          {/* Delete (Blocked for System Units) */}
                          <button
                            type="button"
                            onClick={() => handleDeleteUnit(unit)}
                            disabled={!isAuthorizedToEdit || unit.isSystem}
                            title={
                              unit.isSystem
                                ? 'System-protected units cannot be hard deleted'
                                : !isAuthorizedToEdit
                                ? 'Permission required'
                                : 'Delete Unit'
                            }
                            className={`p-1.5 rounded-lg border border-slate-200 bg-white transition shadow-2xs ${
                              !isAuthorizedToEdit || unit.isSystem
                                ? 'opacity-30 cursor-not-allowed text-slate-300'
                                : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200'
                            }`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* TABLE FOOTER SUMMARY */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-medium">
          <span>Showing {filteredUnits.length} of {units.length} Master Units</span>
          <span className="font-mono text-slate-400">Master Data Infrastructure • Sprint 1</span>
        </div>
      </div>

      {/* CREATE / EDIT UNIT MODAL */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-lg bg-white border border-slate-200 rounded-[2rem] p-6 sm:p-8 shadow-2xl relative text-slate-800 my-8"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                    <Scale className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-sans text-base font-black text-slate-900 uppercase tracking-tight">
                      {editingUnit ? `Edit Master Unit: ${editingUnit.unitCode}` : 'Create New Master Unit'}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">
                      Configure unit parameters, decimal precision, and translations
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-full p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Form Validation Error Banner */}
              {formError && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Modal Form */}
              <form onSubmit={handleSaveUnit} className="py-4 space-y-4 text-xs font-sans">
                {/* Code & Symbol Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Unit Code <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. CTN, PCS, KG"
                      value={formData.unitCode}
                      onChange={(e) => setFormData({ ...formData, unitCode: e.target.value.toUpperCase() })}
                      disabled={editingUnit?.isSystem}
                      className="w-full bg-slate-50 border border-slate-200 font-mono font-bold text-slate-900 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 disabled:opacity-50 uppercase"
                      required
                    />
                    {editingUnit?.isSystem && (
                      <span className="text-[9px] text-slate-400 block mt-0.5">System unit code protected</span>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Symbol / Abbreviation <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. ctn, pcs, kg"
                      value={formData.symbol}
                      onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 font-mono font-bold text-indigo-700 rounded-xl px-3 py-2 outline-none focus:border-indigo-400"
                      required
                    />
                  </div>
                </div>

                {/* Unit Name */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Unit Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Carton, Kilogram, Pieces"
                    value={formData.unitName}
                    onChange={(e) => setFormData({ ...formData, unitName: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 font-bold text-slate-800 rounded-xl px-3 py-2 outline-none focus:border-indigo-400"
                    required
                  />
                </div>

                {/* Category & Status Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Category <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value as UnitCategory })}
                      className="w-full bg-slate-50 border border-slate-200 font-semibold text-slate-700 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 cursor-pointer"
                    >
                      <option value="Packaging">Packaging</option>
                      <option value="Quantity">Quantity</option>
                      <option value="Weight">Weight</option>
                      <option value="Liquid">Liquid</option>
                      <option value="Length">Length</option>
                      <option value="Area">Area</option>
                      <option value="Volume">Volume</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Status
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as UnitStatus })}
                      className="w-full bg-slate-50 border border-slate-200 font-semibold text-slate-700 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 cursor-pointer"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Disabled</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>

                {/* Sort Order & Decimal Options */}
                <div className="bg-slate-50/70 border border-slate-150 rounded-2xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="block text-xs font-extrabold text-slate-800">Decimal Precision Support</span>
                      <span className="text-[10px] text-slate-400">Allow fractional stock quantities (e.g. 1.250 KG)</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.allowDecimal}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          allowDecimal: e.target.checked,
                          decimalPlaces: e.target.checked ? 2 : 0,
                        })
                      }
                      className="h-4 w-4 text-indigo-600 rounded cursor-pointer"
                    />
                  </div>

                  {formData.allowDecimal && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Decimal Places (Precision)
                      </label>
                      <select
                        value={formData.decimalPlaces}
                        onChange={(e) => setFormData({ ...formData, decimalPlaces: Number(e.target.value) })}
                        className="w-full bg-white border border-slate-200 font-mono font-bold text-slate-800 rounded-xl px-3 py-2 outline-none focus:border-indigo-400 cursor-pointer text-xs"
                      >
                        <option value={1}>1 Decimal Place (e.g. 1.5)</option>
                        <option value={2}>2 Decimal Places (e.g. 1.25)</option>
                        <option value={3}>3 Decimal Places (e.g. 1.250 - Standard KG/MT)</option>
                        <option value={4}>4 Decimal Places (High Precision)</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Sort Order / Hierarchy
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={formData.sortOrder}
                      onChange={(e) => setFormData({ ...formData, sortOrder: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-200 font-mono text-slate-800 rounded-xl px-3 py-2 outline-none focus:border-indigo-400"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Description / Technical Notes
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Provide usage description or packaging specifications..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl p-3 outline-none focus:border-indigo-400"
                  />
                </div>

                {/* Multilingual Translations Section */}
                <div className="border-t border-slate-100 pt-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-slate-600 font-bold">
                    <Globe className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Multilingual Localizations (Optional)</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-400 block mb-0.5">Arabic (🇸🇦 العربية)</span>
                      <input
                        type="text"
                        placeholder="e.g. كرتونة"
                        value={formData.translationsAr}
                        onChange={(e) => setFormData({ ...formData, translationsAr: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none"
                      />
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block mb-0.5">Bangla (🇧🇩 বাংলা)</span>
                      <input
                        type="text"
                        placeholder="e.g. কার্টন"
                        value={formData.translationsBn}
                        onChange={(e) => setFormData({ ...formData, translationsBn: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Modal Footer Actions */}
                <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition active:scale-98"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 border border-indigo-500 font-bold text-white hover:bg-indigo-700 transition shadow-xs active:scale-98"
                  >
                    {editingUnit ? 'Update Unit Record' : 'Save Master Unit'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
        </>
      )}
    </div>
  );
};

export default UnitManagement;
