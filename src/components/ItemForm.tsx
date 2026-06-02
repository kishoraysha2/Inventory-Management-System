import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Save, AlertTriangle } from 'lucide-react';
import { Product } from '../types';

interface ItemFormProps {
  id?: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Omit<Product, 'id' | 'createdDate'> & { id?: string }) => void;
  itemToEdit: Product | null;
  categories: string[];
}

export default function ItemForm({
  id = 'item-form-modal',
  isOpen,
  onClose,
  onSave,
  itemToEdit,
  categories,
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
        purchasePrice: '',
        quantity: '',
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
    if (!formData.sku.trim()) newErrors.sku = 'SKU identifier is required';
    if (!formData.category) newErrors.category = 'Category selection is required';

    const priceNum = parseFloat(formData.price);
    if (!formData.price || isNaN(priceNum) || priceNum < 0) {
      newErrors.price = 'Selling price must be a positive number';
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
    const costPrice = formData.purchasePrice ? parseFloat(formData.purchasePrice) : retailPrice * 0.6;

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
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
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
          <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 text-sm text-slate-700">
            {/* Row 1: Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Product Name *
              </label>
              <input
                id="form-name-input"
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Dell UltraSharp 27 Monitor"
                className={`w-full rounded-xl border px-4 py-2.5 outline-none transition focus:border-slate-400 ${
                  errors.name ? 'border-rose-300 bg-rose-50/20' : 'border-slate-200'
                }`}
              />
              {errors.name && <p className="mt-1.5 text-xs text-rose-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{errors.name}</p>}
            </div>

            {/* Row 2: SKU & Category */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  SKU Identifier *
                </label>
                <input
                  id="form-sku-input"
                  type="text"
                  name="sku"
                  value={formData.sku}
                  onChange={handleChange}
                  placeholder="e.g. MON-DEL-27U"
                  className={`w-full rounded-xl border px-4 py-2.5 outline-none transition uppercase focus:border-slate-400 ${
                    errors.sku ? 'border-rose-300 bg-rose-50/20' : 'border-slate-200'
                  }`}
                />
                {errors.sku && <p className="mt-1.5 text-xs text-rose-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{errors.sku}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Product Category *
                </label>
                <select
                  id="form-category-select"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 outline-none transition focus:border-slate-400"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 3: Price & Quantity */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Unit Price ($) *
                </label>
                <input
                  id="form-price-input"
                  type="number"
                  step="0.01"
                  min="0"
                  name="price"
                  value={formData.price}
                  onChange={handleChange}
                  placeholder="299.99"
                  className={`w-full rounded-xl border px-4 py-2.5 outline-none transition focus:border-slate-400 ${
                    errors.price ? 'border-rose-300 bg-rose-50/20' : 'border-slate-200'
                  }`}
                />
                {errors.price && <p className="mt-1.5 text-xs text-rose-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{errors.price}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Stock Quantity *
                </label>
                <input
                  id="form-quantity-input"
                  type="number"
                  min="0"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleChange}
                  placeholder="50"
                  className={`w-full rounded-xl border px-4 py-2.5 outline-none transition focus:border-slate-400 ${
                    errors.quantity ? 'border-rose-300 bg-rose-50/20' : 'border-slate-200'
                  }`}
                />
                {errors.quantity && <p className="mt-1.5 text-xs text-rose-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{errors.quantity}</p>}
              </div>
            </div>

            {/* Row 4: Alert Threshold & Warehouse Location */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Min Threshold Alert Level *
                </label>
                <input
                  id="form-min-quantity-input"
                  type="number"
                  min="0"
                  name="minQuantity"
                  value={formData.minQuantity}
                  onChange={handleChange}
                  placeholder="10"
                  className={`w-full rounded-xl border px-4 py-2.5 outline-none transition focus:border-slate-400 ${
                    errors.minQuantity ? 'border-rose-300 bg-rose-50/20' : 'border-slate-200'
                  }`}
                />
                {errors.minQuantity && <p className="mt-1.5 text-xs text-rose-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{errors.minQuantity}</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Storage Location / Zone
                </label>
                <input
                  id="form-location-input"
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  placeholder="e.g. Warehouse A - Shelf 4"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none transition focus:border-slate-400"
                />
              </div>
            </div>

            {/* Row 5: Supplier Info */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Supplier Name
                </label>
                <input
                  id="form-supplier-name-input"
                  type="text"
                  name="supplierName"
                  value={formData.supplierName}
                  onChange={handleChange}
                  placeholder="e.g. Global Tech Distributors"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none transition focus:border-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Supplier Contact Email
                </label>
                <input
                  id="form-supplier-email-input"
                  type="text"
                  name="supplierEmail"
                  value={formData.supplierEmail}
                  onChange={handleChange}
                  placeholder="orders@globaltech.com"
                  className={`w-full rounded-xl border px-4 py-2.5 outline-none transition focus:border-slate-400 ${
                    errors.supplierEmail ? 'border-rose-300 bg-rose-50/20' : 'border-slate-200'
                  }`}
                />
                {errors.supplierEmail && <p className="mt-1.5 text-xs text-rose-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{errors.supplierEmail}</p>}
              </div>
            </div>

            {/* Row 6: Description */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Item Description
              </label>
              <textarea
                id="form-description-textarea"
                name="description"
                rows={3}
                value={formData.description}
                onChange={handleChange}
                placeholder="Provide physical traits, specifications, or accessory details..."
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 outline-none transition focus:border-slate-400 resize-none"
              />
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-6">
              <button
                id="form-cancel-button"
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-250 bg-white px-5 py-2.5 font-semibold text-slate-500 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                id="form-save-button"
                type="submit"
                className="flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 font-semibold text-white hover:bg-slate-800 transition shadow-sm hover:shadow-md"
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
