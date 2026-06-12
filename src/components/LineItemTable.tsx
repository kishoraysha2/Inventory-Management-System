import React from 'react';
import { Trash2, Plus, AlertCircle, ShoppingBag } from 'lucide-react';
import { Product, LineItem, calculateLineTotals, calculateTransactionTotals } from '../types';

interface LineItemTableProps {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  products: Product[];
  taxRatePercent?: number;
  pricingMode?: 'sellingPrice' | 'purchasePrice';
}

export default function LineItemTable({
  items,
  onChange,
  products,
  taxRatePercent = 0,
  pricingMode = 'sellingPrice',
}: LineItemTableProps) {
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

    const qty = items[index].quantity || 1;
    const totals = calculateLineTotals(qty, defaultPrice, taxRatePercent);

    const updatedItems = [...items];
    updatedItems[index] = {
      ...updatedItems[index],
      productId: matchedProduct.id,
      productName: matchedProduct.name,
      unitPrice: defaultPrice,
      subtotal: totals.subtotal,
      taxRatePercent,
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
    };
    onChange(updatedItems);
  };

  // Handle quantity input alterations
  const handleQuantityChange = (index: number, qtyString: string) => {
    const quantity = Math.max(1, parseInt(qtyString) || 0);
    const item = items[index];
    const totals = calculateLineTotals(quantity, item.unitPrice, taxRatePercent);

    const updatedItems = [...items];
    updatedItems[index] = {
      ...updatedItems[index],
      quantity,
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
    const totals = calculateLineTotals(item.quantity, unitPrice, taxRatePercent);

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
    <div id="line-item-table-container" className="w-full space-y-4">
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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all border border-indigo-100/50 shadow-3xs"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Row</span>
        </button>
      </div>

      {/* Main Grid/Table Framework */}
      <div className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50/30">
        {items.length === 0 ? (
          <div className="p-8 text-center space-y-3 bg-white">
            <div className="mx-auto w-10 h-10 rounded-full bg-slate-55 border border-slate-100 flex items-center justify-center">
              <ShoppingBag className="h-5 w-5 text-slate-400" />
            </div>
            <p className="text-xs text-slate-500 font-medium max-w-[280px] mx-auto">
              No items added to this transaction record yet. Press "Add Row" to set products.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 bg-white">
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Product
                  </th>
                  <th scope="col" className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[120px]">
                    Quantity
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[150px]">
                    Unit Price ($)
                  </th>
                  <th scope="col" className="px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[150px]">
                    Subtotal ($)
                  </th>
                  <th scope="col" className="px-4 py-3 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[60px]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 divide-dashed">
                {items.map((item, index) => (
                  <tr key={index} className="hover:bg-slate-50/40 transition-colors">
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
                          .filter((p) => p.status !== 'inactive')
                          .map((p) => (
                            <option key={p.id} value={p.id} disabled={p.currentStock <= 0 && pricingMode === 'sellingPrice'}>
                              {p.name} (SKU: {p.sku} {pricingMode === 'sellingPrice' ? `| stock: ${p.currentStock}` : ''})
                            </option>
                          ))}
                      </select>
                    </td>

                    {/* Quantity Input Column */}
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="1"
                        required
                        value={item.quantity || ''}
                        onChange={(e) => handleQuantityChange(index, e.target.value)}
                        className="w-full text-center text-xs font-semibold rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white px-2 py-1.5 h-10 shadow-3xs"
                      />
                    </td>

                    {/* Unit Price Column */}
                    <td className="px-4 py-3">
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">$</span>
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
                    <td className="px-4 py-3 text-right text-xs font-bold text-slate-800 font-mono whitespace-nowrap">
                      ${item.subtotal.toFixed(2)}
                    </td>

                    {/* Actions Column */}
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(index)}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 rounded-lg transition-colors border border-transparent hover:border-rose-100"
                        title="Remove row item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
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
              Subtotal: <span className="font-bold text-slate-700">${totalsSummary.subtotal.toFixed(2)}</span>
            </div>
            {taxRatePercent > 0 && (
              <div className="text-xs text-slate-500">
                VAT ({taxRatePercent}%): <span className="font-bold text-slate-700">${totalsSummary.taxAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="text-sm font-bold text-indigo-750 border-t border-slate-200 pt-1.5 w-[160px] text-right">
              Grand Total: <span className="text-indigo-600 font-extrabold">${totalsSummary.totalAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
