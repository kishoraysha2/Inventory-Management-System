import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  X, 
  Printer, 
  Download, 
  Settings, 
  Building2, 
  MapPin, 
  Phone, 
  Mail, 
  Percent, 
  FileText, 
  Check, 
  Info,
  DollarSign
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { Sale, Customer, Product } from '../types';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface TaxInvoiceModalProps {
  sale: Sale;
  customers: Customer[];
  products: Product[];
  sales: Sale[];
  customerPayments: any[];
  onClose: () => void;
}

interface CompanyProfile {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  taxRegistrationId: string;
  taxRatePercent: number;
  tradeName?: string;
  ownerName?: string;
  crNumber?: string;
  logo?: string;
}

const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  name: "Apex Global Supply Ltd.",
  address: "740 Industrial Boulevard, Suite C, Austin, TX 78701",
  phone: "+1 (512) 555-0193",
  email: "billing@apexsupply.com",
  website: "www.apexsupply.com",
  taxRegistrationId: "VAT-US948301140B",
  taxRatePercent: 15,
  tradeName: "Apex Global Supply",
  ownerName: "Apex Global LLC",
  crNumber: "CR-1010349283",
  logo: ""
};

export default function TaxInvoiceModal({ sale, customers, products, sales, customerPayments, onClose }: TaxInvoiceModalProps) {
  // --- State Configuration with LocalStorage Fallback and Firestore Sync ---
  const [company, setCompany] = useState<CompanyProfile>(() => {
    const saved = localStorage.getItem('invoice_company_profile');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to load saved company profile", e);
      }
    }
    return DEFAULT_COMPANY_PROFILE;
  });

  const [isSavingCompany, setIsSavingCompany] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Load Business Profile from Firestore
  useEffect(() => {
    const fetchCompanyProfile = async () => {
      try {
        if (!auth.currentUser) return;
        const snapshot = await getDoc(doc(db, 'businessProfile', 'config'));
        if (snapshot.exists()) {
          const data = snapshot.data();
          setCompany({
            name: data.name || DEFAULT_COMPANY_PROFILE.name,
            address: data.address || DEFAULT_COMPANY_PROFILE.address,
            phone: data.phone || DEFAULT_COMPANY_PROFILE.phone,
            email: data.email || DEFAULT_COMPANY_PROFILE.email,
            website: data.website || DEFAULT_COMPANY_PROFILE.website,
            taxRegistrationId: data.taxRegistrationId || DEFAULT_COMPANY_PROFILE.taxRegistrationId,
            taxRatePercent: typeof data.taxRatePercent === 'number' ? data.taxRatePercent : DEFAULT_COMPANY_PROFILE.taxRatePercent,
            tradeName: data.tradeName || '',
            ownerName: data.ownerName || '',
            crNumber: data.crNumber || '',
            logo: data.logo || ''
          });
        }
      } catch (err) {
        console.error("Failed to fetch Firestore company profile:", err);
      }
    };
    fetchCompanyProfile();
  }, []);

  // Save Company Profile to Firestore permanent config document
  const handleSaveCompanyProfile = async () => {
    setIsSavingCompany(true);
    setSaveStatus('idle');
    try {
      const cleanProfile = {
        name: company.name.trim(),
        tradeName: company.tradeName ? company.tradeName.trim() : '',
        ownerName: company.ownerName ? company.ownerName.trim() : '',
        taxRegistrationId: company.taxRegistrationId.trim(),
        crNumber: company.crNumber ? company.crNumber.trim() : '',
        address: company.address.trim(),
        phone: company.phone.trim(),
        email: company.email ? company.email.trim() : '',
        website: company.website ? company.website.trim() : '',
        logo: company.logo ? company.logo.trim() : '',
        taxRatePercent: Number(company.taxRatePercent) || 0
      };

      if (auth.currentUser) {
        await setDoc(doc(db, 'businessProfile', 'config'), cleanProfile);
      }
      localStorage.setItem('invoice_company_profile', JSON.stringify(cleanProfile));
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err: any) {
      console.error("Save company profile error:", err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 5000);
    } finally {
      setIsSavingCompany(false);
    }
  };

  // Calculate payment status, summary, and history track
  const paymentInfo = React.useMemo(() => {
    const isCredit = (sale.paymentType || '').toString().toUpperCase().trim() === 'CREDIT';
    const isVoid = (sale as any).status === 'VOID' || (sale as any).status === 'voided';
    
    if (isVoid) {
      return {
        amountPaid: 0,
        remainingBalance: 0,
        status: 'VOIDED',
        paymentHistory: [] as { paymentDate: string; amountPaid: number; notes?: string }[]
      };
    }

    if (!isCredit) {
      return {
        amountPaid: sale.totalAmount,
        remainingBalance: 0,
        status: 'Fully Paid',
        paymentHistory: [
          {
            paymentDate: sale.saleDate,
            amountPaid: sale.totalAmount,
            notes: 'Cash immediate settlement'
          }
        ]
      };
    }

    const custId = sale.customerId;

    // Filter and sort all valid credit sales of this customer chronologically
    const custSales = sales.filter(s => {
      const status = ((s as any).status || '').toString().toUpperCase().trim();
      const sVoid = status === 'VOID' || status === 'VOIDED';
      const sCredit = (s.paymentType || '').toString().toUpperCase().trim() === 'CREDIT';
      return s.customerId === custId && !sVoid && sCredit;
    });
    custSales.sort((a, b) => new Date(a.saleDate || a.timestamp || 0).getTime() - new Date(b.saleDate || b.timestamp || 0).getTime());

    // Filter and sort all valid payments of this customer chronologically
    const custPayments = customerPayments.filter(p => {
      const status = (p.status || '').toString().toUpperCase().trim();
      return p.customerId === custId && status !== 'VOID' && status !== 'VOIDED';
    });
    custPayments.sort((a, b) => new Date(a.paymentDate || 0).getTime() - new Date(b.paymentDate || 0).getTime());

    // Allocate payment coins FIFO style
    interface TempSale {
      id: string;
      totalAmount: number;
      alreadyAllocated: number;
      paymentHistory: { paymentDate: string; amountPaid: number; notes?: string }[];
    }

    const saleAllocations = new Map<string, TempSale>();
    custSales.forEach(s => {
      saleAllocations.set(s.id, {
        id: s.id,
        totalAmount: s.totalAmount,
        alreadyAllocated: 0,
        paymentHistory: []
      });
    });

    // Go item-by-item through payments
    custPayments.forEach(p => {
      let amountLeft = Number(p.amountPaid) || 0;
      
      for (const s of custSales) {
        if (amountLeft <= 0) break;
        
        const alloc = saleAllocations.get(s.id);
        if (!alloc) continue;
        
        const needed = alloc.totalAmount - alloc.alreadyAllocated;
        if (needed > 0) {
          if (amountLeft >= needed) {
            alloc.alreadyAllocated += needed;
            alloc.paymentHistory.push({
              paymentDate: p.paymentDate,
              amountPaid: needed,
              notes: p.notes
            });
            amountLeft -= needed;
          } else {
            alloc.alreadyAllocated += amountLeft;
            alloc.paymentHistory.push({
              paymentDate: p.paymentDate,
              amountPaid: amountLeft,
              notes: p.notes
            });
            amountLeft = 0;
          }
        }
      }
    });

    const finalAlloc = saleAllocations.get(sale.id) || {
      totalAmount: sale.totalAmount,
      alreadyAllocated: 0,
      paymentHistory: [] as { paymentDate: string; amountPaid: number; notes?: string }[]
    };

    const remaining = Math.max(0, finalAlloc.totalAmount - finalAlloc.alreadyAllocated);
    let status: 'Unpaid' | 'Partially Paid' | 'Fully Paid' = 'Unpaid';
    if (finalAlloc.alreadyAllocated === 0) {
      status = 'Unpaid';
    } else if (remaining === 0) {
      status = 'Fully Paid';
    } else {
      status = 'Partially Paid';
    }

    return {
      amountPaid: finalAlloc.alreadyAllocated,
      remainingBalance: remaining,
      status: status,
      paymentHistory: finalAlloc.paymentHistory
    };
  }, [sale, sales, customerPayments]);

  const [invoiceNotes, setInvoiceNotes] = useState<string>("Terms: Net 30 days. Please include the Invoice Number with your payment. Thank you for your continued business!");
  const [invoiceNumber, setInvoiceNumber] = useState<string>(() => {
    // Generate clean predictable invoice tracking code
    const indexPart = sale.id.replace('sale-', '');
    return `INV-2026-${indexPart.length > 5 ? indexPart.substring(indexPart.length - 5) : indexPart}`;
  });

  const [isNoteSuccess, setIsNoteSuccess] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Sync profile edits to persistence
  useEffect(() => {
    localStorage.setItem('invoice_company_profile', JSON.stringify(company));
  }, [company]);

  // Find linked physical records
  const matchedCustomer = customers.find(c => c.id === sale.customerId);
  const matchedProduct = products.find(p => p.id === sale.productId);

  // --- Invoice Financial Formula Processing ---
  const isUpgradedSale = sale.subtotal !== undefined;
  const subtotal = isUpgradedSale ? sale.subtotal : sale.totalAmount;
  const taxRatePercent = isUpgradedSale ? sale.taxRatePercent : company.taxRatePercent;
  const taxAmount = isUpgradedSale ? sale.taxAmount : (subtotal * company.taxRatePercent) / 100;
  const grandTotal = isUpgradedSale ? sale.totalAmount : subtotal + taxAmount;

  // Track customer meta defaults
  const customerAddress = matchedCustomer?.address || "Address not specified, physical profile pending updates";
  const customerPhone = matchedCustomer?.phone || "N/A";

  // --- Action 1: Standard Browser Hardware Printing ---
  const handlePrint = () => {
    window.print();
  };

  // --- Action 2: Custom Vector PDF Builder ---
  const handleDownloadPDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // 1. Decorative Grid Accents (Subtle high-end design styling)
    doc.setFillColor(30, 41, 59); // Primary dark slate block
    doc.rect(0, 0, 210, 8, 'F'); // Top colored ribbon tag
    
    // 2. Company Info Header (Left aligned)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(company.name.toUpperCase(), 15, 25);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(company.address, 15, 31);
    doc.text(`Phone: ${company.phone}  |  Email: ${company.email}`, 15, 36);
    doc.text(`Web: ${company.website}  |  Tax ID: ${company.taxRegistrationId}`, 15, 41);

    // 3. Document Identifier Titles (Right aligned)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(79, 70, 229); // indigo-600
    doc.text('TAX INVOICE', 145, 25);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(`Invoice No: ${invoiceNumber}`, 145, 31);
    doc.text(`Date Issued: ${new Date(sale.saleDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`, 145, 36);
    doc.text(`Payment Term: ${sale.paymentType === 'Credit' ? 'Credit Account (Net 30)' : 'Cash / Instant settled'}`, 145, 41);

    // 4. Clean separating divider line
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.5);
    doc.line(15, 47, 195, 47);

    // 5. Customer billing info card block
    doc.setFillColor(248, 250, 252); // slate-50 grid panel
    doc.rect(15, 52, 180, 25, 'F');
    doc.setDrawColor(241, 245, 249);
    doc.rect(15, 52, 180, 25, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105); // slate-600 outline
    doc.text('BILL TO (CUSTOMER INFORMATION):', 20, 58);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(sale.customerName, 20, 64);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Physical Address: ${customerAddress}`, 20, 69);
    doc.text(`Contact Phone: ${customerPhone}  |  Account ID: ${sale.customerId}`, 20, 73);

    // 6. Items Data Grid Table Header
    doc.setFillColor(30, 41, 59); // slate-800 backdrop table header
    doc.rect(15, 87, 180, 10, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    doc.text('LINE ITEM DETAILS', 18, 93.5);
    doc.text('SKU / SERIAL', 95, 93.5);
    doc.text('QTY', 135, 93.5);
    doc.text('UNIT PRICE', 152.5, 93.5);
    doc.text('TOTAL', 180, 93.5);

    // 7. Active Table Row Data
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(15, 107, 195, 107); // Bottom border line of data row

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(sale.productName, 18, 103);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(matchedProduct?.sku || `SKU-${sale.productId.substring(0,6).toUpperCase()}`, 95, 103);
    doc.text(sale.quantity.toString(), 135, 103);
    doc.text(`$${sale.sellingPrice.toFixed(2)}`, 152.5, 103);
    doc.text(`$${subtotal.toFixed(2)}`, 180, 103);

    // 8. Calculations breakdown box on bottom-right
    let boxY = 117;
    doc.setFillColor(250, 250, 250);
    doc.rect(120, boxY, 75, 28, 'F');
    doc.rect(120, boxY, 75, 28, 'S');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Net Taxable Subtotal:', 124, boxY + 6);
    doc.setTextColor(15, 23, 42);
    doc.text(`$${subtotal.toFixed(2)}`, 172, boxY + 6);

    doc.setTextColor(100, 116, 139);
    doc.text(`Sales Tax / VAT (${taxRatePercent}%):`, 124, boxY + 12);
    doc.setTextColor(15, 23, 42);
    doc.text(`$${taxAmount.toFixed(2)}`, 172, boxY + 12);

    doc.setDrawColor(226, 232, 240);
    doc.line(120, boxY + 17, 195, boxY + 17);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(79, 70, 229); // Purple bold Total
    doc.text('INVOICE TOTAL DUE:', 124, boxY + 23);
    doc.text(`$${grandTotal.toFixed(2)}`, 172, boxY + 23);

    // 9. Payment Status & Summary in PDF
    let payY = 150;
    doc.setFillColor(248, 250, 252); // slate-50
    doc.rect(15, payY, 85, 45, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(15, payY, 85, 45, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text('PAYMENT SUMMARY', 20, payY + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Total Paid to Date:', 20, payY + 15);
    doc.setTextColor(16, 185, 129); // emerald-500 equivalent style color
    doc.setFont('helvetica', 'bold');
    doc.text(`$${paymentInfo.amountPaid.toFixed(2)}`, 65, payY + 15);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Remaining Owed:', 20, payY + 23);
    doc.setTextColor(239, 68, 68); // rose-500
    doc.setFont('helvetica', 'bold');
    doc.text(`$${paymentInfo.remainingBalance.toFixed(2)}`, 65, payY + 23);

    doc.setDrawColor(226, 232, 240);
    doc.line(15, payY + 29, 100, payY + 29);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text('PAYMENT STATUS:', 20, payY + 36);
    
    // Status text color depending on state
    if (paymentInfo.status === 'Fully Paid') {
      doc.setTextColor(16, 185, 129);
    } else if (paymentInfo.status === 'Partially Paid') {
      doc.setTextColor(245, 158, 11);
    } else {
      doc.setTextColor(239, 68, 68);
    }
    doc.text(paymentInfo.status.toUpperCase(), 58, payY + 36);

    // 10. Payment History in PDF (beside summary box, width 90)
    doc.setFillColor(255, 255, 255);
    doc.rect(105, payY, 90, 45, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(105, payY, 90, 45, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text('PAYMENT HISTORY TRACK', 110, payY + 6);

    // List individual payments in history
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Payment Date', 110, payY + 14);
    doc.text('Amount Paid', 165, payY + 14);
    doc.line(105, payY + 16, 195, payY + 16);

    doc.setFont('helvetica', 'normal');
    let historyY = payY + 22;
    if (paymentInfo.paymentHistory.length === 0) {
      doc.setTextColor(148, 163, 184);
      doc.text('No payment history records found.', 110, historyY);
    } else {
      paymentInfo.paymentHistory.slice(0, 3).forEach((ph) => {
        doc.setTextColor(100, 116, 139);
        doc.text(new Date(ph.paymentDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }), 110, historyY);
        doc.setTextColor(16, 185, 129);
        doc.text(`$${ph.amountPaid.toFixed(2)}`, 165, historyY);
        historyY += 7;
      });
    }

    // 11. Custom Notes Box - let's move it down or fit it perfectly
    let notesY = 205;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('ADDITIONAL TERM DETAILS & INSTRUCTIONS:', 15, notesY);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    
    // Auto-wrapping of the customized invoice message notes
    const wrappedNotes = doc.splitTextToSize(invoiceNotes, 180);
    doc.text(wrappedNotes, 15, notesY + 6);

    // 10. Beautiful footer signature block
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // grey border
    doc.line(15, 270, 195, 270);
    doc.text(`${company.name}  |  ${company.website}  |  Invoice ID: ${sale.id}`, 15, 275);
    doc.text('Certified Official Transaction Ledger Document', 140, 275);

    // Save output securely
    doc.save(`tax_invoice_${invoiceNumber}.pdf`);
  };

  return (
    <div id="invoice-modal-global-container" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm overflow-y-auto print:bg-white print:p-0">
      
      {/* 
        Tailwind Custom styles for professional A4 web layout rendering 
        And dynamic hide on printing to trigger optimal results
      */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-invoice-sheet, #printable-invoice-sheet * {
            visibility: visible !important;
          }
          #printable-invoice-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 1.5rem !important;
          }
          #invoice-modal-global-container {
            position: absolute !important;
            background: #fff !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>

      <motion.div
        initial={{ scale: 0.98, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.98, opacity: 0 }}
        id="invoice-modal-content-card"
        className="bg-slate-50 rounded-[2.5rem] border border-slate-200/80 shadow-2xl max-w-6xl w-full h-[90vh] flex flex-col overflow-hidden print:bg-white print:border-none print:shadow-none print:max-w-none print:h-auto"
      >
        
        {/* UPPER DIALOG CONTROLS HEADER BAR */}
        <div id="invoice-controls-header" className="flex items-center justify-between border-b border-slate-200/80 bg-white px-6 sm:px-8 py-4 shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center">
              <FileText className="h-5 w-5 text-indigo-650 text-indigo-650 text-indigo-600" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Tax Invoice Desk</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Generate, print, personalize, and download formal invoice blocks for tracking</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            
            {/* Direct configurations slider toggle */}
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition shrink-0 cursor-pointer ${
                showSettings 
                  ? 'bg-slate-100 border-slate-300 text-slate-800' 
                  : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800'
              }`}
            >
              <Settings className="h-4 w-4 shrink-0" />
              <span>{showSettings ? 'Hide Options' : 'Company/Tax Config'}</span>
            </button>

            {/* Direct actions */}
            <button
              onClick={handlePrint}
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-bold text-slate-700 px-3 py-2 transition cursor-pointer shrink-0"
              title="Print via Local Web System"
            >
              <Printer className="h-4 w-4 shrink-0 text-slate-500" />
              <span className="hidden sm:inline">Print Document</span>
            </button>

            <button
              onClick={handleDownloadPDF}
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white px-4 py-2 transition shadow-xs hover:shadow-md cursor-pointer shrink-0"
              title="Download vector pdf file"
            >
              <Download className="h-4 w-4 shrink-0" />
              <span>Download PDF</span>
            </button>

            <div className="w-[1px] h-6 bg-slate-200 mx-1"></div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-800 transition rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* WORKSPACE DIVIDORS: EDIT FIELDS LEFT PANEL & A4 PREVIEW WINDOW RIGHT PANEL */}
        <div id="invoice-workspace-inner" className="flex-1 overflow-hidden flex flex-col lg:flex-row print:block">
          
          {/* OPTIONS SIDE-PANEL (LEFT) */}
          {showSettings && (
            <div id="invoice-settings-sidebar" className="lg:w-80 bg-white border-b lg:border-b-0 lg:border-r border-slate-200/80 p-6 overflow-y-auto shrink-0 print:hidden space-y-6">
              
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  Issuer Business Profile
                </h4>
                <p className="text-[10px] text-slate-400 leading-normal">
                  Configure corporate parameters, VAT registration numbers, trade certificates, and logos. Saves directly to Cloud Firestore.
                </p>
              </div>

              {/* Company Inputs Form */}
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-bold">Business Name *</label>
                  <input
                    type="text"
                    required
                    value={company.name}
                    onChange={(e) => setCompany({ ...company, name: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 py-2 px-3 text-xs font-semibold focus:border-indigo-500 focus:outline-none"
                    placeholder="Legal Entity Name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-bold">Trade Name</label>
                    <input
                      type="text"
                      value={company.tradeName || ''}
                      onChange={(e) => setCompany({ ...company, tradeName: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 py-2 px-3 text-xs font-semibold focus:border-indigo-500 focus:outline-none"
                      placeholder="e.g. Apex Trade"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-bold">Owner Name</label>
                    <input
                      type="text"
                      value={company.ownerName || ''}
                      onChange={(e) => setCompany({ ...company, ownerName: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 py-2 px-3 text-xs font-semibold focus:border-indigo-500 focus:outline-none"
                      placeholder="e.g. John Doe"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-bold">VAT Number *</label>
                    <input
                      type="text"
                      required
                      value={company.taxRegistrationId}
                      onChange={(e) => setCompany({ ...company, taxRegistrationId: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 py-2 px-3 text-xs font-semibold focus:border-indigo-500 focus:outline-none"
                      placeholder="Tax Registration ID"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-bold">CR Number</label>
                    <input
                      type="text"
                      value={company.crNumber || ''}
                      onChange={(e) => setCompany({ ...company, crNumber: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 py-2 px-3 text-xs font-semibold focus:border-indigo-500 focus:outline-none"
                      placeholder="Commercial Registration"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-bold">Corporate Address *</label>
                  <textarea
                    rows={2}
                    required
                    value={company.address}
                    onChange={(e) => setCompany({ ...company, address: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 py-2 px-3 text-xs font-medium focus:border-indigo-500 focus:outline-none"
                    placeholder="Physical HQ Address"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block block font-bold">Logo URL (Optional)</label>
                  <input
                    type="text"
                    value={company.logo || ''}
                    onChange={(e) => setCompany({ ...company, logo: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 py-2 px-3 text-xs font-medium focus:border-indigo-500 focus:outline-none"
                    placeholder="https://example.com/logo.png"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-bold">Phone No *</label>
                    <input
                      type="text"
                      required
                      value={company.phone}
                      onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 py-2 px-2 text-xs font-medium focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-bold">Email Address</label>
                    <input
                      type="text"
                      value={company.email || ''}
                      onChange={(e) => setCompany({ ...company, email: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 py-2 px-2 text-xs font-medium focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-bold">Website URL</label>
                    <input
                      type="text"
                      value={company.website || ''}
                      onChange={(e) => setCompany({ ...company, website: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 py-2 px-2 text-xs font-medium focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  {/* Customizable VAT Tax rate percentage */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block block mb-0.5 font-bold">
                      Tax / VAT Rate (%)
                    </label>
                    <div className="relative">
                      <span className="absolute right-2.5 top-2.5 text-slate-400 text-xs font-bold">%</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={company.taxRatePercent}
                        onChange={(e) => setCompany({ ...company, taxRatePercent: parseFloat(e.target.value) || 0 })}
                        className="w-full rounded-lg border border-slate-200 py-2 pl-3 pr-7 text-xs font-bold focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Cloud Saving Action Trigger */}
                <div className="pt-2">
                  {saveStatus === 'success' && (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-250/50 p-2 text-[10px] font-bold text-emerald-700 animate-slide-up flex items-center gap-1.5 mb-2">
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-650" />
                      <span>Saved permanently to Firestore</span>
                    </div>
                  )}
                  {saveStatus === 'error' && (
                    <div className="rounded-lg bg-rose-50 border border-rose-150 p-2 text-[10px] font-bold text-rose-700 animate-slide-up mb-2">
                      Error saving profile to Cloud DB.
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleSaveCompanyProfile}
                    disabled={isSavingCompany}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white py-2.5 transition shadow-2xs hover:shadow-md cursor-pointer disabled:opacity-60"
                  >
                    {isSavingCompany ? 'Saving Cloud...' : 'Save Company Profile'}
                  </button>
                </div>

                <div className="w-full h-[1px] bg-slate-200 my-2"></div>

                {/* Adjust Invoice Custom Notes */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Custom Invoice Notes</label>
                  <textarea
                    rows={3}
                    value={invoiceNotes}
                    onChange={(e) => setInvoiceNotes(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 py-2 px-3 text-xs text-slate-500 focus:border-indigo-500 focus:outline-none leading-relaxed"
                    placeholder="Enter customized footer terms..."
                  />
                </div>

                {/* Adjust Invoice tracker code manually if required */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Manual Invoice ID Prefix</label>
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 py-2 px-3 text-xs font-bold focus:border-indigo-500 focus:outline-none"
                  />
                </div>

              </div>
            </div>
          )}

          {/* MAIN GRID VIEWPORT AND PRINT BLOCKS (RIGHT) */}
          <div id="invoice-preview-viewport" className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center bg-slate-100 print:bg-white print:p-0 print:overflow-visible">
            
            {/* INVOICE PAPER SHEET MODULE - LOOKS AND FEELS LIKE HIGH-FIDELITY LUXURY STATIONERY */}
            <div 
              id="printable-invoice-sheet" 
              className="w-full max-w-[210mm] min-h-[297mm] bg-white border border-slate-200 rounded-[2rem] p-8 sm:p-12 shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col justify-between print:border-none print:shadow-none print:rounded-none print:p-0 print:m-0"
            >
              
              {/* TOP HEADER SECTION WITH ACCENTS */}
              <div className="space-y-6">
                
                {/* Visual design element top block */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 border-b border-slate-100 sm:border-slate-200">
                  
                  {/* Company metadata profile block (left side) */}
                  <div className="space-y-2.5 max-w-lg text-xs">
                    {company.logo && (
                      <div className="mb-2 max-h-12 flex items-center">
                        <img src={company.logo} alt="Company Logo" referrerPolicy="no-referrer" className="max-h-12 max-w-[150px] object-contain" />
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
                      <h1 className="text-lg font-extrabold text-slate-900 uppercase tracking-tight">{company.name}</h1>
                    </div>

                    {company.tradeName && (
                      <p className="text-slate-700 font-semibold text-xs leading-none">
                        Trade: <span className="font-bold">{company.tradeName}</span>
                      </p>
                    )}

                    {company.crNumber && (
                      <p className="text-slate-505 text-slate-500 text-[11px] leading-none font-mono">
                        CR Number: <span className="font-bold">{company.crNumber}</span>
                      </p>
                    )}

                    <div className="space-y-1 text-slate-500 leading-relaxed pt-0.5">
                      <p className="font-medium text-slate-600 flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>{company.address}</span>
                      </p>
                      
                      <div className="flex items-center gap-4 flex-wrap text-slate-400 pt-0.5">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          <span className="text-slate-500">{company.phone}</span>
                        </span>
                        {company.email && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              <span className="text-slate-500">{company.email}</span>
                            </span>
                          </>
                        )}
                        {company.website && (
                          <>
                            <span>•</span>
                            <span className="text-slate-500 font-mono tracking-tight">{company.website}</span>
                          </>
                        )}
                      </div>
                      
                      <p className="text-[11px] font-bold text-indigo-600 pt-0.5 mt-0.5">
                        VAT Number: <span className="font-mono text-slate-700 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">{company.taxRegistrationId}</span>
                      </p>
                    </div>
                  </div>

                  {/* Document general code metadata indices (right side) */}
                  <div className="space-y-2 text-left sm:text-right shrink-0">
                    <div className="text-2xl font-black text-indigo-600 tracking-wider">TAX INVOICE</div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-1 gap-4 sm:gap-1.5 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block sm:mb-0.5">Invoice Tracking Number</span>
                        <span className="font-mono font-bold text-slate-900 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded text-[11px]">
                          {invoiceNumber}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block sm:mb-0.5 mt-2.5">Date of Settlement</span>
                        <span className="font-semibold text-slate-800">
                          {new Date(sale.saleDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block sm:mb-0.5 mt-2.5">Payment Terms Method</span>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                          sale.paymentType === 'Cash' 
                            ? 'bg-emerald-50 border-emerald-250/60 text-emerald-700 shadow-3xs' 
                            : 'bg-blue-50 border-blue-200 text-blue-700 shadow-3xs'
                        }`}>
                          {sale.paymentType === 'Credit' ? 'Credit Account (Net 30)' : 'Immediate Settled Trade'}
                        </span>
                      </div>
                    </div>
                  </div>

                </div>

                {/* BILLING & SELLER SPECIFICATIONS - SIDE-BY-SIDE SPLIT LAYOUT */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                  
                  {/* Left Column - Seller detail card */}
                  <div className="border border-slate-200/80 rounded-2xl bg-slate-50/50 p-5 space-y-2">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block pb-1 border-b border-slate-200/40 flex items-center gap-1">
                      <Building2 className="nav-icon h-3 w-3 text-indigo-600 shrink-0" />
                      <span>SELLER (ISSUER)</span>
                    </span>
                    
                    <div className="space-y-1.5 text-xs text-slate-500 leading-relaxed">
                      {company.logo && (
                        <div className="mb-2 max-h-10 flex items-center">
                          <img src={company.logo} alt="Company Logo" referrerPolicy="no-referrer" className="max-h-10 max-w-[120px] object-contain" />
                        </div>
                      )}
                      
                      <p className="text-sm font-bold text-slate-900 capitalize leading-none">{company.name}</p>
                      
                      {company.tradeName && (
                        <p className="text-slate-600">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Trade Name:</span>
                          <span className="font-semibold text-slate-700">{company.tradeName}</span>
                        </p>
                      )}

                      {company.crNumber && (
                        <p className="text-slate-605 text-slate-600 font-mono">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">CR Number:</span>
                          <span className="font-semibold text-slate-700">{company.crNumber}</span>
                        </p>
                      )}

                      <p className="text-slate-600">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">VAT Number:</span>
                        <span className="font-mono font-bold text-slate-800">{company.taxRegistrationId}</span>
                      </p>

                      <p className="text-xs text-slate-500 leading-relaxed flex items-start gap-1.5 pt-0.5">
                        <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span>{company.address}</span>
                      </p>

                      <p className="text-slate-600">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Contact:</span>
                        <span className="font-medium text-slate-707 text-slate-700">{company.phone}</span>
                      </p>

                      {company.email && (
                        <p className="text-slate-600">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Email:</span>
                          <span className="font-medium text-indigo-600 hover:text-indigo-700 shrink-0">{company.email}</span>
                        </p>
                      )}

                      {company.website && (
                        <p className="text-slate-600">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Website:</span>
                          <span className="font-medium text-slate-700">{company.website}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right segment - Customer detail card */}
                  <div className="border border-slate-200/80 rounded-2xl bg-indigo-50/10 p-5 space-y-2">
                    <span className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-widest block pb-1 border-b border-indigo-100/30 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0"></span>
                      <span>CUSTOMER (BILL TO)</span>
                    </span>
                    
                    <div className="space-y-1.5 text-xs">
                      <p className="text-sm font-bold text-slate-900 capitalize">{sale.customerName}</p>
                      
                      {matchedCustomer?.vatNumber && (
                        <p className="text-slate-600">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">VAT Number:</span>
                          <span className="font-mono font-bold text-slate-800">{matchedCustomer.vatNumber}</span>
                        </p>
                      )}

                      <p className="text-xs text-slate-500 leading-relaxed flex items-start gap-1.5 pt-0.5">
                        <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span>{customerAddress}</span>
                      </p>

                      <p className="text-slate-600">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Contact:</span>
                        <span className="font-medium text-slate-700">{customerPhone}</span>
                      </p>

                      {matchedCustomer?.email && (
                        <p className="text-slate-600">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Email:</span>
                          <span className="font-medium text-slate-700">{matchedCustomer.email}</span>
                        </p>
                      )}

                      <p className="text-slate-600">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Customer ID:</span>
                        <span className="font-mono text-indigo-800 font-semibold">{sale.customerId}</span>
                      </p>
                    </div>
                  </div>

                </div>

                {/* LINE ITEMS DATA GRID LISTING */}
                <div className="pt-6">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900 text-white rounded-lg">
                          <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider rounded-l-xl">Line Item & Description</th>
                          <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider hidden sm:table-cell">Product SKU</th>
                          <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-center">Qty</th>
                          <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-right">Unit Price</th>
                          <th className="py-3 px-4 text-xs font-bold uppercase tracking-wider text-right rounded-r-xl">Total Amount ($)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        <tr className="hover:bg-slate-50/50 transition">
                          <td className="py-4 px-4 text-sm">
                            <span className="font-bold text-slate-900 block">{sale.productName}</span>
                            <span className="text-[10px] font-medium text-slate-405 text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 mt-1 inline-block">
                              Category: {matchedProduct?.category || "Standard merchandise"}
                            </span>
                          </td>
                          <td className="py-4 px-4 text-xs font-mono text-slate-500 hidden sm:table-cell">
                            {matchedProduct?.sku || `SKU-${sale.productId.substring(0,8).toUpperCase()}`}
                          </td>
                          <td className="py-4 px-4 text-xs font-bold text-center text-slate-800">
                            x{sale.quantity}
                          </td>
                          <td className="py-4 px-4 text-xs font-medium text-right text-slate-650 text-slate-700">
                            ${sale.sellingPrice.toFixed(2)}
                          </td>
                          <td className="py-4 px-4 text-sm font-bold text-right text-slate-900">
                            ${subtotal.toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* PRICING BALANCES BREAKDOWN BLOCKS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-150 border-slate-200">
                  
                  {/* Note info column */}
                  <div className="text-xs text-slate-400 space-y-1 md:pr-10 leading-relaxed">
                    <p className="font-bold text-slate-600 uppercase tracking-widest text-[9px]">Additional Notes & Conditions</p>
                    <p className="text-slate-500 italic mt-1 font-medium">{invoiceNotes}</p>
                  </div>

                  {/* Absolute math column summary */}
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-3.5 h-fit">
                    
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                      <span>Subtotal Trade Net:</span>
                      <span className="font-mono font-bold text-slate-800">${subtotal.toFixed(2)}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                      <span>Sales Tax / VAT ({taxRatePercent}%):</span>
                      <span className="font-mono font-bold text-slate-800">${taxAmount.toFixed(2)}</span>
                    </div>

                    <div className="w-full h-[1px] bg-slate-200 my-2"></div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700">GRAND TOTAL INVOICED:</span>
                      <span className="font-sans text-lg font-black text-indigo-600">
                        ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                  </div>

                </div>

                {/* PAYMENT SUMMARY & HISTORY SECTION */}
                <div className="mt-8 pt-6 border-t border-slate-200">
                  <div className="flex items-center gap-2 mb-4">
                    <DollarSign className="h-4 w-4 text-indigo-600" />
                    <h4 className="text-xs font-bold uppercase tracking-widest text-slate-800">
                      Payment Summary & Audit Track
                    </h4>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-2">
                    
                    {/* Payment Summary Metrics Card */}
                    <div className="bg-slate-50 rounded-2xl border border-slate-251 border-slate-200 p-5 space-y-3.5">
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block pb-1 border-b border-slate-200/40">
                        Payment Status Breakdown
                      </span>
                      
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                        <span>Invoice Total Amount:</span>
                        <span className="font-mono font-bold text-slate-900">
                          ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                        <span>Total Paid to Date:</span>
                        <span className="font-mono font-black text-emerald-600">
                          ${paymentInfo.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                        <span>Remaining Outstanding Balance:</span>
                        <span className={`font-mono font-black ${paymentInfo.remainingBalance > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                          ${paymentInfo.remainingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="w-full h-[1px] bg-slate-200 my-2"></div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Settlement Status:</span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold border uppercase tracking-wider ${
                          paymentInfo.status === 'Fully Paid'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-3xs'
                            : 'bg-orange-50 text-orange-700 border-orange-200 shadow-3xs'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            paymentInfo.status === 'Fully Paid' ? 'bg-emerald-500' : 'bg-orange-500'
                          }`}></span>
                          {paymentInfo.status === 'Fully Paid' ? 'Paid' : paymentInfo.status === 'Partially Paid' ? 'Pending' : 'Pending'}
                        </span>
                      </div>
                    </div>

                    {/* Payment History Audit Section */}
                    <div className="border border-slate-200 rounded-2xl bg-white p-5 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block pb-1 border-b border-slate-200/40 mb-3">
                          Payment History Details
                        </span>
                        
                        {paymentInfo.paymentHistory.length === 0 ? (
                          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-center text-xs text-slate-400 font-medium italic">
                            No payment history has been posted to this invoice yet.
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-40 overflow-y-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                  <th className="pb-1.5 font-bold">Payment Date</th>
                                  <th className="pb-1.5 text-right font-bold">Amount Paid</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {paymentInfo.paymentHistory.map((ph, idx) => (
                                  <tr key={idx} className="text-xs text-slate-600 hover:bg-slate-50/50">
                                    <td className="py-2 text-slate-500 font-medium">
                                      {new Date(ph.paymentDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                    </td>
                                    <td className="py-2 text-right font-mono font-bold text-emerald-600">
                                      ${ph.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                      
                      <div className="mt-4 text-[10px] text-slate-400 flex items-center gap-1.5 pt-3 border-t border-slate-50">
                        <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <span>Receipt history is dynamically synchronized matching current customer payments list.</span>
                      </div>
                    </div>

                  </div>
                </div>

              </div>

              {/* OUTWARD FOOTER BAR AT ROOT */}
              <div className="pt-12 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] text-slate-400 tracking-wide font-medium">
                <div>
                  <p className="font-bold uppercase text-[9px] text-slate-550 text-slate-500">{company.name}</p>
                  <p className="mt-0.5">{company.website}  |  Contact: {company.phone}</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="font-bold uppercase text-[9px] text-indigo-500">System Certified Invoice</p>
                  <p className="mt-0.5 font-mono text-slate-400 tracking-normal">Sale Reference: {sale.id}</p>
                </div>
              </div>

            </div>

          </div>

        </div>

      </motion.div>
    </div>
  );
}
