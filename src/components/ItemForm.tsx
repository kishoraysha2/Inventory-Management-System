import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Save, AlertTriangle, Lock, Scale, Plus, Trash2, Edit3, CheckCircle2, Ban, RefreshCw, Sparkles, Barcode, QrCode, AlertCircle } from 'lucide-react';
import { Product, UnitMaster, UnitConversion, BarcodeType, BarcodeStatus, BarcodeSource } from '../types';
import { INITIAL_UNITS } from '../data/defaultUnits';
import { UnitConversionService } from '../services/unitConversionService';
import { BarcodeService } from '../services/barcodeService';
import { TranslationService } from '../services/translation/TranslationService';
import { UnitBadge } from './ui/UnitBadge';
import { formatConversionText } from '../lib/unitConversion';

import { AppPermissions } from '../hooks/usePermission';

interface ItemFormProps {
  id?: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Omit<Product, 'id' | 'createdDate'> & { id?: string }) => void;
  itemToEdit: Product | null;
  categories: string[];
  products?: Product[];
  permissions?: AppPermissions;
  units?: UnitMaster[];
}

export default function ItemForm({
  id = 'item-form-modal',
  isOpen,
  onClose,
  onSave,
  itemToEdit,
  categories,
  products = [],
  permissions,
  units,
}: ItemFormProps) {
  const activeUnits = useMemo(() => {
    const source = units && units.length > 0 ? units : INITIAL_UNITS;
    return source
      .filter((u) => u.status === 'active')
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.unitName.localeCompare(b.unitName));
  }, [units]);

  // Check if product has inventory movement/transactions
  const hasMovement = useMemo(() => {
    if (!itemToEdit) return false;
    // If currentStock > 0 or currentStock differs from initialStock, movement exists
    return itemToEdit.currentStock > 0 || (itemToEdit.initialStock !== undefined && itemToEdit.currentStock !== itemToEdit.initialStock);
  }, [itemToEdit]);

  const [formData, setFormData] = useState({
    name: '',
    nameArabic: '',
    sku: '',
    category: '',
    unitId: '',
    price: '',
    purchasePrice: '',
    quantity: '',
    minQuantity: '',
    supplierName: '',
    supplierEmail: '',
    location: '',
    description: '',
    barcode: '',
    barcodeType: 'CODE128' as BarcodeType,
    barcodeStatus: 'unassigned' as BarcodeStatus,
    barcodeSource: 'manual' as BarcodeSource,
    isBarcodeLocked: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [translationNotice, setTranslationNotice] = useState<{ type: 'success' | 'warning'; message: string } | null>(null);

  // Unit Conversions Section State
  const [productConversions, setProductConversions] = useState<UnitConversion[]>([]);
  const [loadingConversions, setLoadingConversions] = useState(false);
  const [showAddConvRow, setShowAddConvRow] = useState(false);
  const [convAltUnitId, setConvAltUnitId] = useState('');
  const [convFactor, setConvFactor] = useState('');
  const [convError, setConvError] = useState<string | null>(null);
  const [savingConv, setSavingConv] = useState(false);

  useEffect(() => {
    if (itemToEdit && isOpen) {
      setFormData({
        name: itemToEdit.name,
        nameArabic: itemToEdit.nameArabic || '',
        sku: itemToEdit.sku,
        category: itemToEdit.category,
        unitId: itemToEdit.unitId || activeUnits[0]?.id || '',
        price: itemToEdit.sellingPrice.toString(),
        purchasePrice: (itemToEdit.purchasePrice ?? (itemToEdit.sellingPrice * 0.6)).toString(),
        quantity: itemToEdit.currentStock.toString(),
        minQuantity: itemToEdit.minimumStockAlert.toString(),
        supplierName: itemToEdit.supplierName ?? '',
        supplierEmail: itemToEdit.supplierEmail ?? '',
        location: itemToEdit.location ?? '',
        description: itemToEdit.description ?? '',
        barcode: itemToEdit.barcode ?? '',
        barcodeType: itemToEdit.barcodeType ?? 'CODE128',
        barcodeStatus: itemToEdit.barcodeStatus ?? (itemToEdit.barcode ? 'assigned' : 'unassigned'),
        barcodeSource: itemToEdit.barcodeSource ?? 'manual',
        isBarcodeLocked: itemToEdit.isBarcodeLocked ?? false,
      });
      setErrors({});
      setTranslationNotice(null);

      // Fetch Unit Conversions for this Product
      setLoadingConversions(true);
      UnitConversionService.getConversionsByProduct(itemToEdit.id)
        .then((list) => {
          setProductConversions(list);
          setLoadingConversions(false);
        })
        .catch((err) => {
          console.error('Error fetching product conversions:', err);
          setLoadingConversions(false);
        });
    } else {
      setFormData({
        name: '',
        nameArabic: '',
        sku: '',
        category: categories[0] || '',
        unitId: activeUnits[0]?.id || '',
        price: '',
        purchasePrice: permissions?.viewProductCost !== false ? '' : '0',
        quantity: '0',
        minQuantity: '',
        supplierName: '',
        supplierEmail: '',
        location: '',
        description: '',
        barcode: '',
        barcodeType: 'CODE128',
        barcodeStatus: 'unassigned',
        barcodeSource: 'manual',
        isBarcodeLocked: false,
      });
      setErrors({});
      setTranslationNotice(null);
      setProductConversions([]);
    }
  }, [itemToEdit, isOpen, categories, activeUnits]);

  if (!isOpen) return null;

  const handleAddInlineConversion = async () => {
    setConvError(null);
    if (!itemToEdit) return;

    if (!convAltUnitId) {
      setConvError('Select an alternate unit.');
      return;
    }

    const altUnit = activeUnits.find((u) => u.id === convAltUnitId || u.unitCode === convAltUnitId);
    if (!altUnit) {
      setConvError('Invalid alternate unit selected.');
      return;
    }

    const baseUnitObj = activeUnits.find((u) => u.id === formData.unitId) || activeUnits[0];
    const baseUnitCode = baseUnitObj?.unitCode || 'PCS';
    const baseUnitId = baseUnitObj?.id || 'pcs';

    if (
      baseUnitId === altUnit.id ||
      baseUnitCode.trim().toUpperCase() === altUnit.unitCode.trim().toUpperCase()
    ) {
      setConvError('Alternate unit cannot be the same as Base unit.');
      return;
    }

    const numFactor = parseFloat(convFactor);
    if (isNaN(numFactor) || numFactor <= 0) {
      setConvError('Conversion factor must be greater than 0.');
      return;
    }

    // Duplicate check
    const isDup = productConversions.some(
      (c) =>
        c.alternateUnitId === altUnit.id ||
        c.alternateUnitCode.toUpperCase() === altUnit.unitCode.toUpperCase()
    );
    if (isDup) {
      setConvError(`Conversion rule for ${altUnit.unitCode} already exists.`);
      return;
    }

    setSavingConv(true);
    try {
      const newConv = await UnitConversionService.createConversion({
        productId: itemToEdit.id,
        productName: formData.name || itemToEdit.name,
        productSku: formData.sku || itemToEdit.sku,
        baseUnitId: baseUnitId,
        baseUnitCode: baseUnitCode,
        alternateUnitId: altUnit.id,
        alternateUnitCode: altUnit.unitCode,
        conversionFactor: numFactor,
        direction: 'multiply',
        status: 'active',
        isActive: true,
      });

      setProductConversions((prev) => [...prev, newConv]);
      setConvAltUnitId('');
      setConvFactor('');
      setShowAddConvRow(false);
    } catch (err: any) {
      setConvError(err.message || 'Failed to save conversion rule.');
    } finally {
      setSavingConv(false);
    }
  };

  const handleToggleInlineStatus = async (conv: UnitConversion) => {
    const nextStatus = conv.status === 'active' ? 'inactive' : 'active';
    try {
      await UnitConversionService.updateConversion(conv.id, { status: nextStatus });
      setProductConversions((prev) =>
        prev.map((c) => (c.id === conv.id ? { ...c, status: nextStatus, isActive: nextStatus === 'active' } : c))
      );
    } catch (err: any) {
      console.error('Failed to toggle conversion status:', err);
    }
  };

  const handleDeleteInlineConversion = async (id: string) => {
    try {
      await UnitConversionService.deleteConversion(id);
      setProductConversions((prev) => prev.filter((c) => c.id !== id));
    } catch (err: any) {
      console.error('Failed to delete conversion:', err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) newErrors.name = 'Product name is required';
    
    const normalizedSku = formData.sku.trim().toUpperCase();
    if (!formData.sku.trim()) {
      newErrors.sku = 'SKU identifier is required';
    } else {
      const isSkuDuplicate = products.some(p => p.id !== itemToEdit?.id && p.sku.trim().toUpperCase() === normalizedSku);
      if (isSkuDuplicate) {
        newErrors.sku = 'SKU already exists. SKU must be unique.';
      }
    }

    if (!formData.category) newErrors.category = 'Category selection is required';
    if (!formData.unitId) newErrors.unitId = 'Base Unit selection is required';

    const priceNum = parseFloat(formData.price);
    if (!formData.price || isNaN(priceNum) || priceNum < 0) {
      newErrors.price = 'Selling price must be a positive number';
    }

    if (permissions?.viewProductCost !== false) {
      const purchasePriceNum = parseFloat(formData.purchasePrice);
      if (!formData.purchasePrice || isNaN(purchasePriceNum) || purchasePriceNum < 0) {
        newErrors.purchasePrice = 'Purchase price must be a positive number';
      }
    }

    const qtyNum = parseInt(formData.quantity, 10);
    if (formData.quantity === '' || isNaN(qtyNum) || qtyNum < 0) {
      newErrors.quantity = 'Quantity must be 0 or positive integer';
    }

    const minQtyNum = parseInt(formData.minQuantity, 10);
    if (formData.minQuantity === '' || isNaN(minQtyNum) || minQtyNum < 0) {
      newErrors.minQuantity = 'Alert limit threshold is required (0+)';
    }

    if (formData.supplierEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.supplierEmail)) {
      newErrors.supplierEmail = 'Provide a valid contact email address';
    }

    // Barcode Validation (Sprint 6)
    const trimmedBarcode = formData.barcode.trim();
    if (trimmedBarcode) {
      const bcRes = BarcodeService.validateBarcode(
        trimmedBarcode,
        formData.barcodeType,
        itemToEdit?.id,
        products
      );
      if (!bcRes.isValid && bcRes.error) {
        newErrors.barcode = bcRes.error;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const retailPrice = parseFloat(formData.price);
    const costPrice = permissions?.viewProductCost !== false
      ? (formData.purchasePrice ? parseFloat(formData.purchasePrice) : retailPrice * 0.6)
      : (itemToEdit?.purchasePrice || (retailPrice * 0.6));

    const selectedUnit = activeUnits.find(u => u.id === formData.unitId) || activeUnits[0];

    const trimmedBarcode = formData.barcode.trim();
    const isBarcodeChanged = (itemToEdit?.barcode || '') !== trimmedBarcode;

    onSave({
      id: itemToEdit?.id,
      name: formData.name.trim(),
      nameArabic: formData.nameArabic.trim() || undefined,
      sku: formData.sku.trim().toUpperCase(),
      category: formData.category,
      unitId: selectedUnit?.id || formData.unitId,
      unitCode: selectedUnit?.unitCode || itemToEdit?.unitCode || '',
      unitName: selectedUnit?.unitName || itemToEdit?.unitName || '',
      sellingPrice: retailPrice,
      purchasePrice: costPrice,
      currentStock: parseInt(formData.quantity, 10),
      minimumStockAlert: parseInt(formData.minQuantity, 10),
      supplierName: formData.supplierName.trim() || 'N/A',
      supplierEmail: formData.supplierEmail.trim() || 'N/A',
      location: formData.location.trim() || 'Unassigned',
      description: formData.description.trim(),
      status: 'active',
      // Barcode fields (Sprint 6)
      barcode: trimmedBarcode || undefined,
      barcodeType: trimmedBarcode ? formData.barcodeType : undefined,
      barcodeStatus: trimmedBarcode ? (formData.isBarcodeLocked ? 'locked' : 'assigned') : 'unassigned',
      barcodeSource: trimmedBarcode ? formData.barcodeSource : undefined,
      isBarcodeLocked: formData.isBarcodeLocked,
      generatedAt: itemToEdit?.generatedAt || (trimmedBarcode ? new Date().toISOString() : undefined),
      generatedBy: itemToEdit?.generatedBy || (trimmedBarcode ? 'System Admin' : undefined),
      barcodeVersion: (itemToEdit?.barcodeVersion ?? 1) + (isBarcodeChanged ? 1 : 0),
    });
    onClose();
  };

  return (
    <AnimatePresence>
      <div id={id} className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          id={`${id}-backdrop`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm"
        />

        {/* Modal content */}
        <motion.div
          id={`${id}-container`}
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-150 flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 p-6">
            <div>
              <h2 className="font-sans text-xl font-bold tracking-tight text-slate-800">
                {itemToEdit ? 'Edit Product Parameters' : 'Register New Inventory Item'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {itemToEdit ? `Modifying SKU: ${itemToEdit.sku}` : 'Fill in the structured fields to catalog stock.'}
              </p>
            </div>
            <button
              id={`${id}-close-button`}
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1 text-xs text-slate-700">
            {/* Row 1: Name */}
            <div className="relative w-full">
              <input
                id="form-name-input"
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder=" "
                className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                  errors.name 
                    ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-450 focus:ring-rose-450' 
                    : 'border-slate-200 focus:border-indigo-605 focus:ring-indigo-650'
                }`}
              />
              <label htmlFor="form-name-input" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                Product Name <span className="text-rose-500 font-extrabold">*</span>
              </label>
              {errors.name && (
                <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                  <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                  <span>{errors.name}</span>
                </div>
              )}
            </div>

            {/* Product Name (Arabic) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="form-name-arabic-input" className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Product Name (Arabic)
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    setTranslationNotice(null);
                    const sourceName = (formData.name || '').trim();
                    if (!sourceName) {
                      setTranslationNotice({ type: 'warning', message: 'Please enter a Product Name first.' });
                      return;
                    }
                    const res = await TranslationService.translateToArabic(sourceName);
                    if (res.success && res.translatedText) {
                      setFormData(prev => ({ ...prev, nameArabic: res.translatedText }));
                      setTranslationNotice({ type: 'success', message: `Arabic name generated: ${res.translatedText}` });
                    } else {
                      setTranslationNotice({ type: 'warning', message: res.message || 'Translation not found in offline dictionary.' });
                    }
                  }}
                  className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-md transition border border-indigo-100/80 cursor-pointer"
                >
                  Generate Arabic
                </button>
              </div>
              <input
                id="form-name-arabic-input"
                type="text"
                name="nameArabic"
                dir="rtl"
                value={formData.nameArabic}
                onChange={handleChange}
                placeholder="اسم المنتج (اختياري)"
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:outline-none transition-all focus:ring-1 focus:ring-indigo-600 focus:border-indigo-650 h-[42px] text-right font-sans"
              />
              {translationNotice && (
                <div className={`mt-1.5 text-[11px] font-semibold px-3 py-2 rounded-xl flex items-center justify-between border shadow-3xs transition-all ${
                  translationNotice.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                    : 'bg-amber-50 text-amber-800 border-amber-200/80'
                }`}>
                  <div className="flex items-center gap-1.5">
                    {translationNotice.type === 'success' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    )}
                    <span>{translationNotice.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTranslationNotice(null)}
                    className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Row 2: SKU & Category */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="relative w-full">
                <input
                  id="form-sku-input"
                  type="text"
                  name="sku"
                  value={formData.sku}
                  onChange={handleChange}
                  placeholder=" "
                  className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all uppercase placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                    errors.sku 
                      ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-450 focus:ring-rose-450' 
                      : 'border-slate-200 focus:border-indigo-605 focus:ring-indigo-650'
                  }`}
                />
                <label htmlFor="form-sku-input" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                  SKU Identifier <span className="text-rose-500 font-extrabold">*</span>
                </label>
                {errors.sku && (
                  <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                    <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                    <span>{errors.sku}</span>
                  </div>
                )}
              </div>

              <div className="relative w-full">
                <input
                  id="form-category-input"
                  type="text"
                  name="category"
                  list="categories-datalist"
                  value={formData.category}
                  onChange={handleChange}
                  placeholder=" "
                  className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                    errors.category 
                      ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-450 focus:ring-rose-450' 
                      : 'border-slate-200 focus:border-indigo-605 focus:ring-indigo-650'
                  }`}
                />
                <datalist id="categories-datalist">
                  {categories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
                <label htmlFor="form-category-input" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                  Product Category <span className="text-rose-500 font-extrabold">*</span>
                </label>
                {errors.category && (
                  <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                    <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                    <span>{errors.category}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Row: Base Unit Select */}
            <div className="relative w-full">
              <label htmlFor="form-unit-select" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Base Unit <span className="text-rose-500 font-extrabold">*</span>
              </label>
              <div className="relative">
                <select
                  id="form-unit-select"
                  name="unitId"
                  value={formData.unitId}
                  onChange={handleChange}
                  disabled={hasMovement}
                  className={`w-full rounded-xl border px-3.5 py-3 text-xs font-semibold focus:outline-none transition-all appearance-none bg-white focus:ring-1 focus:ring-indigo-600 disabled:opacity-75 disabled:bg-slate-50 ${
                    errors.unitId
                      ? 'border-rose-300 text-rose-800 bg-rose-50/10'
                      : 'border-slate-200 focus:border-indigo-600 text-slate-800'
                  }`}
                >
                  <option value="">Select Base Unit...</option>
                  {activeUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unitName} ({u.unitCode})
                    </option>
                  ))}
                </select>
                {hasMovement && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-amber-500">
                    <Lock className="h-4 w-4" />
                  </div>
                )}
              </div>
              {hasMovement && (
                <p className="mt-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200/80 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span>This product already contains inventory transactions. Base Unit cannot be changed.</span>
                </p>
              )}
              {errors.unitId && !hasMovement && (
                <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                  <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                  <span>{errors.unitId}</span>
                </div>
              )}
            </div>

            {/* Row 3: Prices */}
            <div className={`grid grid-cols-1 gap-5 ${permissions?.viewProductCost !== false ? 'sm:grid-cols-2' : ''}`}>
              {permissions?.viewProductCost !== false && (
                <div className="relative w-full">
                  <input
                    id="form-purchase-price-input"
                    type="number"
                    step="0.01"
                    min="0"
                    name="purchasePrice"
                    value={formData.purchasePrice}
                    onChange={handleChange}
                    placeholder=" "
                    className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                      errors.purchasePrice 
                        ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-450 focus:ring-rose-450' 
                        : 'border-slate-200 focus:border-indigo-605 focus:ring-indigo-650'
                    }`}
                  />
                  <label htmlFor="form-purchase-price-input" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                    Purchase Cost ($) <span className="text-rose-500 font-extrabold">*</span>
                  </label>
                  {errors.purchasePrice && (
                    <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                      <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                      <span>{errors.purchasePrice}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="relative w-full">
                <input
                  id="form-selling-price-input"
                  type="number"
                  step="0.01"
                  min="0"
                  name="price"
                  value={formData.price}
                  onChange={handleChange}
                  placeholder=" "
                  className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                    errors.price 
                      ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-450 focus:ring-rose-450' 
                      : 'border-slate-200 focus:border-indigo-605 focus:ring-indigo-650'
                  }`}
                />
                <label htmlFor="form-selling-price-input" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                  Selling Price ($) <span className="text-rose-500 font-extrabold">*</span>
                </label>
                {errors.price && (
                  <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                    <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                    <span>{errors.price}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Row 4: Quantity & Threshold Alert */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="relative w-full">
                <input
                  id="form-quantity-input"
                  type="number"
                  min="0"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleChange}
                  placeholder=" "
                  className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                    errors.quantity 
                      ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-450 focus:ring-rose-450' 
                      : 'border-slate-200 focus:border-indigo-605 focus:ring-indigo-650'
                  }`}
                />
                <label htmlFor="form-quantity-input" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                  Stock Quantity <span className="text-rose-500 font-extrabold">*</span>
                </label>
                {errors.quantity && (
                  <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                    <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                    <span>{errors.quantity}</span>
                  </div>
                )}
              </div>

              <div className="relative w-full">
                <input
                  id="form-min-quantity-input"
                  type="number"
                  min="0"
                  name="minQuantity"
                  value={formData.minQuantity}
                  onChange={handleChange}
                  placeholder=" "
                  className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                    errors.minQuantity 
                      ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-450 focus:ring-rose-450' 
                      : 'border-slate-200 focus:border-indigo-605 focus:ring-indigo-650'
                  }`}
                />
                <label htmlFor="form-min-quantity-input" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                  Min Threshold Alert Level <span className="text-rose-500 font-extrabold">*</span>
                </label>
                {errors.minQuantity && (
                  <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                    <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                    <span>{errors.minQuantity}</span>
                  </div>
                )}
              </div>
            </div>

            {/* BARCODE FOUNDATION SECTION (SPRINT 6) */}
            <div className="bg-indigo-50/50 rounded-2xl border border-indigo-150 p-4.5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
                    <Barcode className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Enterprise Barcode Foundation
                    </h4>
                    <p className="text-[10px] text-slate-500 font-medium">
                      Configure barcode metadata & format rules (MZ Suite Integration Ready)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const generated = BarcodeService.generatePlaceholderBarcode(formData.sku || formData.name || 'PROD', formData.barcodeType);
                    setFormData(prev => ({
                      ...prev,
                      barcode: generated.barcode,
                      barcodeType: generated.type,
                      barcodeStatus: 'generated',
                      barcodeSource: 'auto_generated'
                    }));
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-xl text-xs font-extrabold shadow-3xs transition cursor-pointer shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                  <span>Auto-Generate Code</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Barcode Input */}
                <div className="relative w-full">
                  <input
                    id="form-barcode-input"
                    type="text"
                    name="barcode"
                    value={formData.barcode}
                    onChange={(e) => setFormData(prev => ({ ...prev, barcode: e.target.value }))}
                    placeholder=" "
                    disabled={formData.isBarcodeLocked}
                    className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-mono font-bold focus:outline-none transition-all uppercase placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-100 h-[52px] ${
                      errors.barcode
                        ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-450'
                        : 'border-slate-200 focus:border-indigo-600 text-slate-900 bg-white'
                    }`}
                  />
                  <label htmlFor="form-barcode-input" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                    Barcode Value
                  </label>
                  {errors.barcode && (
                    <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                      <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                      <span>{errors.barcode}</span>
                    </div>
                  )}
                </div>

                {/* Barcode Type */}
                <div className="relative w-full">
                  <label htmlFor="form-barcode-type-select" className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Barcode Type / Standard
                  </label>
                  <select
                    id="form-barcode-type-select"
                    name="barcodeType"
                    value={formData.barcodeType}
                    onChange={(e) => setFormData(prev => ({ ...prev, barcodeType: e.target.value as BarcodeType }))}
                    disabled={formData.isBarcodeLocked}
                    className="w-full rounded-xl border border-slate-200 px-3 py-3 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-100 h-[52px]"
                  >
                    <option value="CODE128">Code 128 (Alphanumeric General)</option>
                    <option value="EAN13">EAN-13 (13 Digits International)</option>
                    <option value="EAN8">EAN-8 (8 Digits Compact)</option>
                    <option value="UPCA">UPC-A (12 Digits Retail)</option>
                    <option value="UPCE">UPC-E (8 Digits Compressed)</option>
                    <option value="QR_CODE">QR Code (2D Data Matrix / URL)</option>
                    <option value="DATA_MATRIX">Data Matrix (High Density 2D)</option>
                  </select>
                </div>
              </div>

              {/* Barcode Lock & Status Metadata Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-indigo-100 text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.isBarcodeLocked}
                    onChange={(e) => setFormData(prev => ({ ...prev, isBarcodeLocked: e.target.checked }))}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="font-semibold text-slate-700 inline-flex items-center gap-1 text-[11px]">
                    <Lock className="w-3 h-3 text-slate-500" />
                    Lock Barcode (Prevent Editing)
                  </span>
                </label>

                {formData.barcode && (
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 bg-white px-3 py-1 rounded-lg border border-slate-200/80 shadow-3xs">
                    <span>Status: <strong className="text-indigo-700 capitalize">{formData.barcodeStatus}</strong></span>
                    <span>•</span>
                    <span>Source: <strong className="text-slate-700 uppercase">{formData.barcodeSource}</strong></span>
                  </div>
                )}
              </div>
            </div>

            {/* Row 4: Warehouse Location */}
            <div className="relative w-full">
              <input
                id="form-location-input"
                type="text"
                name="location"
                value={formData.location}
                onChange={handleChange}
                placeholder=" "
                className="peer w-full rounded-xl border border-slate-200 px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-605 focus:border-indigo-600 h-[52px]"
              />
              <label htmlFor="form-location-input" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                Storage Location / Zone
              </label>
            </div>

            {/* Row 5: Supplier Info */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="relative w-full">
                <input
                  id="form-supplier-name-input"
                  type="text"
                  name="supplierName"
                  value={formData.supplierName}
                  onChange={handleChange}
                  placeholder=" "
                  className="peer w-full rounded-xl border border-slate-200 px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-605 focus:border-indigo-600 h-[52px]"
                />
                <label htmlFor="form-supplier-name-input" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                  Supplier Name
                </label>
              </div>

              <div className="relative w-full">
                <input
                  id="form-supplier-email-input"
                  type="text"
                  name="supplierEmail"
                  value={formData.supplierEmail}
                  onChange={handleChange}
                  placeholder=" "
                  className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                    errors.supplierEmail 
                      ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-450' 
                      : 'border-slate-200 focus:border-indigo-605 focus:ring-indigo-650'
                  }`}
                />
                <label htmlFor="form-supplier-email-input" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                  Supplier Contact Email
                </label>
                {errors.supplierEmail && (
                  <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                    <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                    <span>{errors.supplierEmail}</span>
                  </div>
                )}
              </div>
            </div>

            {/* SECTION: UNIT CONVERSIONS (SPRINT 4) */}
            {itemToEdit && (
              <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Unit Conversions
                    </h4>
                    <span className="bg-indigo-100 text-indigo-700 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                      {productConversions.length} Rule{productConversions.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {!showAddConvRow && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddConvRow(true);
                        setConvError(null);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Conversion</span>
                    </button>
                  )}
                </div>

                {convError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>{convError}</span>
                  </div>
                )}

                {/* Add New Rule Form Row */}
                {showAddConvRow && (
                  <div className="p-3 bg-white rounded-xl border border-indigo-200 shadow-xs space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase">
                          Alternate Unit
                        </label>
                        <select
                          value={convAltUnitId}
                          onChange={(e) => setConvAltUnitId(e.target.value)}
                          className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 font-medium"
                        >
                          <option value="">-- Select Alternate Unit --</option>
                          {activeUnits
                            .filter((u) => u.id !== formData.unitId && u.unitCode !== activeUnits.find((au) => au.id === formData.unitId)?.unitCode)
                            .map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.unitName} ({u.unitCode})
                              </option>
                            ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase">
                          Conversion Factor
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0.0001"
                          placeholder="Ratio (e.g. 24)"
                          value={convFactor}
                          onChange={(e) => setConvFactor(e.target.value)}
                          className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1">
                      <span className="text-slate-500">
                        {convAltUnitId && convFactor
                          ? `1 ${activeUnits.find((u) => u.id === convAltUnitId)?.unitCode || 'ALT'} = ${convFactor} ${activeUnits.find((u) => u.id === formData.unitId)?.unitCode || 'PCS'}`
                          : 'Define alternate unit ratio'}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddConvRow(false);
                            setConvError(null);
                          }}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleAddInlineConversion}
                          disabled={savingConv}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors"
                        >
                          {savingConv ? 'Saving...' : 'Save Conversion'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* List of Existing Conversions */}
                {loadingConversions ? (
                  <div className="p-3 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                    <span>Loading conversions...</span>
                  </div>
                ) : productConversions.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-400 italic bg-white rounded-xl border border-dashed border-slate-200">
                    No alternate unit conversions defined for this product yet.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200/80 bg-white rounded-xl border border-slate-200/80 overflow-hidden text-xs">
                    {productConversions.map((conv) => (
                      <div
                        key={conv.id}
                        className="p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50"
                      >
                        <div className="flex items-center gap-2">
                          <UnitBadge unitCode={conv.alternateUnitCode} size="sm" />
                          <span className="font-mono font-bold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                            {formatConversionText(conv)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleInlineStatus(conv)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              conv.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {conv.status}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteInlineConversion(conv.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                            title="Delete Conversion"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Row 6: Description */}
            <div className="relative w-full">
              <textarea
                id="form-description-textarea"
                name="description"
                rows={3}
                value={formData.description}
                onChange={handleChange}
                placeholder=" "
                className="peer w-full rounded-xl border border-slate-200 px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-605 focus:border-indigo-600 resize-none min-h-[80px]"
              />
              <label htmlFor="form-description-textarea" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                Item Description
              </label>
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-6">
              <button
                id="form-cancel-button"
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-250 bg-white px-5 py-2.5 font-semibold text-slate-500 hover:bg-slate-50 transition text-xs"
              >
                Cancel
              </button>
              <button
                id="form-save-button"
                type="submit"
                className="flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 font-semibold text-white hover:bg-slate-800 transition shadow-sm hover:shadow-md text-xs"
              >
                <Save className="h-4 w-4" />
                {itemToEdit ? 'Save Changes' : 'Catalog Item'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
