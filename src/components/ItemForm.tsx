import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Save, AlertTriangle } from 'lucide-react';
import { Product } from '../types';

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
}: ItemFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: '',
    price: '',
    purchasePrice: '',
    quantity: '',
    minQuantity: '',
    supplierName: '',
    supplierEmail: '',
    location: '',
    description: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (itemToEdit) {
      setFormData({
        name: itemToEdit.name,
        sku: itemToEdit.sku,
        category: itemToEdit.category,
        price: itemToEdit.sellingPrice.toString(),
        purchasePrice: (itemToEdit.purchasePrice ?? (itemToEdit.sellingPrice * 0.6)).toString(),
        quantity: itemToEdit.currentStock.toString(),
        minQuantity: itemToEdit.minimumStockAlert.toString(),
        supplierName: itemToEdit.supplierName ?? '',
        supplierEmail: itemToEdit.supplierEmail ?? '',
        location: itemToEdit.location ?? '',
        description: itemToEdit.description ?? '',
      });
      setErrors({});
    } else {
      setFormData({
        name: '',
        sku: '',
        category: categories[0] || '',
        price: '',
        purchasePrice: permissions?.viewProductCost !== false ? '' : '0',
        quantity: '0',
        minQuantity: '',
        supplierName: '',
        supplierEmail: '',
        location: '',
        description: '',
      });
      setErrors({});
    }
  }, [itemToEdit, isOpen, categories]);

  if (!isOpen) return null;

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

    onSave({
      id: itemToEdit?.id,
      name: formData.name.trim(),
      sku: formData.sku.trim().toUpperCase(),
      category: formData.category,
      sellingPrice: retailPrice,
      purchasePrice: costPrice,
      currentStock: parseInt(formData.quantity, 10),
      minimumStockAlert: parseInt(formData.minQuantity, 10),
      supplierName: formData.supplierName.trim() || 'N/A',
      supplierEmail: formData.supplierEmail.trim() || 'N/A',
      location: formData.location.trim() || 'Unassigned',
      description: formData.description.trim(),
      status: 'active',
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
