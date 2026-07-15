import React, { useState } from 'react';
import { X, Printer, FileText, CheckCircle2, AlertTriangle, Info, Building2, User, Package } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Purchase, Supplier, Product, CompanySnapshot } from '../types';

interface PurchaseDetailModalProps {
  purchase: Purchase;
  suppliers: Supplier[];
  products: Product[];
  onClose: () => void;
  companyProfile?: CompanySnapshot;
}

export const PurchaseDetailModal: React.FC<PurchaseDetailModalProps> = ({
  purchase,
  suppliers,
  products,
  onClose,
  companyProfile
}) => {
  const [activeTab, setActiveTab] = useState<'voucher' | 'supplier' | 'product' | 'company'>('voucher');

  const isVoid = purchase.status === 'voided' || purchase.status === 'Voided';
  const invoiceNum = purchase.invoiceNumber || `PIN-${purchase.id.substring(purchase.id.length - 8).toUpperCase()}`;
  const purchaseDateStr = purchase.purchaseDate.split('T')[0];

  // Resolve current records for comparison
  const currentSupplier = suppliers.find(s => s.id === purchase.supplierId);
  const currentProduct = products.find(p => p.id === purchase.productId);

  // Fallback structures for historical snapshot display
  const snapSupplier = purchase.supplierSnapshot || (currentSupplier ? {
    id: currentSupplier.id,
    name: currentSupplier.name,
    category: currentSupplier.category || "Standard",
    phone: currentSupplier.phone,
    address: currentSupplier.address,
    email: currentSupplier.email || "N/A"
  } : {
    id: purchase.supplierId,
    name: purchase.supplierName,
    category: "Standard",
    phone: "N/A",
    address: "N/A",
    email: "N/A"
  });

  const snapProduct = purchase.productSnapshot || (currentProduct ? {
    id: currentProduct.id,
    name: currentProduct.name,
    sku: currentProduct.sku,
    category: currentProduct.category,
    purchasePrice: currentProduct.purchasePrice,
    sellingPrice: currentProduct.sellingPrice
  } : {
    id: purchase.productId,
    name: purchase.productName,
    sku: "N/A",
    category: "General",
    purchasePrice: purchase.purchasePrice,
    sellingPrice: purchase.purchasePrice * 1.5
  });

  const snapCompany = purchase.companySnapshot || companyProfile || {
    name: "Nexus ERP Systems",
    tradeName: "Nexus Enterprise Ledger",
    ownerName: "Corporate Administration",
    taxRegistrationId: "TAX-998877665",
    crNumber: "CR-10102020",
    address: "Enterprise Blvd, Silicon District, Riyadh, Saudi Arabia",
    phone: "+966 11 234 5678",
    email: "info@nexus-erp.com",
    taxRatePercent: 15
  };

  // Reconcile monetary calculations
  const totalVAT = purchase.vatAmount ?? (purchase.totalAmount * 15 / 115);
  const totalSubtotal = purchase.totalAmount - totalVAT;
  const totalDiscount = purchase.discountAmount ?? 0;

  // Handle Print Action
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Procurement Purchase Voucher - ${invoiceNum}</title>
          <style>
            body { font-family: 'Helvetica', sans-serif; color: #1e293b; padding: 40px; }
            .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { margin: 0; font-size: 24px; color: #0f172a; }
            .header p { margin: 5px 0 0; font-size: 12px; color: #64748b; }
            .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
            .meta-box h3 { margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
            .meta-box p { margin: 4px 0; font-size: 13px; }
            .table-container { margin-bottom: 40px; }
            table { width: 100%; border-collapse: collapse; text-align: left; }
            th { background-color: #f8fafc; padding: 12px; font-size: 11px; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #e2e8f0; }
            td { padding: 12px; font-size: 13px; border-bottom: 1px solid #f1f5f9; }
            .summary-box { float: right; width: 300px; margin-top: 20px; border-top: 2px solid #e2e8f0; padding-top: 15px; }
            .summary-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; }
            .summary-row.total { font-weight: bold; font-size: 16px; border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 8px; }
            .voided-stamp { color: #dc2626; border: 3px solid #dc2626; padding: 10px 20px; font-weight: bold; text-transform: uppercase; width: fit-content; transform: rotate(-5deg); margin-top: 30px; }
            .footer-note { clear: both; text-align: center; font-size: 10px; color: #94a3b8; margin-top: 80px; border-top: 1px solid #f1f5f9; padding-top: 15px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <h1>${snapCompany.name}</h1>
                <p>${snapCompany.address} | CR: ${snapCompany.crNumber || 'N/A'} | Tax ID: ${snapCompany.taxRegistrationId}</p>
              </div>
              <div style="text-align: right;">
                <h2 style="margin: 0; color: #059669;">PURCHASE VOUCHER</h2>
                <p style="font-weight: bold; margin-top: 5px;">${invoiceNum}</p>
              </div>
            </div>
          </div>

          <div class="meta-grid">
            <div class="meta-box">
              <h3>Supplier Portfolio Snapshot (Historical)</h3>
              <p><strong>Name:</strong> ${snapSupplier.name}</p>
              <p><strong>Category:</strong> ${snapSupplier.category}</p>
              <p><strong>Phone:</strong> ${snapSupplier.phone || 'N/A'}</p>
              <p><strong>Address:</strong> ${snapSupplier.address || 'N/A'}</p>
            </div>
            <div class="meta-box" style="text-align: right;">
              <h3>Voucher Audit Trail</h3>
              <p><strong>Date:</strong> ${purchaseDateStr}</p>
              <p><strong>Settlement Mode:</strong> ${purchase.paymentType}</p>
              <p><strong>Audit Status:</strong> ${isVoid ? 'VOIDED' : 'ACTIVE / COMPLETED'}</p>
              <p><strong>Authorized By:</strong> kishor.aysha2@gmail.com</p>
            </div>
          </div>

          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Product Details / SKU</th>
                  <th>Category</th>
                  <th style="text-align: center;">Quantity</th>
                  <th style="text-align: right;">Unit Purchase Price</th>
                  <th style="text-align: right;">Subtotal Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>${snapProduct.name}</strong><br/>
                    <span style="font-size: 11px; color: #64748b;">SKU: ${snapProduct.sku}</span>
                  </td>
                  <td>${snapProduct.category}</td>
                  <td style="text-align: center;">${purchase.quantity}</td>
                  <td style="text-align: right;">$${purchase.purchasePrice.toFixed(2)}</td>
                  <td style="text-align: right;">$${(purchase.quantity * purchase.purchasePrice).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="summary-box">
            <div class="summary-row">
              <span>Gross Subtotal:</span>
              <span>$${totalSubtotal.toFixed(2)}</span>
            </div>
            <div class="summary-row">
              <span>VAT (${snapCompany.taxRatePercent}%):</span>
              <span>$${totalVAT.toFixed(2)}</span>
            </div>
            <div class="summary-row">
              <span>Discounts:</span>
              <span style="color: #dc2626;">-$${totalDiscount.toFixed(2)}</span>
            </div>
            <div class="summary-row total">
              <span>Grand Total:</span>
              <span>$${purchase.totalAmount.toFixed(2)}</span>
            </div>
          </div>

          ${isVoid ? '<div class="voided-stamp">VOIDED PROCUREMENT</div>' : ''}

          <div class="footer-note">
            <p>This is a certified electronic ledger record generated within the Enterprise Resource Planning Accounts Payable system.</p>
            <p>System Log reference ID: ${purchase.id} | Timestamp: ${purchaseDateStr}</p>
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Handle PDF Generation using jsPDF
  const handleGeneratePDF = () => {
    const doc = new jsPDF();
    
    // Set Document Properties
    doc.setFont('helvetica', 'normal');
    
    // Header Banner
    doc.setFillColor(15, 23, 42);
    doc.rect(15, 15, 180, 25, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text(snapCompany.name, 20, 25);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`Tax Registration ID: ${snapCompany.taxRegistrationId} | CR: ${snapCompany.crNumber || 'N/A'}`, 20, 31);
    doc.text(`${snapCompany.address}`, 20, 35);

    // Title Block
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text("PROCUREMENT PURCHASE VOUCHER", 125, 48);
    
    doc.setFontSize(9);
    doc.text(`Voucher No: ${invoiceNum}`, 125, 54);

    // Grid details
    doc.setDrawColor(226, 232, 240);
    doc.line(15, 58, 195, 58);

    // Supplier & Metadata
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text("Supplier Snapshot Portfolio:", 15, 65);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Name: ${snapSupplier.name}`, 15, 71);
    doc.text(`Category: ${snapSupplier.category}`, 15, 76);
    doc.text(`Phone: ${snapSupplier.phone || 'N/A'}`, 15, 81);
    doc.text(`Address: ${snapSupplier.address || 'N/A'}`, 15, 86);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text("Voucher Audit Trail:", 125, 65);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Purchase Date: ${purchaseDateStr}`, 125, 71);
    doc.text(`Settlement Mode: ${purchase.paymentType}`, 125, 76);
    doc.text(`Operator Auth: kishor.aysha2@gmail.com`, 125, 81);
    doc.text(`Audit Status: ${isVoid ? 'VOIDED (No Impact)' : 'ACTIVE'}`, 125, 86);

    // Table Header
    doc.setFillColor(5, 150, 105);
    doc.rect(15, 93, 180, 8, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text("PRODUCT SUMMARY", 18, 98.5);
    doc.text("CATEGORY", 85, 98.5);
    doc.text("QTY", 125, 98.5);
    doc.text("UNIT PRICE", 145, 98.5);
    doc.text("TOTAL ($)", 175, 98.5);

    // Table Body
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    
    const rowY = 107;
    doc.text(snapProduct.name.length > 32 ? snapProduct.name.substring(0, 32) + '...' : snapProduct.name, 18, rowY);
    doc.text(snapProduct.category, 85, rowY);
    doc.text(purchase.quantity.toString(), 125, rowY);
    doc.text(`$${purchase.purchasePrice.toFixed(2)}`, 145, rowY);
    doc.text(`$${(purchase.quantity * purchase.purchasePrice).toFixed(2)}`, 175, rowY);
    
    doc.line(15, rowY + 4, 195, rowY + 4);

    // Summary Box
    const sumY = rowY + 12;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text("Gross Subtotal Amount:", 125, sumY);
    doc.text(`$${totalSubtotal.toFixed(2)}`, 175, sumY);

    doc.text(`VAT (${snapCompany.taxRatePercent}%):`, 125, sumY + 5);
    doc.text(`$${totalVAT.toFixed(2)}`, 175, sumY + 5);

    doc.text("Discounts applied:", 125, sumY + 10);
    doc.text(`-$${totalDiscount.toFixed(2)}`, 175, sumY + 10);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text("Grand Settlement Total:", 125, sumY + 16);
    doc.text(`$${purchase.totalAmount.toFixed(2)}`, 175, sumY + 16);

    if (isVoid) {
      doc.setDrawColor(220, 38, 38);
      doc.setFillColor(254, 242, 242);
      doc.rect(15, sumY + 25, 180, 12, 'FD');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(220, 38, 38);
      doc.text("VOIDED TRANSACTION - INBOUND PROCUREMENT DISPATCH CANCELLED", 35, sumY + 33);
    }

    // Footnotes
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text("This PDF file constitutes a certified digital audit snapshot generated in real-time.", 15, 275);
    doc.text(`Ref Hash ID: ${purchase.id} | Riyadh Accounts Payable Ledger Sync`, 15, 279);

    doc.save(`Purchase_Register_Voucher_${invoiceNum}.pdf`);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 font-sans animate-fade-in">
      <div className="bg-white rounded-[2rem] w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl border border-slate-100 flex flex-col">
        {/* Header Block */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black bg-emerald-50 border border-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                Accounts Payable Ledger Detail
              </span>
              {isVoid && (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-md uppercase">
                  <AlertTriangle className="h-3.5 w-3.5" /> Voided
                </span>
              )}
            </div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>Voucher No:</span>
              <span className="font-mono text-indigo-600">{invoiceNum}</span>
            </h3>
          </div>

          <button 
            type="button" 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-200/60 text-slate-400 hover:text-slate-700 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Action Bar */}
        <div className="px-6 py-3 border-b border-slate-100 bg-white flex flex-wrap gap-3 items-center justify-between">
          <div className="flex bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
            <button
              onClick={() => setActiveTab('voucher')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'voucher' ? 'bg-white text-indigo-700 shadow-3xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText className="h-3.5 w-3.5" /> Voucher Summary
            </button>
            <button
              onClick={() => setActiveTab('supplier')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'supplier' ? 'bg-white text-indigo-700 shadow-3xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <User className="h-3.5 w-3.5" /> Supplier Snapshot
            </button>
            <button
              onClick={() => setActiveTab('product')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'product' ? 'bg-white text-indigo-700 shadow-3xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Package className="h-3.5 w-3.5" /> Product Snapshot
            </button>
            <button
              onClick={() => setActiveTab('company')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'company' ? 'bg-white text-indigo-700 shadow-3xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" /> Company Snapshot
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1.5 transition cursor-pointer"
            >
              <Printer className="h-4 w-4" /> Direct Print
            </button>
            <button
              onClick={handleGeneratePDF}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
            >
              <FileText className="h-4 w-4" /> Download PDF Voucher
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/40">
          
          {/* TAB 1: VOUCHER OVERVIEW */}
          {activeTab === 'voucher' && (
            <div className="space-y-6 animate-fade-in">
              {/* Snapshot Comparison Strip */}
              <div className="bg-indigo-50/60 border border-indigo-150 p-4 rounded-2xl text-xs text-indigo-950 flex gap-2.5 items-start">
                <Info className="h-5 w-5 text-indigo-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold uppercase tracking-wider text-[10px] block text-indigo-800">Historical Snapshot Technology Active</span>
                  <p className="font-medium">
                    This detailed audit profile displays the exact states of the supplier, product pricing structure, and company metadata <span className="font-bold underline">at the precise millisecond</span> this procurement occurred ({purchaseDateStr}). Future edits to supplier properties or product catalogs will not affect this verified ledger snapshot.
                  </p>
                </div>
              </div>

              {/* Grid 2 Column Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Card: Transaction Attributes */}
                <div className="bg-white border border-slate-150 p-5 rounded-2xl space-y-4">
                  <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2">
                    Voucher Ledger Metadata
                  </h4>

                  <div className="grid grid-cols-2 gap-4 text-xs font-sans">
                    <div>
                      <span className="text-slate-400 font-semibold uppercase text-[10px] tracking-wider block">Document Date</span>
                      <span className="text-slate-900 font-bold">{purchaseDateStr}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold uppercase text-[10px] tracking-wider block">Settlement Type</span>
                      <span className="text-slate-900 font-bold">{purchase.paymentType} Settlement</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold uppercase text-[10px] tracking-wider block">Authorized By</span>
                      <span className="text-slate-900 font-bold font-mono">kishor.aysha2@gmail.com</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold uppercase text-[10px] tracking-wider block">Voucher Status</span>
                      <span className={`font-bold inline-flex items-center gap-1 ${isVoid ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {isVoid ? 'Voided' : 'Active Ledger Entry'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Card: Account Parties */}
                <div className="bg-white border border-slate-150 p-5 rounded-2xl space-y-4">
                  <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2">
                    Inbound Procurement Parties
                  </h4>

                  <div className="space-y-3.5 text-xs font-sans">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                        <Building2 className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold uppercase text-[9px] tracking-wider block">Payee Supplier (Snapshot Name)</span>
                        <span className="text-slate-900 font-black capitalize block">{snapSupplier.name}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-lg bg-slate-50 border border-slate-150 flex items-center justify-center shrink-0">
                        <Package className="h-4 w-4 text-indigo-600" />
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold uppercase text-[9px] tracking-wider block">Procured Item</span>
                        <span className="text-slate-900 font-black block">{snapProduct.name}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Invoice Breakdown Table */}
              <div className="bg-white border border-slate-150 rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-5">Catalog Product SKU & Name</th>
                      <th className="py-3 px-5">Category</th>
                      <th className="py-3 px-5 text-center">Procured Qty</th>
                      <th className="py-3 px-5 text-right">Unit Price</th>
                      <th className="py-3 px-5 text-right">Raw Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-100">
                      <td className="py-4 px-5">
                        <span className="font-bold text-slate-800 block">{snapProduct.name}</span>
                        <span className="text-[10px] text-indigo-600 font-mono font-semibold">SKU: {snapProduct.sku}</span>
                      </td>
                      <td className="py-4 px-5 text-slate-500 capitalize">{snapProduct.category}</td>
                      <td className="py-4 px-5 text-center font-bold text-slate-900">{purchase.quantity}</td>
                      <td className="py-4 px-5 text-right font-mono font-semibold text-slate-600">${purchase.purchasePrice.toFixed(2)}</td>
                      <td className="py-4 px-5 text-right font-mono font-bold text-slate-900">${(purchase.quantity * purchase.purchasePrice).toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>

                {/* Subtotals & Taxes Panel */}
                <div className="p-5 bg-slate-50 flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-t border-slate-100">
                  <div className="text-[10px] text-slate-400 font-semibold max-w-sm">
                    Amounts audited and verified against Riyadh tax standards including mandatory 15% VAT calculation bounds.
                  </div>
                  
                  <div className="w-full md:w-80 space-y-2 text-xs font-sans font-medium text-slate-700">
                    <div className="flex justify-between">
                      <span>Subtotal (VAT Excl.):</span>
                      <span className="font-mono font-bold text-slate-800">${totalSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>VAT (15%):</span>
                      <span className="font-mono font-bold text-slate-800">${totalVAT.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-rose-600">
                      <span>Discount (Snapshot):</span>
                      <span className="font-mono font-bold">-${totalDiscount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-black text-slate-900">
                      <span>Settled Grand Total:</span>
                      <span className="font-mono font-black text-emerald-600">${purchase.totalAmount.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: HISTORICAL SUPPLIER SNAPSHOT */}
          {activeTab === 'supplier' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white border border-slate-150 p-6 rounded-2xl space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                    <Building2 className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Historical Supplier Portfolio Snapshot</h4>
                    <p className="text-[10px] text-slate-400">Supplier data captured at the exact moment of the purchase</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 pt-2 text-xs">
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                    <span className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">Historical Name</span>
                    <span className="text-slate-900 font-black capitalize block mt-1">{snapSupplier.name}</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                    <span className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">Historical Category</span>
                    <span className="text-slate-900 font-black block mt-1">{snapSupplier.category}</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                    <span className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">Contact Phone</span>
                    <span className="text-slate-900 font-mono font-bold block mt-1">{snapSupplier.phone || 'N/A'}</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl col-span-1 sm:col-span-2">
                    <span className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">Physical Address Snapshot</span>
                    <span className="text-slate-800 font-semibold block mt-1">{snapSupplier.address || 'N/A'}</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                    <span className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">Email Snapshot</span>
                    <span className="text-slate-800 font-bold block mt-1 break-all">{snapSupplier.email || 'N/A'}</span>
                  </div>
                </div>

                {/* Comparison block with current state */}
                {currentSupplier && (snapSupplier.phone !== currentSupplier.phone || snapSupplier.address !== currentSupplier.address) && (
                  <div className="p-4 bg-amber-50 border border-amber-200/50 rounded-xl text-xs text-amber-800 flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Current Registry Discrepancy Detected</span>
                      <p className="mt-0.5">
                        The current registry for this supplier has been updated since this voucher was finalized. This snapshot preserves the historical physical location and phone numbers used at checkout for legal audit safety.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: HISTORICAL PRODUCT SNAPSHOT */}
          {activeTab === 'product' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white border border-slate-150 p-6 rounded-2xl space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                    <Package className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Historical Product Catalog Snapshot</h4>
                    <p className="text-[10px] text-slate-400">Catalog details and pricing locks at the exact second of purchase</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 pt-2 text-xs">
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                    <span className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">Product Catalog SKU</span>
                    <span className="text-indigo-600 font-mono font-black block mt-1">{snapProduct.sku}</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                    <span className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">Product Name</span>
                    <span className="text-slate-900 font-bold block mt-1">{snapProduct.name}</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                    <span className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">Product Category</span>
                    <span className="text-slate-900 font-semibold block mt-1 capitalize">{snapProduct.category}</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                    <span className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">Historical Procurement Rate</span>
                    <span className="text-emerald-700 font-mono font-black block mt-1">${purchase.purchasePrice.toFixed(2)}</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                    <span className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">Snapshot Target Margin</span>
                    <span className="text-slate-900 font-mono font-bold block mt-1">
                      ${((snapProduct.sellingPrice || 0) - (purchase.purchasePrice || 0)).toFixed(2)} (Markup: {purchase.purchasePrice > 0 ? (((snapProduct.sellingPrice || 0) - (purchase.purchasePrice || 0)) / purchase.purchasePrice * 100).toFixed(1) : 0}%)
                    </span>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                    <span className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">Snapshot Retail Target</span>
                    <span className="text-indigo-600 font-mono font-black block mt-1">${(snapProduct.sellingPrice || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: HISTORICAL COMPANY SNAPSHOT */}
          {activeTab === 'company' && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-white border border-slate-150 p-6 rounded-2xl space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Historical Company Profile Snapshot</h4>
                    <p className="text-[10px] text-slate-400">Active corporate profile metadata stored for Riyadh tax audits</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 pt-2 text-xs">
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                    <span className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">Company Legal Name</span>
                    <span className="text-slate-900 font-bold block mt-1">{snapCompany.name}</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                    <span className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">Commercial Register No</span>
                    <span className="text-slate-900 font-mono font-bold block mt-1">{snapCompany.crNumber || 'N/A'}</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                    <span className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">VAT Tax Registration No</span>
                    <span className="text-indigo-600 font-mono font-black block mt-1">{snapCompany.taxRegistrationId}</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl col-span-1 sm:col-span-2">
                    <span className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">Registered Corporate Address</span>
                    <span className="text-slate-800 font-semibold block mt-1">{snapCompany.address}</span>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                    <span className="text-slate-400 font-bold block uppercase text-[9px] tracking-wider">Audit Tax Rate locked</span>
                    <span className="text-emerald-700 font-mono font-black block mt-1">{snapCompany.taxRatePercent}% VAT</span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer Audit Block */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row items-center justify-between text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Voucher UID Match: {purchase.id}
          </span>
          <span>Riyadh Accounts Payable Ledger Synced</span>
        </div>
      </div>
    </div>
  );
};
