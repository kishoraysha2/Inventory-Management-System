import React, { useState, useEffect } from 'react';
import { Trash2, Plus, AlertCircle, ShoppingBag, ArrowRight, AlertTriangle } from 'lucide-react';
import { Product, LineItem, UnitConversion, calculateLineTotals, calculateTransactionTotals } from '../types';
import { isInactiveStatus } from '../lib/utils';
import { formatCurrency, getCurrencySymbol } from '../utils/currencyFormatter';
import { UnitBadge } from './ui/UnitBadge';
import { UnitConversionService } from '../services/unitConversionService';
import { convertToBase, formatConversionSummary } from '../lib/unitConversion';

interface LineItemTableProps {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  products: Product[];
  taxRatePercent?: number;
  pricingMode?: 'sellingPrice' | 'purchasePrice';
  conversions?: UnitConversion[];
}

export default function LineItemTable({
  items,
  onChange,
  products,
  taxRatePercent = 0,
  pricingMode = 'sellingPrice',
  conversions: propConversions,
}: LineItemTableProps) {
  const [conversions, setConversions] = useState<UnitConversion[]>(propConversions || []);

  useEffect(() => {
    if (propConversions) {
      setConversions(propConversions);
      return;
    }
    const unsubscribe = UnitConversionService.subscribeAllConversions((data) => {
      setConversions(data);
    });
    return () => unsubscribe();
  }, [propConversions]);

  // Add a new row to the table
  const handleAddRow = () => {
    const newItem: LineItem = {
      productId: '',
      productName: '',
      quantity: 1,
      unitPrice: 0,
      subtotal: 0,
      taxRatePercent,
      taxAmount: 0,
      totalAmount: 0,
      unitCode: '',
      unitName: '',
    };
    onChange([...items, newItem]);
  };

  // Remove a specific row from the table
  const handleRemoveRow = (indexToRemove: number) => {
    const updatedItems = items.filter((_, idx) => idx !== indexToRemove);
    onChange(updatedItems);
  };

  // Handle product selection change
  const handleProductChange = (index: number, selectedProductId: string) => {
    const matchedProduct = products.find((p) => p.id === selectedProductId);
    if (!matchedProduct) return;

    const defaultPrice = pricingMode === 'sellingPrice' 
      ? matchedProduct.sellingPrice 
      : matchedProduct.purchasePrice;

    const qty = items[index].enteredQuantity || items[index].quantity || 1;
    const totals = calculateLineTotals(qty, defaultPrice, taxRatePercent);

    const updatedItems = [...items];
    updatedItems[index] = {
      ...updatedItems[index],
      productId: matchedProduct.id,
      productName: matchedProduct.name,
      productNameArabic: matchedProduct.nameArabic || '',
      unitPrice: defaultPrice,
      subtotal: totals.subtotal,
      taxRatePercent,
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
      unitId: matchedProduct.unitId,
      unitCode: matchedProduct.unitCode,
      unitName: matchedProduct.unitName,
      // Default unit is base unit
      enteredQuantity: qty,
      enteredUnitCode: matchedProduct.unitCode || 'PCS',
      baseQuantity: qty,
      baseUnitCode: matchedProduct.unitCode || 'PCS',
      conversionFactor: 1,
      isAlternateUnit: false,
      quantity: qty,
    };
    onChange(updatedItems);
  };

  // Handle unit selection change for line item
  const handleUnitChange = (index: number, selectedUnitCode: string) => {
    const item = items[index];
    const matchedProduct = products.find((p) => p.id === item.productId);
    if (!matchedProduct) return;

    const baseUnit = matchedProduct.unitCode || 'PCS';
    const enteredQty = item.enteredQuantity || item.quantity || 1;

    let baseQuantity = enteredQty;
    let conversionFactor = 1;
    let isAlternateUnit = false;

    if (selectedUnitCode && selectedUnitCode.toUpperCase() !== baseUnit.toUpperCase()) {
      // Look up conversion rule
      const rule = conversions.find(
        (c) =>
          c.productId === item.productId &&
          c.alternateUnitCode.trim().toUpperCase() === selectedUnitCode.trim().toUpperCase() &&
          c.status !== 'inactive'
      );

      if (rule) {
        conversionFactor = rule.conversionFactor;
        baseQuantity = convertToBase(enteredQty, rule.conversionFactor, rule.direction);
        isAlternateUnit = true;
      } else {
        // No conversion rule found
        isAlternateUnit = true;
        baseQuantity = enteredQty;
      }
    }

    const totals = calculateLineTotals(enteredQty, item.unitPrice, taxRatePercent);

    const updatedItems = [...items];
    updatedItems[index] = {
      ...updatedItems[index],
      unitCode: selectedUnitCode,
      enteredQuantity: enteredQty,
      enteredUnitCode: selectedUnitCode,
      baseQuantity: baseQuantity,
      baseUnitCode: baseUnit,
      conversionFactor: conversionFactor,
      isAlternateUnit: isAlternateUnit,
      quantity: baseQuantity, // Internal ERP inventory base quantity
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
    };
    onChange(updatedItems);
  };

  // Handle quantity input alterations
  const handleQuantityChange = (index: number, qtyString: string) => {
    const enteredQty = Math.max(1, parseInt(qtyString) || 0);
    const item = items[index];
    const matchedProduct = products.find((p) => p.id === item.productId);
    const baseUnit = matchedProduct?.unitCode || item.baseUnitCode || 'PCS';
    const selectedUnitCode = item.enteredUnitCode || item.unitCode || baseUnit;

    let baseQuantity = enteredQty;
    let conversionFactor = item.conversionFactor || 1;
    let isAlternateUnit = item.isAlternateUnit || false;

    if (selectedUnitCode && selectedUnitCode.toUpperCase() !== baseUnit.toUpperCase()) {
      const rule = conversions.find(
        (c) =>
          c.productId === item.productId &&
          c.alternateUnitCode.trim().toUpperCase() === selectedUnitCode.trim().toUpperCase() &&
          c.status !== 'inactive'
      );
      if (rule) {
        conversionFactor = rule.conversionFactor;
        baseQuantity = convertToBase(enteredQty, rule.conversionFactor, rule.direction);
        isAlternateUnit = true;
      }
    }

    const totals = calculateLineTotals(enteredQty, item.unitPrice, taxRatePercent);

    const updatedItems = [...items];
    updatedItems[index] = {
      ...updatedItems[index],
      enteredQuantity: enteredQty,
      quantity: baseQuantity, // Internal base quantity
      baseQuantity: baseQuantity,
      conversionFactor,
      isAlternateUnit,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
    };
    onChange(updatedItems);
  };

  // Handle custom price adjustments
  const handlePriceChange = (index: number, priceString: string) => {
    const unitPrice = Math.max(0, parseFloat(priceString) || 0);
    const item = items[index];
    const qty = item.enteredQuantity || item.quantity || 1;
    const totals = calculateLineTotals(qty, unitPrice, taxRatePercent);

    const updatedItems = [...items];
    updatedItems[index] = {
      ...updatedItems[index],
      unitPrice,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
    };
    onChange(updatedItems);
  };

  // Calculate high-level summary statistics
  const totalsSummary = calculateTransactionTotals(items);

  return (
    <div id="line-item-table-container" className="w-full space-y-4 font-sans">
      {/* Table Title and Controls */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <ShoppingBag className="h-4 w-4 text-indigo-500" />
          <span>Detailed Line Items</span>
        </h4>
        <button
          id="btn-add-line-item-row"
          type="button"
          onClick={handleAddRow}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all border border-indigo-100/50 shadow-3xs cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Row</span>
        </button>
      </div>

      {/* Main Grid/Table Framework */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/30 shadow-xs">
        {items.length === 0 ? (
          <div className="p-8 text-center space-y-3 bg-white">
            <div className="mx-auto w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center">
              <ShoppingBag className="h-5 w-5 text-slate-400" />
            </div>
            <p className="text-xs text-slate-500 font-medium max-w-[280px] mx-auto">
              No items added to this transaction record yet. Press "Add Row" to set products.
            </p>
          </div>
        ) : (
          <div id="line-item-table-scroll-container" className="overflow-auto max-h-[320px] relative scrollbar-thin">
            <table className="min-w-full divide-y divide-slate-100 bg-white table-fixed">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200">
                    Product
                  </th>
                  <th scope="col" className="px-3 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[100px] min-w-[100px] border-b border-slate-200">
                    Quantity
                  </th>
                  <th scope="col" className="px-3 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[110px] min-w-[110px] border-b border-slate-200">
                    Unit
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[120px] min-w-[120px] border-b border-slate-200">
                    Rate / Unit ({getCurrencySymbol()})
                  </th>
                  <th scope="col" className="px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[120px] min-w-[120px] border-b border-slate-200">
                    Subtotal ({getCurrencySymbol()})
                  </th>
                  <th scope="col" className="px-3 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[54px] min-w-[54px] border-b border-slate-200">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, index) => {
                  const matchedProduct = products.find((p) => p.id === item.productId);
                  const baseUnitCode = matchedProduct?.unitCode || 'PCS';
                  const availableConversions = conversions.filter(
                    (c) => c.productId === item.productId && c.status !== 'inactive'
                  );
                  const availableUnits = [
                    baseUnitCode,
                    ...availableConversions.map((c) => c.alternateUnitCode),
                  ];
                  const uniqueUnits = Array.from(new Set(availableUnits));

                  const isSelectedUnitAlternate =
                    item.unitCode &&
                    item.unitCode.trim().toUpperCase() !== baseUnitCode.trim().toUpperCase();

                  const activeConversionRule = isSelectedUnitAlternate
                    ? availableConversions.find(
                        (c) =>
                          c.alternateUnitCode.trim().toUpperCase() ===
                          item.unitCode?.trim().toUpperCase()
                      )
                    : null;

                  const hasConversionError = isSelectedUnitAlternate && !activeConversionRule;

                  return (
                    <React.Fragment key={index}>
                      <tr className="hover:bg-slate-50/50 transition-colors">
                        {/* Product Selection Column */}
                        <td className="px-4 py-3 font-semibold text-xs text-slate-700">
                          <select
                            value={item.productId}
                            onChange={(e) => handleProductChange(index, e.target.value)}
                            required
                            className="w-full text-xs font-semibold rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white cursor-pointer px-2 py-1.5 h-10 shadow-3xs"
                          >
                            <option value="">-- Select Product --</option>
                            {products
                              .filter((p) => !isInactiveStatus(p.status))
                              .map((p) => {
                                const otherRowsQuantityTotal = items.reduce((sum, otherItem, otherIndex) => {
                                  if (otherIndex !== index && otherItem.productId === p.id) {
                                    return sum + (otherItem.baseQuantity || otherItem.quantity || 0);
                                  }
                                  return sum;
                                }, 0);
                                const effectiveStock = Math.max(0, (p.currentStock ?? 0) - otherRowsQuantityTotal);
                                const unitSuffix = p.unitCode ? ` [${p.unitCode}]` : '';
                                return (
                                  <option 
                                    key={p.id} 
                                    value={p.id} 
                                    disabled={effectiveStock <= 0 && pricingMode === 'sellingPrice'}
                                  >
                                    {p.name} (SKU: {p.sku}{unitSuffix} {pricingMode === 'sellingPrice' ? `| stock: ${effectiveStock} ${p.unitCode || ''}` : ''})
                                  </option>
                                );
                              })}
                          </select>
                        </td>

                        {/* Quantity Input Column */}
                        <td className="px-3 py-3 w-[100px] min-w-[100px]">
                          <input
                            type="number"
                            min="1"
                            required
                            value={item.enteredQuantity || item.quantity || ''}
                            onChange={(e) => handleQuantityChange(index, e.target.value)}
                            className="w-full text-center text-xs font-semibold rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white px-2 py-1.5 h-10 shadow-3xs"
                          />
                        </td>

                        {/* Unit Column */}
                        <td className="px-3 py-3 text-center w-[110px] min-w-[110px]">
                          {matchedProduct ? (
                            <select
                              value={item.unitCode || baseUnitCode}
                              onChange={(e) => handleUnitChange(index, e.target.value)}
                              className={`w-full text-xs font-bold rounded-lg border px-2 py-1.5 h-10 bg-white cursor-pointer shadow-3xs ${
                                hasConversionError
                                  ? 'border-rose-300 bg-rose-50/50 text-rose-800'
                                  : isSelectedUnitAlternate
                                  ? 'border-indigo-300 text-indigo-700 bg-indigo-50/30'
                                  : 'border-slate-200 text-slate-800'
                              }`}
                            >
                              {uniqueUnits.map((uCode) => (
                                <option key={uCode} value={uCode}>
                                  {uCode} {uCode.toUpperCase() === baseUnitCode.toUpperCase() ? '(Base)' : ''}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <UnitBadge unitCode={item.unitCode} unitName={item.unitName} size="sm" />
                          )}
                        </td>

                        {/* Unit Price Column */}
                        <td className="px-4 py-3 w-[120px] min-w-[120px]">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">{getCurrencySymbol()}</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              required
                              value={item.unitPrice !== undefined ? item.unitPrice : ''}
                              onChange={(e) => handlePriceChange(index, e.target.value)}
                              className="w-full pl-6 pr-2 text-xs font-semibold rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white py-1.5 h-10 shadow-3xs"
                            />
                          </div>
                        </td>

                        {/* Line Total Column */}
                        <td className="px-4 py-3 text-right text-xs font-bold text-slate-800 font-mono whitespace-nowrap w-[120px] min-w-[120px]">
                          {formatCurrency(item.subtotal)}
                        </td>

                        {/* Actions Column */}
                        <td className="px-3 py-3 text-center w-[54px] min-w-[54px]">
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(index)}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 rounded-lg transition-colors border border-transparent hover:border-rose-100 cursor-pointer"
                            title="Remove row item"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>

                      {/* Live Multi-Unit Conversion Preview / Error row */}
                      {matchedProduct && (hasConversionError || isSelectedUnitAlternate) && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={6} className="px-4 py-2 border-b border-slate-200">
                            {hasConversionError ? (
                              <div className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                                <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                                <span>No conversion defined for this unit.</span>
                              </div>
                            ) : activeConversionRule ? (
                              <div className="text-[11px] font-medium text-slate-700 bg-indigo-50/80 border border-indigo-150 px-3 py-1.5 rounded-lg flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-indigo-900 uppercase text-[10px] tracking-wider">Conversion Impact:</span>
                                  <span className="font-mono text-slate-800">
                                    Entered: <strong className="text-indigo-700 font-extrabold">{item.enteredQuantity || 1} {item.unitCode}</strong>
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 font-mono text-[11px]">
                                  <ArrowRight className="h-3 w-3 text-indigo-500 shrink-0" />
                                  <span className="font-black text-emerald-800 bg-emerald-100/90 border border-emerald-200 px-2 py-0.5 rounded">
                                    Inventory Impact: {item.baseQuantity || item.quantity} {baseUnitCode}
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    ({formatConversionSummary(item.unitCode || '', activeConversionRule.conversionFactor, baseUnitCode, activeConversionRule.direction)})
                                  </span>
                                </div>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Aggregate Totals Display Frame */}
      {items.length > 0 && (
        <div className="p-4 bg-slate-50/50 border border-slate-100 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 bg-slate-100/65 border border-slate-200/50 px-3 py-1.5 rounded-lg w-auto self-start">
            <AlertCircle className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span>Totals calculated in real time using the shared ERP calculation engine.</span>
          </div>
          <div className="flex flex-col items-end gap-1.5 font-mono">
            <div className="text-xs text-slate-500">
              Subtotal: <span className="font-bold text-slate-700">{formatCurrency(totalsSummary.subtotal)}</span>
            </div>
            {taxRatePercent > 0 && (
              <div className="text-xs text-slate-500">
                VAT ({taxRatePercent}%): <span className="font-bold text-slate-700">{formatCurrency(totalsSummary.taxAmount)}</span>
              </div>
            )}
            <div className="text-sm font-bold text-indigo-750 border-t border-slate-200 pt-1.5 w-[160px] text-right">
              Grand Total: <span className="text-indigo-600 font-extrabold">{formatCurrency(totalsSummary.totalAmount)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
