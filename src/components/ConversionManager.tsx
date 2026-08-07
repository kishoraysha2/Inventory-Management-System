import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Scale, 
  Plus, 
  Search, 
  Filter, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  RefreshCw, 
  Ban, 
  ArrowRight, 
  Package, 
  Layers, 
  Info,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Sparkles
} from 'lucide-react';
import { UnitConversion, Product, UnitMaster } from '../types';
import { UnitConversionService } from '../services/unitConversionService';
import { UnitBadge } from './ui/UnitBadge';
import { formatConversionText } from '../lib/unitConversion';

interface ConversionManagerProps {
  products: Product[];
  units: UnitMaster[];
  userRole: string;
  permissions?: any;
}

export const ConversionManager: React.FC<ConversionManagerProps> = ({
  products,
  units,
  userRole,
}) => {
  const isAuthorized = userRole === 'owner' || userRole === 'admin';

  const [conversions, setConversions] = useState<UnitConversion[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedProductId, setSelectedProductId] = useState<string>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConversion, setEditingConversion] = useState<UnitConversion | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form Fields
  const [formProductId, setFormProductId] = useState('');
  const [formAlternateUnitId, setFormAlternateUnitId] = useState('');
  const [formConversionFactor, setFormConversionFactor] = useState('');
  const [formStatus, setFormStatus] = useState<'active' | 'inactive'>('active');
  const [formDescription, setFormDescription] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Real-time Firestore sync
  useEffect(() => {
    setLoading(true);
    const unsubscribe = UnitConversionService.subscribeAllConversions(
      (data) => {
        setConversions(data);
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to unit conversions:', err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Selected Product object for Form
  const selectedFormProduct = useMemo(() => {
    return products.find((p) => p.id === formProductId);
  }, [products, formProductId]);

  // Handle opening Create modal
  const handleOpenCreateModal = () => {
    setEditingConversion(null);
    setFormProductId(products[0]?.id || '');
    setFormAlternateUnitId('');
    setFormConversionFactor('');
    setFormStatus('active');
    setFormDescription('');
    setFormError(null);
    setIsModalOpen(true);
  };

  // Handle opening Edit modal
  const handleOpenEditModal = (conversion: UnitConversion) => {
    setEditingConversion(conversion);
    setFormProductId(conversion.productId);
    setFormAlternateUnitId(conversion.alternateUnitId);
    setFormConversionFactor(String(conversion.conversionFactor));
    setFormStatus(conversion.status || 'active');
    setFormDescription(conversion.description || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  // Handle Form Submission
  const handleSaveConversion = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formProductId) {
      setFormError('Please select a product.');
      return;
    }

    const prod = products.find((p) => p.id === formProductId);
    if (!prod) {
      setFormError('Selected product not found.');
      return;
    }

    const baseUnitCode = prod.unitCode || 'PCS';
    const baseUnitId = prod.unitId || 'pcs';

    if (!formAlternateUnitId) {
      setFormError('Please select an Alternate Unit.');
      return;
    }

    const altUnit = units.find((u) => u.id === formAlternateUnitId || u.unitCode === formAlternateUnitId);
    if (!altUnit) {
      setFormError('Selected alternate unit is invalid.');
      return;
    }

    const numFactor = parseFloat(formConversionFactor);
    if (isNaN(numFactor) || numFactor <= 0) {
      setFormError('Conversion Factor must be a positive number greater than 0.');
      return;
    }

    const payload: Omit<UnitConversion, 'id' | 'createdAt' | 'updatedAt'> = {
      productId: prod.id,
      productName: prod.name,
      productSku: prod.sku,
      baseUnitId: baseUnitId,
      baseUnitCode: baseUnitCode,
      alternateUnitId: altUnit.id,
      alternateUnitCode: altUnit.unitCode,
      conversionFactor: numFactor,
      direction: 'multiply',
      status: formStatus,
      isActive: formStatus === 'active',
      description: formDescription,
    };

    const validation = UnitConversionService.validateConversion(
      { ...payload, id: editingConversion?.id },
      conversions
    );

    if (!validation.valid) {
      setFormError(validation.error || 'Validation failed.');
      return;
    }

    setSaving(true);
    try {
      if (editingConversion) {
        await UnitConversionService.updateConversion(editingConversion.id, payload, conversions);
        setFeedback({ type: 'success', message: 'Conversion rule updated successfully.' });
      } else {
        await UnitConversionService.createConversion(payload, conversions);
        setFeedback({ type: 'success', message: 'New conversion rule created successfully.' });
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to save conversion rule.');
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  // Toggle active/inactive status
  const handleToggleStatus = async (conversion: UnitConversion) => {
    if (!isAuthorized) return;
    const nextStatus = conversion.status === 'active' ? 'inactive' : 'active';
    try {
      await UnitConversionService.updateConversion(conversion.id, { status: nextStatus });
      setFeedback({
        type: 'success',
        message: `Conversion status changed to ${nextStatus}.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update status.' });
    } finally {
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  // Delete Conversion
  const handleDeleteConversion = async (id: string, code: string) => {
    if (!isAuthorized) return;
    if (!window.confirm(`Are you sure you want to delete conversion for "${code}"?`)) return;

    try {
      await UnitConversionService.deleteConversion(id);
      setFeedback({ type: 'success', message: 'Conversion rule deleted.' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to delete conversion.' });
    } finally {
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  // Filtered Conversions List
  const filteredConversions = useMemo(() => {
    return conversions.filter((item) => {
      // Product Filter
      if (selectedProductId !== 'all' && item.productId !== selectedProductId) return false;

      // Status Filter
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;

      // Search Query
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const pName = (item.productName || '').toLowerCase();
        const pSku = (item.productSku || '').toLowerCase();
        const bCode = (item.baseUnitCode || '').toLowerCase();
        const aCode = (item.alternateUnitCode || '').toLowerCase();
        return pName.includes(q) || pSku.includes(q) || bCode.includes(q) || aCode.includes(q);
      }

      return true;
    });
  }, [conversions, selectedProductId, statusFilter, searchQuery]);

  // Paginated List
  const totalPages = Math.ceil(filteredConversions.length / pageSize) || 1;
  const paginatedConversions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredConversions.slice(start, start + pageSize);
  }, [filteredConversions, currentPage, pageSize]);

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="bg-white rounded-2xl p-5 md:p-6 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center shadow-md shadow-indigo-100 font-bold">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Unit Conversion Manager</h2>
              <span className="bg-indigo-50 text-indigo-700 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-indigo-200">
                Sprint 4 Infrastructure
              </span>
            </div>
            <p className="text-xs md:text-sm text-slate-500 mt-0.5">
              Manage product-level alternate units and conversion factors across your catalog
            </p>
          </div>
        </div>

        {isAuthorized && (
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs md:text-sm rounded-xl transition-all shadow-sm hover:shadow-md cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add Unit Conversion</span>
          </button>
        )}
      </div>

      {/* FEEDBACK BANNER */}
      {feedback && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className={`p-4 rounded-xl flex items-center justify-between gap-3 text-xs md:text-sm font-semibold border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {/* CONTROLS BAR */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search product, SKU or unit..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 text-xs md:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {/* Product Filter */}
          <select
            value={selectedProductId}
            onChange={(e) => {
              setSelectedProductId(e.target.value);
              setCurrentPage(1);
            }}
            className="text-xs md:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as any);
              setCurrentPage(1);
            }}
            className="text-xs md:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* TABLE SECTION */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
            <span className="text-xs font-semibold">Loading conversion rules...</span>
          </div>
        ) : filteredConversions.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400 mb-3">
              <Scale className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No Conversion Rules Found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {searchQuery || selectedProductId !== 'all' || statusFilter !== 'all'
                ? 'No unit conversion rules match your search or filter criteria.'
                : 'No unit conversion rules have been defined yet.'}
            </p>
            {isAuthorized && (
              <button
                onClick={handleOpenCreateModal}
                className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create First Conversion</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-5">Product Details</th>
                  <th className="py-3.5 px-5 text-center">Base Unit</th>
                  <th className="py-3.5 px-5 text-center">Alternate Unit</th>
                  <th className="py-3.5 px-5 text-center">Conversion Rule</th>
                  <th className="py-3.5 px-5 text-center">Status</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs md:text-sm">
                {paginatedConversions.map((conv) => {
                  const prod = products.find((p) => p.id === conv.productId);
                  const pName = conv.productName || prod?.name || 'Unknown Product';
                  const pSku = conv.productSku || prod?.sku || 'N/A';

                  return (
                    <tr key={conv.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Product */}
                      <td className="py-3.5 px-5">
                        <div className="font-bold text-slate-900">{pName}</div>
                        <div className="font-mono text-[10px] text-indigo-600 font-semibold mt-0.5">
                          SKU: {pSku}
                        </div>
                      </td>

                      {/* Base Unit */}
                      <td className="py-3.5 px-5 text-center">
                        <UnitBadge unitCode={conv.baseUnitCode} size="md" />
                      </td>

                      {/* Alternate Unit */}
                      <td className="py-3.5 px-5 text-center">
                        <UnitBadge unitCode={conv.alternateUnitCode} size="md" />
                      </td>

                      {/* Formula */}
                      <td className="py-3.5 px-5 text-center">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50/80 text-indigo-900 border border-indigo-200/70 rounded-lg font-mono font-bold text-xs">
                          {formatConversionText(conv)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-5 text-center">
                        <button
                          onClick={() => handleToggleStatus(conv)}
                          disabled={!isAuthorized}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                            conv.status === 'active'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              conv.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                          />
                          <span className="capitalize">{conv.status}</span>
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isAuthorized && (
                            <>
                              <button
                                onClick={() => handleOpenEditModal(conv)}
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Edit Conversion"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteConversion(conv.id, conv.alternateUnitCode)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Delete Conversion"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGINATION FOOTER */}
        {totalPages > 1 && (
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> ({filteredConversions.length} total)
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE / EDIT CONVERSION MODAL */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                    <Scale className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {editingConversion ? 'Edit Conversion Rule' : 'New Unit Conversion'}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Configure product alternate unit ratio
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleSaveConversion} className="p-6 space-y-4">
                {formError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Select Product */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Select Product <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formProductId}
                    onChange={(e) => setFormProductId(e.target.value)}
                    disabled={!!editingConversion}
                    className="w-full text-xs md:text-sm bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Choose Product --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku}) [Base: {p.unitCode || 'PCS'}]
                      </option>
                    ))}
                  </select>
                </div>

                {/* Base Unit Readonly */}
                {selectedFormProduct && (
                  <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100 flex items-center justify-between text-xs">
                    <span className="font-semibold text-indigo-900">Base Inventory Unit:</span>
                    <UnitBadge unitCode={selectedFormProduct.unitCode || 'PCS'} size="sm" />
                  </div>
                )}

                {/* Select Alternate Unit */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Alternate Packaging Unit <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formAlternateUnitId}
                    onChange={(e) => setFormAlternateUnitId(e.target.value)}
                    className="w-full text-xs md:text-sm bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Choose Alternate Unit --</option>
                    {units
                      .filter((u) => u.unitCode !== selectedFormProduct?.unitCode)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.unitName} ({u.unitCode})
                        </option>
                      ))}
                  </select>
                </div>

                {/* Conversion Factor */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Conversion Factor (Ratio) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      min="0.0001"
                      placeholder="e.g. 24 or 50"
                      value={formConversionFactor}
                      onChange={(e) => setFormConversionFactor(e.target.value)}
                      className="w-full text-xs md:text-sm bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  {selectedFormProduct && formAlternateUnitId && formConversionFactor && (
                    <p className="text-[11px] text-indigo-700 font-semibold mt-1.5 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-indigo-500" />
                      Formula: 1{' '}
                      {units.find((u) => u.id === formAlternateUnitId || u.unitCode === formAlternateUnitId)
                        ?.unitCode || 'ALT'}{' '}
                      = {formConversionFactor} {selectedFormProduct.unitCode || 'PCS'}
                    </p>
                  )}
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Status</label>
                  <div className="flex items-center gap-4">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="status"
                        value="active"
                        checked={formStatus === 'active'}
                        onChange={() => setFormStatus('active')}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Active</span>
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="status"
                        value="inactive"
                        checked={formStatus === 'inactive'}
                        onChange={() => setFormStatus('inactive')}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Inactive</span>
                    </label>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Description / Note <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Standard wholesale master carton"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Form Actions */}
                <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Rule</span>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
