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
import QRCode from 'qrcode';
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

// --- ZATCA Phase 1 TLV QR Code Generator ---
function getZatcaTimestamp(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      return new Date().toISOString().split('.')[0] + 'Z';
    }
    return d.toISOString().split('.')[0] + 'Z';
  } catch (e) {
    return new Date().toISOString().split('.')[0] + 'Z';
  }
}

function generateZatcaTlvBase64(
  sellerName: string,
  sellerVat: string,
  timestamp: string,
  totalAmount: string,
  vatAmount: string
): string {
  const getTlvBuffer = (tag: number, value: string): Uint8Array => {
    const encoder = new TextEncoder();
    const valueBytes = encoder.encode(value);
    const buffer = new Uint8Array(2 + valueBytes.length);
    buffer[0] = tag;
    buffer[1] = valueBytes.length;
    buffer.set(valueBytes, 2);
    return buffer;
  };

  const tag1 = getTlvBuffer(1, sellerName);
  const tag2 = getTlvBuffer(2, sellerVat);
  const tag3 = getTlvBuffer(3, timestamp);
  const tag4 = getTlvBuffer(4, totalAmount);
  const tag5 = getTlvBuffer(5, vatAmount);

  const totalLength = tag1.length + tag2.length + tag3.length + tag4.length + tag5.length;
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  
  combined.set(tag1, offset); offset += tag1.length;
  combined.set(tag2, offset); offset += tag2.length;
  combined.set(tag3, offset); offset += tag3.length;
  combined.set(tag4, offset); offset += tag4.length;
  combined.set(tag5, offset); offset += tag5.length;

  let binary = "";
  for (let i = 0; i < combined.byteLength; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

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
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');

  const [showSettings, setShowSettings] = useState(false);

  const handleOpenCompanySettings = () => {
    window.dispatchEvent(new CustomEvent('nexus-change-tab', { detail: 'company_settings' }));
    onClose();
  };

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

  // --- Toggle to simulate multi-page ERP invoice structure inside the preview ---
  const [simulateMultiPage, setSimulateMultiPage] = useState<boolean>(false);

  // --- Derive Invoice Items ---
  const invoiceItems = React.useMemo(() => {
    const baseItem = {
      sl: 1,
      id: sale.id,
      productName: sale.productName,
      sku: matchedProduct?.sku || `SKU-${sale.productId.substring(0,6).toUpperCase()}`,
      quantity: sale.quantity,
      unit: 'Pcs',
      unitPrice: sale.sellingPrice,
      taxRatePercent: taxRatePercent,
      vatAmount: taxAmount,
      totalAmount: grandTotal,
    };

    const items = [baseItem];

    if (simulateMultiPage) {
      const mockNames = [
        "Heavy Duty Galvanized Steel Truss, 4m",
        "Industrial Conduit Cable, 100m Roll",
        "High-Tensile Structural Fastener Kit",
        "Multi-Stage Silent Hydraulic Liquid Pump",
        "Solid Brass Coupling Gasket Class A",
        "Double-Insulated Copper Grounding Wire",
        "Premium Epoxy Core Resin Sealer",
        "Pneumatic Air Pressure Regulator Valve",
        "Anodized Aluminum Framing Anchor",
        "Stainless Steel Grade-316 Washers x500",
        "Premium Polyurethane Expansion Joint",
        "Carbon Steel Corrugated Floor Decking",
        "Heavy-Duty Waterproof Wire Junction Box",
        "Tungsten Carbide Tipped Cutting Wheel",
        "Fiberglass Reinforced Piping Joint Sleeve"
      ];

      mockNames.forEach((name, i) => {
        const qty = 2 + (i % 4);
        const unitPrice = 45.00 + (i * 15.50);
        const itemSubtotal = qty * unitPrice;
        const itemVatPercent = taxRatePercent;
        const itemVatAmount = (itemSubtotal * itemVatPercent) / 100;
        const itemTotal = itemSubtotal + itemVatAmount;

        items.push({
          sl: i + 2,
          id: `mock-item-${i}`,
          productName: name,
          sku: `SKU-MOCK-${1000 + i}`,
          quantity: qty,
          unit: 'Pcs',
          unitPrice: unitPrice,
          taxRatePercent: itemVatPercent,
          vatAmount: itemVatAmount,
          totalAmount: itemTotal,
        });
      });
    }

    return items;
  }, [sale, matchedProduct, taxRatePercent, taxAmount, grandTotal, simulateMultiPage]);

  // --- Helper to convert numbers to words ---
  const numberToWords = (num: number): string => {
    if (num === 0) return 'Zero Dollars Only';
    
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    const convertLessThanOneThousand = (n: number): string => {
      if (n === 0) return '';
      if (n < 20) return ones[n] + ' ';
      if (n < 100) return tens[Math.floor(n / 10)] + ' ' + ones[n % 10] + ' ';
      return ones[Math.floor(n / 100)] + ' Hundred ' + convertLessThanOneThousand(n % 100);
    };
    
    const convert = (n: number): string => {
      if (n < 1000) return convertLessThanOneThousand(n);
      if (n < 1000000) return convert(Math.floor(n / 1000)) + 'Thousand ' + convertLessThanOneThousand(n % 1000);
      return convert(Math.floor(n / 1000000)) + 'Million ' + convert(n % 1000000);
    };
    
    const cleanNum = Math.floor(num);
    const cents = Math.round((num - cleanNum) * 100);
    
    let result = convert(cleanNum).trim();
    if (result) result += ' Dollars';
    
    if (cents > 0) {
      if (result) result += ' and ';
      result += `${cents}/100 Cents`;
    } else {
      result += ' Only';
    }
    
    return result;
  };

  // --- Divide elements into clean pages ---
  // Page 1 contains full business profile + customer + notes. Let's make Page 1 fit up to 5 items cleanly.
  // Subsequent pages fit up to 9 items cleanly.
  const pageItemsList = React.useMemo(() => {
    const total = invoiceItems.length;
    // Single page case (fits table + summaries + header + footer)
    if (total <= 8) {
      return [invoiceItems];
    }
    
    const pages: typeof invoiceItems[] = [];
    
    // Page 1 is non-final. Header is compact, notes are compact. Can fit up to 14 items.
    // Leave at least 1 item for final page.
    const page1Size = Math.min(14, total - 1);
    pages.push(invoiceItems.slice(0, page1Size));
    
    let currentIndex = page1Size;
    while (currentIndex < total) {
      const remaining = total - currentIndex;
      // Can the rest fit on a final page (max 14 items with summaries)?
      if (remaining <= 14) {
        pages.push(invoiceItems.slice(currentIndex, total));
        break;
      } else {
        // This continuation page is non-final, can fit up to 18 items.
        // Leave at least 1 item for final page.
        const pageSize = Math.min(18, remaining - 1);
        pages.push(invoiceItems.slice(currentIndex, currentIndex + pageSize));
        currentIndex += pageSize;
      }
    }
    
    return pages;
  }, [invoiceItems]);

  // --- Calculate page subtotals and overall totals ---
  const calculatedPageTotals = React.useMemo(() => {
    return pageItemsList.map((pItems) => {
      const subtotalExVat = pItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
      const vatAmount = pItems.reduce((sum, item) => sum + item.vatAmount, 0);
      const totalWithVat = pItems.reduce((sum, item) => sum + item.totalAmount, 0);
      return {
        subtotalExVat,
        vatAmount,
        totalWithVat
      };
    });
  }, [pageItemsList]);

  const overallTotals = React.useMemo(() => {
    const totalAmountExVat = invoiceItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const totalVat = invoiceItems.reduce((sum, item) => sum + item.vatAmount, 0);
    const grandTotalAll = invoiceItems.reduce((sum, item) => sum + item.totalAmount, 0);
    return {
      totalAmountExVat,
      totalVat,
      grandTotalAll
    };
  }, [invoiceItems]);

  useEffect(() => {
    const generateQr = async () => {
      try {
        const timestamp = getZatcaTimestamp(sale.saleDate);
        const totalStr = overallTotals.grandTotalAll.toFixed(2);
        const vatStr = overallTotals.totalVat.toFixed(2);
        
        const tlvPayload = generateZatcaTlvBase64(
          company.name,
          company.taxRegistrationId,
          timestamp,
          totalStr,
          vatStr
        );
        
        const dataUrl = await QRCode.toDataURL(tlvPayload, {
          margin: 1,
          width: 200,
          color: {
            dark: '#0f172a',
            light: '#ffffff'
          }
        });
        
        setQrCodeDataUrl(dataUrl);
      } catch (err) {
        console.error("Failed to generate offline ZATCA QR Code:", err);
      }
    };
    generateQr();
  }, [
    company.name,
    company.taxRegistrationId,
    sale.saleDate,
    overallTotals.grandTotalAll,
    overallTotals.totalVat,
    invoiceNumber
  ]);

  // --- Action 2: Multi-Page Vector PDF Builder ---
  const handleDownloadPDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageCount = pageItemsList.length;

    pageItemsList.forEach((pItems, pageIdx) => {
      if (pageIdx > 0) {
        doc.addPage();
      }

      let tableY = 20;

      // --- RENDER HEADER ---
      if (pageIdx === 0) {
        // --- PAGE 1: COMPACT UNIQUE HEADER (X, Y) ---
        // Top colored ribbon
        doc.setFillColor(30, 41, 59); // slate-800
        doc.rect(0, 0, 210, 5, 'F');
        
        // LEFT: Business Information (compact layout) - 40% Width (72mm max width, starts at 15, ends on or before 87)
        let leftY = 12;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42); // slate-900
        const bizNameLines = doc.splitTextToSize(company.name.toUpperCase(), 72);
        bizNameLines.forEach((line: string) => {
          doc.text(line, 15, leftY);
          leftY += 4.5;
        });
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        
        if (company.tradeName) {
          const tradeLines = doc.splitTextToSize(`Trade Name: ${company.tradeName}`, 72);
          tradeLines.forEach((line: string) => {
            doc.text(line, 15, leftY);
            leftY += 3.5;
          });
        }
        
        // Emphasized VAT
        doc.setFont('helvetica', 'bold');
        const vatLineInput = `VAT Number: ${company.taxRegistrationId}`;
        const vatLines = doc.splitTextToSize(vatLineInput, 72);
        vatLines.forEach((line: string) => {
          doc.text(line, 15, leftY);
          leftY += 3.5;
        });
        doc.setFont('helvetica', 'normal');

        if (company.crNumber) {
          const crLines = doc.splitTextToSize(`CR Number: ${company.crNumber}`, 72);
          crLines.forEach((line: string) => {
            doc.text(line, 15, leftY);
            leftY += 3.5;
          });
        }
        
        const addressLines = doc.splitTextToSize(company.address, 72);
        addressLines.forEach((line: string) => {
          doc.text(line, 15, leftY);
          leftY += 3.5;
        });
        
        const phoneLine = `Phone: ${company.phone}`;
        const phoneLines = doc.splitTextToSize(phoneLine, 72);
        phoneLines.forEach((line: string) => {
          doc.text(line, 15, leftY);
          leftY += 3.5;
        });

        const emailLine = `Email: ${company.email}`;
        const emailLines = doc.splitTextToSize(emailLine, 72);
        emailLines.forEach((line: string) => {
          doc.text(line, 15, leftY);
          leftY += 3.5;
        });

        if (company.website) {
          const webLine = `Website: ${company.website}`;
          const webLines = doc.splitTextToSize(webLine, 72);
          webLines.forEach((line: string) => {
            doc.text(line, 15, leftY);
            leftY += 3.5;
          });
        }

        // CENTER: QR Code (Framed) - 20% Width (36mm, starts at 87, ends at 123)
        // Highly visible, center aligned at X = 105
        doc.setFillColor(248, 250, 252);
        doc.rect(96, 9, 18, 18, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.rect(96, 9, 18, 18, 'S');

        if (qrCodeDataUrl) {
          try {
            doc.addImage(qrCodeDataUrl, 'PNG', 97, 10, 16, 16);
          } catch (e) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(5);
            doc.setTextColor(148, 163, 184);
            doc.text("[QR CODE]", 100, 18);
          }
        } else {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(5);
          doc.setTextColor(148, 163, 184);
          doc.text("[QR CODE]", 100, 18);
        }

        // RIGHT: Customer Information (compact layout) - 40% Width (72mm max width, starts at 123, ends at 195)
        let rightY = 12;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text("BILL TO (CUSTOMER):", 123, rightY);
        rightY += 4.5;
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(79, 70, 229); // indigo-650
        const custNameLines = doc.splitTextToSize(sale.customerName.toUpperCase(), 72);
        custNameLines.forEach((line: string) => {
          doc.text(line, 123, rightY);
          rightY += 4.5;
        });
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        
        const custAddrLines = doc.splitTextToSize(customerAddress, 72);
        custAddrLines.forEach((line: string) => {
          doc.text(line, 123, rightY);
          rightY += 3.5;
        });

        const custPhoneLine = `Phone: ${customerPhone}`;
        const custPhoneLines = doc.splitTextToSize(custPhoneLine, 72);
        custPhoneLines.forEach((line: string) => {
          doc.text(line, 123, rightY);
          rightY += 3.5;
        });

        if (matchedCustomer?.email) {
          const custEmailLine = `Email: ${matchedCustomer.email}`;
          const custEmailLines = doc.splitTextToSize(custEmailLine, 72);
          custEmailLines.forEach((line: string) => {
            doc.text(line, 123, rightY);
            rightY += 3.5;
          });
        }

        if (matchedCustomer?.vatNumber) {
          doc.setFont('helvetica', 'bold');
          const custVatLine = `VAT Number: ${matchedCustomer.vatNumber}`;
          const custVatLines = doc.splitTextToSize(custVatLine, 72);
          custVatLines.forEach((line: string) => {
            doc.text(line, 123, rightY);
            rightY += 3.5;
          });
          doc.setFont('helvetica', 'normal');
        }

        // --- SECOND SECTION ---
        let secY = Math.max(leftY, rightY) + 3;
        if (secY < 32) secY = 32;
        doc.setDrawColor(241, 245, 249);
        doc.setFillColor(248, 250, 252);
        
        // Left Notes box
        doc.rect(15, secY, 85, 17, 'F');
        doc.rect(15, secY, 85, 17, 'S');
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text("ADDITIONAL NOTES & CONDITIONS", 18, secY + 3.5);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        const wrappedNotes = doc.splitTextToSize(invoiceNotes, 79);
        doc.text(wrappedNotes, 18, secY + 8);

        // Right Invoice Details box
        doc.setFillColor(253, 253, 254);
        doc.rect(105, secY, 90, 17, 'F');
        doc.rect(105, secY, 90, 17, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(15, 23, 42);
        doc.text("TAX INVOICE DETAILS", 108, secY + 3.5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(115, 115, 115);
        
        // Column 1
        doc.text(`Invoice No: ${invoiceNumber}`, 108, secY + 8);
        doc.text(`Invoice Date: ${new Date(sale.saleDate).toLocaleDateString()}`, 108, secY + 12);
        
        // Column 2
        doc.text(`Settlement: ${new Date(sale.saleDate).toLocaleDateString()}`, 154, secY + 8);
        doc.text(`Terms/Method: ${sale.paymentType === 'Credit' ? 'Credit' : 'Cash'}`, 154, secY + 12);

        tableY = secY + 17 + 5;

      } else {
        // --- PAGE 2+: COMPACT CONTINUATION HEADER ---
        doc.setFillColor(30, 41, 59); // slate-800
        doc.rect(0, 0, 210, 4, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        const compLines = doc.splitTextToSize(company.name.toUpperCase(), 72);
        let leftCY = 9;
        compLines.forEach((line: string) => {
          doc.text(line, 15, leftCY);
          leftCY += 3.5;
        });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(`Invoice No: ${invoiceNumber}`, 15, leftCY);

        // Center QR Code in PDF continuation - 20% width (36mm, X:87 to 123)
        if (qrCodeDataUrl) {
          try {
            doc.addImage(qrCodeDataUrl, 'PNG', 99, 5, 12, 12);
          } catch (e) {
            // fallback
          }
        }

        // Right Customer Name - 40% width (72mm, X:123 to 195)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(79, 70, 229);
        const custContLines = doc.splitTextToSize(sale.customerName.toUpperCase(), 72);
        let rightCY = 9;
        custContLines.forEach((line: string) => {
          doc.text(line, 195, rightCY, { align: 'right' });
          rightCY += 3.5;
        });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(`Page ${pageIdx + 1} of ${pageCount}`, 195, rightCY, { align: 'right' });

        doc.setDrawColor(226, 232, 240);
        doc.line(15, 17, 195, 17);
        
        tableY = 20;
      }

      // --- PRODUCT TABLE LAYOUT ---
      
      // Draw Table Header
      doc.setFillColor(15, 23, 42); // deep slate
      doc.rect(15, tableY, 180, 7, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text("SL", 18, tableY + 4.5);
      doc.text("PRODUCT DESCRIPTION", 25, tableY + 4.5);
      doc.text("QTY", 110, tableY + 4.5, { align: 'right' });
      doc.text("UNIT", 122, tableY + 4.5, { align: 'right' });
      doc.text("UNIT PRICE", 142, tableY + 4.5, { align: 'right' });
      doc.text("VAT %", 156, tableY + 4.5, { align: 'right' });
      doc.text("VAT", 173, tableY + 4.5, { align: 'right' });
      doc.text("TOTAL ($)", 191, tableY + 4.5, { align: 'right' });

      // Draw rows
      let rowY = tableY + 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(15, 23, 42);

      pItems.forEach((item) => {
        doc.setDrawColor(241, 245, 249);
        doc.line(15, rowY + 6, 195, rowY + 6);

        doc.setFont('helvetica', 'bold');
        doc.text(item.sl.toString(), 18, rowY + 4);
        doc.setFont('helvetica', 'normal');

        const desc = item.productName;
        const shortDesc = desc.length > 52 ? desc.substring(0, 50) + "..." : desc;
        doc.text(shortDesc, 25, rowY + 4);

        doc.text(item.quantity.toString(), 110, rowY + 4, { align: 'right' });
        doc.text(item.unit, 122, rowY + 4, { align: 'right' });
        doc.text(`$${item.unitPrice.toFixed(2)}`, 142, rowY + 4, { align: 'right' });
        doc.text(`${item.taxRatePercent}%`, 156, rowY + 4, { align: 'right' });
        doc.text(`$${item.vatAmount.toFixed(2)}`, 173, rowY + 4, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        doc.text(`$${item.totalAmount.toFixed(2)}`, 191, rowY + 4, { align: 'right' });
        doc.setFont('helvetica', 'normal');

        rowY += 6;
      });

      // Draw Cumulative Subtotal row inside table bottom
      doc.setFillColor(248, 250, 252);
      doc.rect(15, rowY, 180, 6, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.rect(15, rowY, 180, 6, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      doc.text(`SUBTOTAL (PAGE ${pageIdx + 1})`, 25, rowY + 4);
      doc.setTextColor(15, 23, 42);
      
      const pageSub = calculatedPageTotals[pageIdx];
      doc.text(`$${pageSub.subtotalExVat.toFixed(2)}`, 142, rowY + 4, { align: 'right' });
      doc.text(`$${pageSub.vatAmount.toFixed(2)}`, 173, rowY + 4, { align: 'right' });
      doc.text(`$${pageSub.totalWithVat.toFixed(2)}`, 191, rowY + 4, { align: 'right' });

      // --- PERSISTENT FOOTER ON EVERY PAGE ---
      doc.setDrawColor(226, 232, 240);
      doc.line(15, 280, 195, 280);
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(79, 70, 229); 
      doc.text("SYSTEM CERTIFIED INVOICE", 15, 284);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.text("This is a system generated invoice and does not require signature.", 15, 287);
      doc.text(`Document Reference: ${sale.id}  |  Page ${pageIdx + 1} of ${pageCount}`, 195, 285, { align: 'right' });

      // --- FINAL PAGE TOTALS ---
      if (pageIdx === pageCount - 1) {
        let finalY = rowY + 8;

        // Payment Summary / Audit Trail (LEFT)
        doc.setFillColor(248, 250, 252); // slate-50
        doc.rect(15, finalY, 85, 18, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.rect(15, finalY, 85, 18, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);
        doc.text("PAYMENT SUMMARY", 18, finalY + 4.5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text("Paid Amount:", 18, finalY + 9);
        doc.setTextColor(16, 185, 129); // emerald-550
        doc.setFont('helvetica', 'bold');
        doc.text(`$${paymentInfo.amountPaid.toFixed(2)}`, 65, finalY + 9);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text("Outstanding Balance:", 18, finalY + 13.5);
        doc.setTextColor(paymentInfo.remainingBalance > 0 ? 220 : 100, paymentInfo.remainingBalance > 0 ? 38 : 116, paymentInfo.remainingBalance > 0 ? 38 : 139);
        doc.setFont('helvetica', 'bold');
        doc.text(`$${paymentInfo.remainingBalance.toFixed(2)}`, 65, finalY + 13.5);

        // Total Summary (RIGHT)
        doc.setFillColor(254, 254, 255);
        const rectHeight = 30 + (pageCount * 3.5);
        doc.rect(105, finalY, 90, rectHeight, 'F');
        doc.rect(105, finalY, 90, rectHeight, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);
        doc.text("TOTAL SUMMARY", 108, finalY + 4.5);

        let sumY = finalY + 9;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(115, 115, 115);
        
        calculatedPageTotals.forEach((pageTotal, sIdx) => {
          doc.text(`Subtotal Page ${sIdx + 1}:`, 108, sumY);
          doc.text(`$${pageTotal.totalWithVat.toFixed(2)}`, 191, sumY, { align: 'right' });
          sumY += 3.5;
        });

        doc.setDrawColor(241, 145, 149); // light divider accent
        doc.setDrawColor(241, 245, 249);
        doc.line(105, sumY - 1, 195, sumY - 1);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(115, 115, 115);
        doc.text("Subtotal (Ex VAT):", 108, sumY + 3);
        doc.text(`$${overallTotals.totalAmountExVat.toFixed(2)}`, 191, sumY + 3, { align: 'right' });

        doc.text("Total VAT Amount:", 108, sumY + 7);
        doc.text(`$${overallTotals.totalVat.toFixed(2)}`, 191, sumY + 7, { align: 'right' });

        doc.setDrawColor(226, 232, 240);
        doc.line(105, sumY + 9.5, 195, sumY + 9.5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text("GRAND TOTAL", 108, sumY + 13.5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(79, 70, 229);
        doc.text(`$${overallTotals.grandTotalAll.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 108, sumY + 18);

        // Amount in Words below blocks
        let wordY = finalY + Math.max(18, rectHeight) + 4;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text("AMOUNT IN WORDS:", 15, wordY);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);
        
        const words = numberToWords(overallTotals.grandTotalAll);
        const wrappedWords = doc.splitTextToSize(words, 180);
        doc.text(wrappedWords, 15, wordY + 4);
      }
    });

    doc.save(`tax_invoice_${invoiceNumber}.pdf`);
  };

  return (
    <div id="invoice-modal-global-container" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm overflow-y-auto print:bg-white print:p-0">
      
      {/* Tailwind & CSS printing rules for clean ERP outputs */}
      <style>{`
        #printable-invoice-sheet {
          background-color: transparent !important;
        }

        .invoice-page-sheet {
          width: 210mm;
          min-height: 297mm;
          padding: 15mm;
          margin: 0 auto 10mm auto;
          background: #ffffff;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05);
          border: 1px solid #e2e8f0;
          border-radius: 1.5rem;
          position: relative;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        @media print {
          body * {
            visibility: hidden !important;
          }
          #invoice-preview-viewport, #invoice-preview-viewport * {
            visibility: visible !important;
          }
          #invoice-preview-viewport {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            overflow: visible !important;
          }
          .invoice-page-sheet {
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            padding: 10mm 15mm 15mm 15mm !important;
            page-break-after: always !important;
            break-after: page !important;
            width: 100% !important;
            min-height: 100vh !important;
          }
          .invoice-page-sheet:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
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
        
        {/* UPPER CONTROLS BAR */}
        <div id="invoice-controls-header" className="flex items-center justify-between border-b border-slate-200/80 bg-white px-6 sm:px-8 py-4 shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center">
              <FileText className="h-5 w-5 text-indigo-600" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Tax Invoice Desk</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Redesigned professional multi-page ERP tax billing & compliance workspace</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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

        {/* WORKSPACE AREA */}
        <div id="invoice-workspace-inner" className="flex-1 overflow-hidden flex flex-col lg:flex-row print:block">
          
          {/* OPTIONS PANEL (LEFT) */}
          {showSettings && (
            <div id="invoice-settings-sidebar" className="lg:w-80 bg-white border-b lg:border-b-0 lg:border-r border-slate-200/80 p-6 overflow-y-auto shrink-0 print:hidden space-y-5">
              
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  Issuer Business Profile
                </h4>
                <p className="text-[10px] text-slate-400 leading-normal">
                  Configure corporate parameters, VAT registration numbers, trade certificates, and logos. Managed under Settings.
                </p>
              </div>

              {/* Company settings routing option */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 shrink-0 space-y-3.5">
                <div className="flex items-start gap-2.5">
                  <span className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                    <Building2 className="h-4 w-4 text-indigo-600" />
                  </span>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900 leading-normal">System Profile</h5>
                    <p className="text-[11px] text-slate-500 mt-1 leading-normal">
                      Profile details are persistent and managed directly.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleOpenCompanySettings}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white py-2.5 transition shadow-2xs hover:shadow-md cursor-pointer"
                >
                  <Settings className="h-3.5 w-3.5" />
                  <span>Open Company Settings</span>
                </button>
              </div>

              {/* Simulation Box for Multi-Page verification */}
              <div className="space-y-2 bg-indigo-50/20 rounded-2xl p-4 border border-indigo-100/50">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold text-indigo-700 uppercase tracking-wider block">Test Multi-Page Layout</span>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={simulateMultiPage} 
                      onChange={(e) => setSimulateMultiPage(e.target.checked)}
                      className="sr-only peer" 
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal">
                  Saves time verifying page-breaking and totals overflow behavior. Appends 15 high-fidelity mock items to this invoice.
                </p>
              </div>

              <div className="w-full h-[1px] bg-slate-200 my-1"></div>

              {/* Additional Invoice Notes customization */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Invoice Notes & Conditions</label>
                <textarea
                  rows={3}
                  value={invoiceNotes}
                  onChange={(e) => setInvoiceNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 py-2 px-3 text-xs text-slate-500 focus:border-indigo-500 focus:outline-none leading-relaxed"
                  placeholder="Enter custom Terms/Warranty details..."
                />
              </div>

              {/* Manual Prefix ID customization */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Invoice Code Prefix</label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 py-2 px-3 text-xs font-bold focus:border-indigo-500 focus:outline-none"
                />
              </div>

            </div>
          )}

          {/* MAIN PREVIEW LISTING (RIGHT) */}
          <div id="invoice-preview-viewport" className="flex-1 overflow-y-auto p-4 sm:p-8 flex flex-col items-center bg-slate-100 print:bg-white print:p-0 print:overflow-visible animate-fade-in-up">
            
            <div id="printable-invoice-sheet" className="w-full max-w-[210mm] print:w-full">
              {pageItemsList.map((pItems, pageIdx) => {
                const isFirstPage = pageIdx === 0;
                const isLastPage = pageIdx === pageItemsList.length - 1;
                const pageCount = pageItemsList.length;
                const pageSubtotalBlock = calculatedPageTotals[pageIdx];

                return (
                  <div key={pageIdx} className="invoice-page-sheet">
                    {/* TOP HEADER SECTION */}
                    <div className="flex flex-col">
                      {isFirstPage ? (
                        /* PAGE 1: 3-COLUMN COMPACT HEADER */
                        <div className="flex flex-row items-center justify-between border-b border-slate-100 pb-2 mb-2 w-full">
                          {/* LEFT: Business Information (40% width, never overflows) */}
                          <div className="w-2/5 space-y-0.5 text-left text-slate-500 pr-4 break-words whitespace-normal">
                            <h1 className="text-xs font-black text-slate-900 tracking-tight leading-tight uppercase font-sans mb-1">{company.name}</h1>
                            {company.tradeName && <p className="text-[10px] font-medium text-slate-700 leading-tight">Trade Name: {company.tradeName}</p>}
                            <p className="text-[10px] font-bold text-indigo-600 leading-tight">VAT Number: {company.taxRegistrationId}</p>
                            {company.crNumber && <p className="text-[10px] font-medium text-slate-500 leading-tight">CR Number: {company.crNumber}</p>}
                            <p className="text-[10px] text-slate-400 leading-snug mt-1">{company.address}</p>
                            <p className="text-[10px] text-slate-400 leading-snug">Phone: {company.phone}</p>
                            <p className="text-[10px] text-slate-400 leading-snug break-all">Email: {company.email}</p>
                            {company.website && <p className="text-[10px] text-slate-400 leading-snug break-all font-mono">{company.website}</p>}
                          </div>

                          {/* CENTER: QR Code (20% width, centered always) */}
                          <div className="w-1/5 flex flex-col items-center justify-center shrink-0">
                            <div className="p-1 bg-white border border-slate-200 rounded-lg inline-block">
                              {qrCodeDataUrl ? (
                                <img 
                                  src={qrCodeDataUrl}
                                  alt="Invoice QR Code" 
                                  className="w-10 h-10 object-contain mx-auto"
                                />
                              ) : (
                                <div className="w-10 h-10 flex items-center justify-center text-[7px] text-slate-300 font-mono">ZATCA QR</div>
                              )}
                            </div>
                          </div>

                          {/* RIGHT: Customer Information (40% width, never overflows) */}
                          <div className="w-2/5 space-y-0.5 text-right text-slate-500 pl-4 break-words whitespace-normal font-sans">
                            <span className="text-[9px] font-mono font-black uppercase tracking-wider text-slate-400 block leading-none mb-1">BILL TO</span>
                            <h2 className="text-xs font-black text-indigo-650 block leading-tight mb-1 break-words">{sale.customerName.toUpperCase()}</h2>
                            <p className="text-[10px] text-slate-400 block leading-snug">{customerAddress}</p>
                            <p className="text-[10px] text-slate-400 leading-snug">Phone: {customerPhone}</p>
                            {matchedCustomer?.email && <p className="text-[10px] text-slate-400 leading-snug break-all">Email: {matchedCustomer.email}</p>}
                            {matchedCustomer?.vatNumber && <p className="text-[10px] font-bold text-slate-650 leading-snug">VAT Number: {matchedCustomer.vatNumber}</p>}
                          </div>
                        </div>
                      ) : (
                        /* PAGE 2+: COMPACT CONTINUATION HEADER */
                        <div className="flex flex-row items-center justify-between pb-2 border-b border-slate-200 mb-2 w-full">
                          {/* LEFT: Business Name (40% width, never overflows) */}
                          <div className="w-2/5 text-left pr-4 break-words whitespace-normal">
                            <span className="text-xs font-black text-slate-900 tracking-tight uppercase leading-tight block">{company.name}</span>
                            <p className="text-[9px] text-slate-400 font-mono mt-0.5 leading-none">Invoice No: {invoiceNumber}</p>
                          </div>
                          
                          {/* CENTER: QR Code (20% width, centered always) */}
                          <div className="w-1/5 flex flex-col items-center justify-center shrink-0">
                            <div className="p-0.5 bg-white border border-slate-200 rounded-lg inline-block">
                              {qrCodeDataUrl ? (
                                <img 
                                  src={qrCodeDataUrl}
                                  alt="Invoice QR Code" 
                                  className="w-9 h-9 object-contain mx-auto"
                                />
                              ) : (
                                <div className="w-9 h-9 flex items-center justify-center text-[6px] text-slate-300 font-mono">ZATCA QR</div>
                              )}
                            </div>
                          </div>

                          {/* RIGHT: Customer Name (40% width, never overflows) */}
                          <div className="w-2/5 text-right pl-4 break-words whitespace-normal">
                            <span className="text-xs font-black text-indigo-650 block uppercase leading-tight">{sale.customerName.toUpperCase()}</span>
                            <p className="text-[9px] text-slate-400 mt-0.5 leading-none">Page {pageIdx + 1} of {pageCount}</p>
                          </div>
                        </div>
                      )}

                      {/* SECOND SECTION (PAGE 1 ONLY) */}
                      {isFirstPage && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1 pb-2.5 border-b border-slate-100">
                          {/* BRIEF NOTES */}
                          <div className="bg-slate-50 border border-slate-200/40 rounded-xl p-2.5 flex flex-col justify-center">
                            <span className="text-[8px] font-mono font-black tracking-wider text-slate-400 block mb-0.5 leading-none">ADDITIONAL NOTES & CONDITIONS</span>
                            <p className="text-[10px] italic leading-tight text-slate-600 font-medium">{invoiceNotes}</p>
                          </div>

                          {/* INVOICE ATTRIBUTES */}
                          <div className="bg-slate-50 border border-slate-200/40 rounded-xl p-2.5">
                            <span className="text-[8px] font-mono font-black tracking-wider text-slate-400 block mb-0.5 leading-none">TAX INVOICE DETAILS</span>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[10px]">
                              <div className="flex justify-between">
                                <span className="text-slate-400">Invoice Number:</span>
                                <span className="font-bold text-slate-800 font-mono">{invoiceNumber}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Invoice Date:</span>
                                <span className="font-semibold text-slate-800">{new Date(sale.saleDate).toLocaleDateString()}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Settlement Date:</span>
                                <span className="font-semibold text-slate-800">{new Date(sale.saleDate).toLocaleDateString()}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Payment Method:</span>
                                <span className="font-semibold text-slate-800">{sale.paymentType || 'Cash'}</span>
                              </div>
                              <div className="flex justify-between col-span-2">
                                <span className="text-slate-400">Payment Terms:</span>
                                <span className="font-semibold text-indigo-600">{sale.paymentType === 'Credit' ? 'Net 30 Days' : 'Due Upon Receipt'}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* PRODUCT TABLE SECTION */}
                    <div className={`flex-1 mt-3 ${isLastPage ? 'min-h-[350px]' : 'min-h-[520px]'}`}>
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-900 text-white text-[9px] font-extrabold uppercase tracking-wider">
                            <th className="py-2 px-2.5 rounded-l-lg text-center w-10">SL</th>
                            <th className="py-2 px-2.5">Product Description</th>
                            <th className="py-2 px-2.5 text-right w-12 font-bold">Qty</th>
                            <th className="py-2 px-2.5 text-right w-14 font-bold">Unit</th>
                            <th className="py-2 px-2.5 text-right w-24 font-bold">Unit Price</th>
                            <th className="py-2 px-2.5 text-right w-16 font-bold">VAT %</th>
                            <th className="py-2 px-2.5 text-right w-20 font-bold">VAT</th>
                            <th className="py-2 px-2.5 rounded-r-lg text-right w-28 font-bold">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-[10px] text-slate-755">
                          {pItems.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50/50 transition">
                              <td className="py-2 px-2.5 text-center font-bold text-slate-400">{item.sl}</td>
                              <td className="py-2 px-2.5 font-bold text-slate-900">
                                {item.productName}
                                {item.sku && <span className="block text-[8.5px] text-slate-400 font-mono mt-0.5 leading-none">SKU: {item.sku}</span>}
                              </td>
                              <td className="py-2 px-2.5 text-right font-semibold">{item.quantity}</td>
                              <td className="py-2 px-2.5 text-right text-slate-500">{item.unit}</td>
                              <td className="py-2 px-2.5 text-right font-mono">${item.unitPrice.toFixed(2)}</td>
                              <td className="py-2 px-2.5 text-right font-semibold text-slate-500">{item.taxRatePercent}%</td>
                              <td className="py-2 px-2.5 text-right font-mono">${item.vatAmount.toFixed(2)}</td>
                              <td className="py-2 px-2.5 text-right font-bold text-slate-950 font-mono">${item.totalAmount.toFixed(2)}</td>
                            </tr>
                          ))}
                          
                          {/* PAGE SUBTOTAL ROW */}
                          <tr className="bg-slate-50 font-extrabold border-t border-slate-200">
                            <td colSpan={2} className="py-2 px-2.5 text-slate-500 uppercase tracking-widest text-[9px]">Subtotal Page {pageIdx + 1}</td>
                            <td colSpan={3} className="py-2 px-2.5"></td>
                            <td className="py-2 px-2.5"></td>
                            <td className="py-2 px-2.5 text-right font-mono text-[9px]">${pageSubtotalBlock.vatAmount.toFixed(2)}</td>
                            <td className="py-2 px-2.5 text-right font-mono text-slate-900 text-[10px]">${pageSubtotalBlock.totalWithVat.toFixed(2)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* LAST PAGE SUMMARY SECTION */}
                    {isLastPage && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-200">
                        {/* PAYMENT SUMMARY & AUDIT TRAIL */}
                        <div className="bg-slate-50 border border-slate-200/40 rounded-xl p-2.5 space-y-1.5 flex flex-col justify-center">
                          <span className="text-[8px] font-mono font-black tracking-wider text-slate-400 block leading-none">PAYMENT SUMMARY</span>
                          <div className="space-y-1 text-[10px]">
                            <div className="flex justify-between">
                              <span className="text-slate-400">Paid Amount:</span>
                              <span className="font-extrabold text-emerald-600">${paymentInfo.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-400">Outstanding Balance:</span>
                              <span className={`font-extrabold ${paymentInfo.remainingBalance > 0 ? "text-rose-600" : "text-slate-650"}`}>
                                ${paymentInfo.remainingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="flex justify-between items-center pt-0.5 mt-0.5 border-t border-slate-200/40">
                              <span className="text-slate-400 font-mono text-[9.5px]">Settlement Status:</span>
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8px] font-extrabold border uppercase tracking-wider ${
                                paymentInfo.status === 'Fully Paid'
                                  ? 'bg-emerald-50 border-emerald-250 text-emerald-700'
                                  : 'bg-orange-50 text-orange-700 border-orange-200'
                              }`}>
                                {paymentInfo.status === 'Fully Paid' ? 'Fully Paid' : 'Unpaid/Partial'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* FINAL SUMMARY CALCULATOR */}
                        <div className="bg-slate-50 border border-slate-200/40 rounded-xl p-3 space-y-3 flex flex-col justify-between">
                          <div>
                            <span className="text-[8px] font-mono font-black tracking-wider text-slate-400 block leading-none">TOTAL SUMMARY</span>
                            <div className="space-y-0.5 text-[10px] mt-1.5">
                              {calculatedPageTotals.map((pageTotal, sIdx) => (
                                <div key={sIdx} className="flex justify-between text-slate-500 text-[9px]">
                                  <span>Subtotal Page {sIdx + 1}:</span>
                                  <span className="font-bold font-mono">${pageTotal.totalWithVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                              ))}
                              <div className="h-[1px] bg-slate-200/80 my-1"></div>
                              <div className="flex justify-between text-slate-500 text-[9.5px]">
                                <span>Subtotal (Ex VAT):</span>
                                <span className="font-semibold font-mono">${overallTotals.totalAmountExVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div className="flex justify-between text-slate-500 text-[9.5px]">
                                <span>Total VAT:</span>
                                <span className="font-semibold font-mono">${overallTotals.totalVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div className="h-[1px] bg-slate-200/80 my-1"></div>
                              
                              {/* STACKED GRAND TOTAL BLOCK */}
                              <div className="flex flex-col pt-1.5 space-y-0.5">
                                <span className="text-indigo-600 font-extrabold font-mono uppercase text-[9px] tracking-wider leading-none">GRAND TOTAL</span>
                                <span className="font-mono text-indigo-650 text-base font-black leading-tight">${overallTotals.grandTotalAll.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                              </div>
                            </div>
                          </div>

                          {/* STACKED AMOUNT IN WORDS BLOCK */}
                          <div className="pt-2 border-t border-slate-200/80 space-y-1">
                            <span className="text-[8px] font-mono font-black text-slate-400 tracking-wider block leading-none">AMOUNT IN WORDS</span>
                            <p className="text-[9px] font-bold text-slate-700 italic leading-normal whitespace-normal break-words">
                              {numberToWords(overallTotals.grandTotalAll)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* PERSISTENT FOOTER FOR EVERY SINGLE PAGE */}
                    <div className="pt-3 mt-auto border-t border-slate-100 flex flex-row items-center justify-between text-[9px] text-slate-400 tracking-wide font-semibold mt-4">
                      <div>
                        <p className="font-black uppercase text-[8px] text-indigo-600">SYSTEM CERTIFIED INVOICE</p>
                        <p className="mt-0.5 text-slate-400 font-normal">This is a system generated invoice and does not require signature.</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-slate-400 tracking-tight font-normal">Invoice Code: {invoiceNumber} | Page {pageIdx + 1} of {pageCount}</p>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>

          </div>

         </div>

       </motion.div>
    </div>
  );
}
