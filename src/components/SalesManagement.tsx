import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { calculateCustomerLedger } from '../lib/utils';
import { 
  TrendingUp, 
  Search, 
  Plus, 
  X, 
  Save, 
  AlertTriangle, 
  Calendar, 
  DollarSign, 
  Tag,
  Hash,
  ShoppingBag,
  Bell,
  Archive,
  CreditCard,
  User,
  Layers,
  Sparkles,
  ArrowRight,
  BookOpen,
  ArrowUpRight,
  FileText
} from 'lucide-react';
import { db, auth, OperationType, handleFirestoreError, logSystemActivity, logFinancialAudit } from '../lib/firebase';
import { collection, onSnapshot, doc, runTransaction, setDoc } from 'firebase/firestore';
import { Sale, Customer, Product } from '../types';
import TaxInvoiceModal from './TaxInvoiceModal';

export const INITIAL_SALES: Sale[] = [
  {
    id: "sale-1",
    customerId: "cust-abc",
    customerName: "Aero Athletic Club",
    productId: "prod-1",
    productName: "AeroGrip Pro Athletic Shoes",
    quantity: 2,
    sellingPrice: 110.00,
    unitPrice: 110.00,
    subtotal: 220.00,
    taxRatePercent: 15,
    taxAmount: 33.00,
    totalAmount: 253.00,
    paymentType: "Cash",
    saleDate: "2026-05-28T10:15:00Z",
    timestamp: "2026-05-28T10:15:00Z",
    productPurchasePriceAtSale: 45.00,
    productSellingPriceAtSale: 110.00,
    costOfGoodsSold: 90.00,
    grossProfit: 130.00
  },
  {
    id: "sale-2",
    customerId: "cust-xyz",
    customerName: "Apex Fitness Hub",
    productId: "prod-5",
    productName: "Apex Grip Training Gloves",
    quantity: 5,
    sellingPrice: 28.00,
    unitPrice: 28.00,
    subtotal: 140.00,
    taxRatePercent: 15,
    taxAmount: 21.00,
    totalAmount: 161.00,
    paymentType: "Credit",
    saleDate: "2026-05-29T14:45:00Z",
    timestamp: "2026-05-29T14:45:00Z",
    productPurchasePriceAtSale: 12.00,
    productSellingPriceAtSale: 28.00,
    costOfGoodsSold: 60.00,
    grossProfit: 80.00
  }
];

export default function SalesManagement({ userRole = 'admin' }: { userRole?: 'admin' | 'accountant' | 'cashier' | 'viewer' }) {
  // --- States ---
  const [sales, setSales] = useState<Sale[]>([]);
  const [customersState, setCustomersState] = useState<Customer[]>([]);
  const [customerPayments, setCustomerPayments] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const customers = useMemo(() => {
    return customersState.map(c => {
      const rawDue = calculateCustomerLedger(sales, customerPayments, c.id);
      return {
        ...c,
        dueBalance: Math.max(0, rawDue),
        customerCredit: rawDue < 0 ? Math.abs(rawDue) : 0
      };
    });
  }, [customersState, sales, customerPayments]);

  const creditSalesPaymentInfo = useMemo(() => {
    const infoMap = new Map<string, { amountPaid: number; remainingBalance: number; status: 'Unpaid' | 'Partially Paid' | 'Fully Paid' }>();
    
    // Group sales (valid credit sales only) by customer ID
    const customerSalesGroup: Record<string, Sale[]> = {};
    sales.forEach(s => {
      const status = (s.status || '').toString().toUpperCase().trim();
      const isVoid = status === 'VOID' || status === 'VOIDED';
      const isCredit = (s.paymentType || '').toString().toUpperCase().trim() === 'CREDIT';
      if (!isVoid && isCredit) {
        if (!customerSalesGroup[s.customerId]) {
          customerSalesGroup[s.customerId] = [];
        }
        customerSalesGroup[s.customerId].push(s);
      }
    });

    // Group payments (valid customer payments only) by customer ID
    const customerPaymentsGroup: Record<string, any[]> = {};
    customerPayments.forEach(p => {
      const status = (p.status || '').toString().toUpperCase().trim();
      const isVoid = status === 'VOID' || status === 'VOIDED';
      if (!isVoid) {
        if (!customerPaymentsGroup[p.customerId]) {
          customerPaymentsGroup[p.customerId] = [];
        }
        customerPaymentsGroup[p.customerId].push(p);
      }
    });

    // For each customer, allocate payments FIFO style to credit sales
    Object.keys(customerSalesGroup).forEach(custId => {
      const custSales = [...customerSalesGroup[custId]];
      // Sort credit sales oldest to newest to allocate FIFO
      custSales.sort((a, b) => new Date(a.saleDate || a.timestamp || 0).getTime() - new Date(b.saleDate || b.timestamp || 0).getTime());

      const custPayments = customerPaymentsGroup[custId] || [];
      // Sum total paid by this customer
      let totalPaidPool = custPayments.reduce((sum, p) => sum + (Number(p.amountPaid) || 0), 0);

      custSales.forEach(sale => {
        const invoiceTotal = sale.totalAmount;
        let allocated = 0;

        if (totalPaidPool > 0) {
          if (totalPaidPool >= invoiceTotal) {
            allocated = invoiceTotal;
            totalPaidPool -= invoiceTotal;
          } else {
            allocated = totalPaidPool;
            totalPaidPool = 0;
          }
        }

        const remaining = Math.max(0, invoiceTotal - allocated);
        let status: 'Unpaid' | 'Partially Paid' | 'Fully Paid' = 'Unpaid';
        if (allocated === 0) {
          status = 'Unpaid';
        } else if (remaining === 0) {
          status = 'Fully Paid';
        } else {
          status = 'Partially Paid';
        }

        infoMap.set(sale.id, {
          amountPaid: allocated,
          remainingBalance: remaining,
          status: status
        });
      });
    });

    return infoMap;
  }, [sales, customerPayments]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'All' | 'Cash' | 'Credit'>('All');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [selectedSaleForInvoice, setSelectedSaleForInvoice] = useState<Sale | null>(null);
  const [voidConfirmationSale, setVoidConfirmationSale] = useState<Sale | null>(null);

  // --- Transaction Voiding securely via Transactions (instead of deletions) ---
  const voidTransaction = async (saleId: string) => {
    console.log("VOID triggered", saleId);
    const sale = sales.find(s => s.id === saleId);
    if (!sale) {
      console.error("Sale not found for voiding:", saleId);
      return;
    }
    setVoidConfirmationSale(sale);
  };

  const handleVoidSale = async (sale: Sale) => {
    console.log("handleVoidSale direct invocation for:", sale.id);
    setFeedback(null);
    try {
      if (!auth.currentUser) {
        // Local Void Fallback
        const savedSales = localStorage.getItem('inventory_sales') || '[]';
        let salesList: Sale[] = JSON.parse(savedSales);

        const savedProducts = localStorage.getItem('inventory_products') || '[]';
        let productsList: Product[] = JSON.parse(savedProducts);

        const savedCustomers = localStorage.getItem('inventory_customers') || '[]';
        let customersList: Customer[] = JSON.parse(savedCustomers);

        // Restore product stock
        productsList = productsList.map(p => {
          if (p.id === sale.productId) {
            return { ...p, currentStock: (p.currentStock ?? 0) + sale.quantity };
          }
          return p;
        });

        // If credit, rollback customer due balance
        if (sale.paymentType === 'Credit') {
          customersList = customersList.map(c => {
            if (c.id === sale.customerId) {
              return { ...c, dueBalance: Math.max(0, (c.dueBalance ?? 0) - sale.totalAmount) };
            }
            return c;
          });
        }

        // Void the Sale
        salesList = salesList.map(s => s.id === sale.id ? { ...s, status: 'VOID' } : s);

        // Void in Cash Ledger
        if (sale.paymentType === 'Cash') {
          const savedLedger = localStorage.getItem('inventory_cash_ledger') || '[]';
          let ledgerList = JSON.parse(savedLedger);
          ledgerList = ledgerList.map((l: any) => l.id === `cl-${sale.id}` ? { ...l, status: 'VOID' } : l);
          localStorage.setItem('inventory_cash_ledger', JSON.stringify(ledgerList));
        }

        // Save collections
        localStorage.setItem('inventory_sales', JSON.stringify(salesList));
        localStorage.setItem('inventory_products', JSON.stringify(productsList));
        localStorage.setItem('inventory_customers', JSON.stringify(customersList));

        setSales(salesList);
        setProducts(productsList);
        setCustomersState(customersList);

        setFeedback({
          message: `Sales transaction "${sale.id}" has been voided locally. Restored stocks and liabilities.`,
          type: 'success'
        });
        return;
      }

      await runTransaction(db, async (transaction) => {
        const productRef = doc(db, 'products', sale.productId);
        const customerRef = doc(db, 'customers', sale.customerId);

        // -- 1. Gather all READS first --
        const productSnap = await transaction.get(productRef);
        let customerSnap = null;
        if (sale.paymentType === 'Credit') {
          customerSnap = await transaction.get(customerRef);
        }

        // -- 2. Perform WRITES --
        if (productSnap.exists()) {
          const productData = productSnap.data() as Product;
          transaction.update(productRef, {
            currentStock: (productData.currentStock ?? 0) + sale.quantity
          });
        }

        if (sale.paymentType === 'Credit' && customerSnap && customerSnap.exists()) {
          const customerData = customerSnap.data() as Customer;
          transaction.update(customerRef, {
            dueBalance: Math.max(0, (customerData.dueBalance ?? 0) - sale.totalAmount)
          });
        }

        const saleRef = doc(db, 'sales', sale.id);
        transaction.update(saleRef, { status: 'VOID' });

        if (sale.paymentType === 'Cash') {
          const cashLedgerRef = doc(db, 'cashLedger', `cl-${sale.id}`);
          transaction.update(cashLedgerRef, { status: 'VOID' });
        }
      });

      // Log financial Audit
      await logFinancialAudit(
        'VOID',
        sale.id,
        sale,
        { ...sale, status: 'VOID' },
        {
          cash: sale.paymentType === 'Cash' ? -sale.totalAmount : 0,
          stock: sale.quantity, // increase stock (rolling back the sale)
          due: sale.paymentType === 'Credit' ? -sale.totalAmount : 0
        }
      );

      // Log deletions/voids in system activity
      await logSystemActivity(
        "Sale Voided",
        `Permanently marked sales invoice ID: ${sale.id} as VOID. Restored associated stock levels and reversed customer liabilities.`
      );

      setFeedback({
        message: `Sales transaction "${sale.id}" has been successfully VOIDED. Stock and credit ledger balances rolls back safely.`,
        type: 'success'
      });
    } catch (err: any) {
      console.error("Void operations abort:", err);
      let errMsg = 'Failed to void the sales transaction.';
      try {
        handleFirestoreError(err, OperationType.UPDATE, `sales/${sale.id}`);
      } catch (dbErr: any) {
        errMsg = dbErr.message;
      }
      setFeedback({ message: `Access Abort: ${errMsg}`, type: 'error' });
    }
  };
  const [formData, setFormData] = useState({
    customerId: '',
    productId: '',
    quantity: '1',
    sellingPrice: '',
    taxRatePercent: '15',
    paymentType: 'Cash' as 'Cash' | 'Credit',
    saleDate: new Date().toISOString().split('T')[0]
  });

  // --- Validation Errors ---
  const [errors, setErrors] = useState<Record<string, string>>({});

  // --- Real-time Firestore Sync for Sales, Customers, and Products ---
  useEffect(() => {
    if (!auth.currentUser) {
      // Local fallback
      const savedSales = localStorage.getItem('inventory_sales');
      setSales(savedSales ? JSON.parse(savedSales) : INITIAL_SALES);

      const savedCustomers = localStorage.getItem('inventory_customers');
      setCustomersState(savedCustomers ? JSON.parse(savedCustomers) : []);

      const savedProducts = localStorage.getItem('inventory_products');
      setProducts(savedProducts ? JSON.parse(savedProducts) : []);

      const savedPayments = localStorage.getItem('inventory_customer_payments');
      setCustomerPayments(savedPayments ? JSON.parse(savedPayments) : []);

      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    // 1. Sync Sales
    const unsubSales = onSnapshot(collection(db, 'sales'), (snapshot) => {
      const salesList: Sale[] = [];
      snapshot.forEach((docSnap) => {
        salesList.push(docSnap.data() as Sale);
      });

      if (salesList.length > 0) {
        salesList.sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime());
        setSales(salesList);
        setLoading(false);
      } else {
        setSales([]);
        setLoading(false);
      }
    }, (err) => {
      console.error("Sales sync error:", err);
      let errMsg = 'Failed to synchronize sales list with Firestore database.';
      try {
        handleFirestoreError(err, OperationType.LIST, 'sales');
      } catch (dbErr: any) {
        errMsg = dbErr.message;
      }
      setError(errMsg);
      setFeedback({ message: errMsg, type: 'error' });
      setLoading(false);
    });

    // 2. Sync Customers for selection dropdown
    const unsubCustomers = onSnapshot(collection(db, 'customers'), (snapshot) => {
      const custList: Customer[] = [];
      snapshot.forEach((docSnap) => {
        custList.push(docSnap.data() as Customer);
      });
      custList.sort((a, b) => a.name.localeCompare(b.name));
      setCustomersState(custList);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'customers');
      } catch (err: any) {
        console.error("Customers select sync error", err);
      }
    });

    // 3. Sync Products for selection dropdown
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const prodList: Product[] = [];
      snapshot.forEach((docSnap) => {
        prodList.push(docSnap.data() as Product);
      });
      prodList.sort((a, b) => a.name.localeCompare(b.name));
      setProducts(prodList);
    }, (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'products');
      } catch (err: any) {
        console.error("Products select sync error", err);
      }
    });

    // 4. Sync Customer Payments
    const unsubPayments = onSnapshot(collection(db, 'customerPayments'), (snapshot) => {
      const paymentsList: any[] = [];
      snapshot.forEach((docSnap) => {
        paymentsList.push(docSnap.data());
      });
      setCustomerPayments(paymentsList);
    }, (error) => {
      console.error("Payments sync error in SalesManagement", error);
    });

    return () => {
      unsubSales();
      unsubCustomers();
      unsubProducts();
      unsubPayments();
    };
  }, []);

  // --- Auto-hide Feedback Banner ---
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => {
        setFeedback(null);
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  useEffect(() => {
    const handleTrigger = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.tab === 'sales') {
        openForm();
      }
    };
    window.addEventListener('nexus-trigger-add-modal', handleTrigger);
    return () => window.removeEventListener('nexus-trigger-add-modal', handleTrigger);
  }, []);

  // --- Handle Product Selection logic to auto-fill prices ---
  const handleProductChange = (selectedProdId: string) => {
    const selectedProd = products.find(p => p.id === selectedProdId);
    setFormData(prev => ({
      ...prev,
      productId: selectedProdId,
      sellingPrice: selectedProd ? selectedProd.sellingPrice.toString() : ''
    }));
  };

  // --- Handle Customer Selection to pre-populate default Payment Type ---
  const handleCustomerChange = (selectedCustId: string) => {
    const selectedCust = customers.find(c => c.id === selectedCustId);
    setFormData(prev => ({
      ...prev,
      customerId: selectedCustId,
      paymentType: selectedCust ? selectedCust.customerType : 'Cash'
    }));
  };

  // --- Form Validation ---
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.customerId) newErrors.customerId = 'Choosing a customer is required';
    if (!formData.productId) newErrors.productId = 'Choosing a product is required';
    
    const qty = parseInt(formData.quantity);
    if (isNaN(qty) || qty <= 0) {
      newErrors.quantity = 'Quantity must be at least 1';
    } else {
      const selectedProd = products.find(p => p.id === formData.productId);
      if (selectedProd && qty > selectedProd.currentStock) {
        newErrors.quantity = `Insufficent warehouse stock. Only ${selectedProd.currentStock} units left for "${selectedProd.name}"`;
      }
    }

    const price = parseFloat(formData.sellingPrice);
    if (isNaN(price) || price < 0) {
      newErrors.sellingPrice = 'Enter a valid positive unit selling price';
    }

    const taxRate = parseFloat(formData.taxRatePercent);
    if (isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
      newErrors.taxRatePercent = 'Tax Rate must be between 0% and 100%';
    }

    if (!formData.saleDate) {
      newErrors.saleDate = 'Sale completion date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // --- Form Modal Toggle ---
  const openForm = () => {
    setFormData({
      customerId: '',
      productId: '',
      quantity: '1',
      sellingPrice: '',
      taxRatePercent: '15',
      paymentType: 'Cash',
      saleDate: new Date().toISOString().split('T')[0]
    });
    setErrors({});
    setIsFormOpen(true);
  };

  // --- Submit / Finalize Transaction ---
  const handleSubmitSymbol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const chosenCust = customers.find(c => c.id === formData.customerId);
    const chosenProd = products.find(p => p.id === formData.productId);

    if (!chosenCust || !chosenProd) {
      setFeedback({ message: 'Selected customer or product configuration mismatch.', type: 'error' });
      return;
    }

    if (chosenProd.status === 'inactive') {
      setFeedback({ message: 'Selected product is inactive and cannot be sold.', type: 'error' });
      return;
    }

    const numQty = parseInt(formData.quantity);
    const numPrice = parseFloat(formData.sellingPrice);
    const subtotal = numQty * numPrice;
    const taxRatePercent = parseFloat(formData.taxRatePercent) || 0;
    const taxAmount = (subtotal * taxRatePercent) / 100;
    const totalAmount = subtotal + taxAmount;
    const saleId = `sale-${Date.now()}`;

    const finalizedSaleData: Sale = {
      id: saleId,
      customerId: chosenCust.id,
      customerName: chosenCust.name,
      productId: chosenProd.id,
      productName: chosenProd.name,
      quantity: numQty,
      sellingPrice: numPrice,
      unitPrice: numPrice,
      subtotal: subtotal,
      taxRatePercent: taxRatePercent,
      taxAmount: taxAmount,
      totalAmount: totalAmount,
      paymentType: formData.paymentType,
      saleDate: new Date(formData.saleDate).toISOString(),
      timestamp: new Date(formData.saleDate).toISOString()
    };

    setIsSaving(true);
    try {
      if (!auth.currentUser) {
        // Offline / local storage setup
        const savedSales = localStorage.getItem('inventory_sales') || '[]';
        let salesList: Sale[] = JSON.parse(savedSales);

        const savedProducts = localStorage.getItem('inventory_products') || '[]';
        let productsList: Product[] = JSON.parse(savedProducts);

        const savedCustomers = localStorage.getItem('inventory_customers') || '[]';
        let customersList: Customer[] = JSON.parse(savedCustomers);

        const testProductIndex = productsList.findIndex(p => p.id === chosenProd.id);
        if (testProductIndex === -1) {
          throw new Error(`Product "${chosenProd.name}" no longer exists locally.`);
        }
        const prodData = productsList[testProductIndex];
        const liveStock = prodData.currentStock ?? 0;

        if (liveStock < numQty) {
          throw new Error(`Insufficient stock level. Current limit: ${liveStock}, Requested Quantity: ${numQty}`);
        }

        // Calculations
        const purchasePriceAtSale = prodData.purchasePrice ?? 0;
        const sellingPriceAtSale = prodData.sellingPrice ?? 0;
        const costOfGoodsSold = purchasePriceAtSale * numQty;
        const grossProfit = subtotal - costOfGoodsSold;

        const finalizedSaleWithSnapshot: Sale = {
          ...finalizedSaleData,
          productPurchasePriceAtSale: purchasePriceAtSale,
          productSellingPriceAtSale: sellingPriceAtSale,
          costOfGoodsSold: costOfGoodsSold,
          grossProfit: grossProfit
        };

        // Update product stock
        productsList[testProductIndex] = {
          ...prodData,
          currentStock: liveStock - numQty
        };

        // If Credit, update customer due balance
        if (formData.paymentType === 'Credit') {
          customersList = customersList.map(c => {
            if (c.id === chosenCust.id) {
              return { ...c, dueBalance: (c.dueBalance ?? 0) + totalAmount };
            }
            return c;
          });
        }

        // Add to Cash Ledger if Cash
        if (formData.paymentType === 'Cash') {
          const savedLedger = localStorage.getItem('inventory_cash_ledger') || '[]';
          const ledgerList = JSON.parse(savedLedger);
          const cashLedgerId = `cl-${saleId}`;
          ledgerList.unshift({
            id: cashLedgerId,
            type: 'inflow',
            source: 'sale',
            amount: totalAmount,
            referenceId: saleId,
            description: `Sold product "${chosenProd.name}" to customer "${chosenCust.name}"`,
            timestamp: new Date().toISOString()
          });
          localStorage.setItem('inventory_cash_ledger', JSON.stringify(ledgerList));
        }

        salesList.unshift(finalizedSaleWithSnapshot);

        localStorage.setItem('inventory_sales', JSON.stringify(salesList));
        localStorage.setItem('inventory_products', JSON.stringify(productsList));
        localStorage.setItem('inventory_customers', JSON.stringify(customersList));

        setSales(salesList);
        setProducts(productsList);
        setCustomersState(customersList);

        setFeedback({
          message: `Successfully logged offline sale of $${totalAmount.toFixed(2)} to "${chosenCust.name}".`,
          type: 'success'
        });
        setIsFormOpen(false);
        setIsSaving(false);
        return;
      }

      // Execute Atomic Database Updates
      await runTransaction(db, async (transaction) => {
        // A. Verify and read Product stock live in transaction
        const productRef = doc(db, 'products', chosenProd.id);
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists()) {
          throw new Error(`Product "${chosenProd.name}" no longer exists.`);
        }
        const productData = productSnap.data() as Product;
        if (productData.status === 'inactive') {
          throw new Error(`Transactional abort: Product "${chosenProd.name}" has been marked as inactive.`);
        }
        const liveProductStock = productData.currentStock ?? 0;
        
        if (liveProductStock < numQty) {
          throw new Error(`Transactional abort: Insufficient stock. Live: ${liveProductStock}, Requested: ${numQty}`);
        }

        // B. Verify and read Customer balance if Credit Payment
        let liveCustBalance = 0;
        let customerRef = null;
        if (formData.paymentType === 'Credit') {
          customerRef = doc(db, 'customers', chosenCust.id);
          const customerSnap = await transaction.get(customerRef);
          if (!customerSnap.exists()) {
            throw new Error(`Customer "${chosenCust.name}" profile was purged/not found.`);
          }
          const customerData = customerSnap.data() as Customer;
          liveCustBalance = (customerData.dueBalance ?? 0) + totalAmount;
        }

        // C. WRITE: Decrement product stock level
        transaction.update(productRef, {
          currentStock: liveProductStock - numQty
        });

        // D. WRITE: Add balance to Customer profile if credit
        if (formData.paymentType === 'Credit' && customerRef) {
          transaction.update(customerRef, {
            dueBalance: liveCustBalance
          });
        }

        // E. WRITE: Log sale ledger block
        const purchasePriceAtSale = productData.purchasePrice ?? 0;
        const sellingPriceAtSale = productData.sellingPrice ?? 0;
        const costOfGoodsSold = purchasePriceAtSale * numQty;
        const grossProfit = subtotal - costOfGoodsSold;

        const finalizedSaleWithSnapshot: Sale = {
          ...finalizedSaleData,
          productPurchasePriceAtSale: purchasePriceAtSale,
          productSellingPriceAtSale: sellingPriceAtSale,
          costOfGoodsSold: costOfGoodsSold,
          grossProfit: grossProfit
        };

        const saleRef = doc(db, 'sales', saleId);
        transaction.set(saleRef, finalizedSaleWithSnapshot);

        if (formData.paymentType === 'Cash') {
          const cashLedgerId = `cl-${saleId}`;
          const cashLedgerRef = doc(db, 'cashLedger', cashLedgerId);
          transaction.set(cashLedgerRef, {
            id: cashLedgerId,
            type: 'inflow',
            source: 'sale',
            amount: totalAmount,
            referenceId: saleId,
            description: `Cash sale of x${numQty} "${chosenProd.name}" to "${chosenCust.name}"`,
            timestamp: new Date(formData.saleDate).toISOString()
          });
        }
      });

      // Log activity to the Logs collection
      await logSystemActivity(
        "Sale completed",
        `Completed sale of x${numQty} "${chosenProd.name}" to "${chosenCust.name}" (Subtotal: $${subtotal.toFixed(2)}, Tax ID Applied: $${taxAmount.toFixed(2)}, Total: $${totalAmount.toFixed(2)}, Payment: ${formData.paymentType})`
      );
      
      await logSystemActivity(
        "Stock updated",
        `Decreased stock level for "${chosenProd.name}" (SKU: ${chosenProd.sku}) by -${numQty} units. Remaining stock: ${chosenProd.currentStock - numQty} units.`
      );

      setFeedback({
        message: `Atomically recorded purchase of x${numQty} "${chosenProd.name}" to "${chosenCust.name}". Net amount with VAT: $${totalAmount.toFixed(2)}`,
        type: 'success'
      });
      setIsFormOpen(false);
    } catch (err: any) {
      console.error("Save sale transaction error:", err);
      let errMsg = 'Failed to post sale transaction.';
      try {
        handleFirestoreError(err, OperationType.WRITE, `sales/${saleId}`);
      } catch (dbErr: any) {
        errMsg = dbErr.message;
      }
      setFeedback({ message: `Database Abort: ${errMsg}`, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // --- Calculate Dynamic Metrics ---
  const activeSales = sales.filter(s => s.status !== 'voided' && s.status !== 'VOID');
  const totalSalesRevenue = activeSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalSalesCount = activeSales.length;
  const cashSalesTotal = activeSales.filter(s => s.paymentType === 'Cash').reduce((sum, s) => sum + s.totalAmount, 0);
  const creditSalesTotal = activeSales.filter(s => s.paymentType === 'Credit').reduce((sum, s) => sum + s.totalAmount, 0);
  const totalItemsSold = activeSales.reduce((sum, s) => sum + s.quantity, 0);

  // --- Filter and Search matching ---
  const filteredSalesList = sales.filter((sale) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      (sale.customerName || '').toLowerCase().includes(query) ||
      (sale.productName || '').toLowerCase().includes(query) ||
      (sale.paymentType || '').toLowerCase().includes(query);

    const matchesFilterStatus = paymentFilter === 'All' || sale.paymentType === paymentFilter;

    return matchesSearch && matchesFilterStatus;
  });

  // Derived selected product info
  const currentSelectedProduct = products.find(p => p.id === formData.productId);

  return (
    <div id="sales-management-system-root" className="space-y-8 animate-fade-in font-sans pb-12">
      
      {/* POPUP BANNER ALERTS */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-bold shadow-lg border ${
              feedback.type === 'success' 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {feedback.type === 'success' ? (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            ) : (
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <p>{feedback.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* THREE BENTO METRICS FOR SALES INTELLIGENCE */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {/* Total revenue */}
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Net Sales Revenue</span>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-3xl font-bold font-sans tracking-tight text-slate-900 mt-2">
              ${totalSalesRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center gap-1.5 justify-between">
            <span className="font-medium">Combined registers: {totalSalesCount} entries</span>
            <span className="text-indigo-600 font-bold">{totalItemsSold} stock units distributed</span>
          </div>
        </div>

        {/* Cash registers ledger breakdown */}
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Cash Receipts</span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-50 border border-emerald-100 text-emerald-700 uppercase">
                Liquidity
              </span>
            </div>
            <p className="text-3xl font-bold font-sans tracking-tight text-slate-900 mt-2">
              ${cashSalesTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Instant settled trades</span>
            <span className="font-semibold text-slate-650 text-slate-700">
              {totalSalesRevenue > 0 ? Math.round((cashSalesTotal / totalSalesRevenue) * 100) : 0}% of net
            </span>
          </div>
        </div>

        {/* Credit registries outstanding billing */}
        <div className="bg-white rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Total Credit Sales</span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-blue-50 border border-blue-100 text-blue-700 uppercase">
                Receivables
              </span>
            </div>
            <p className="text-3xl font-bold font-sans tracking-tight text-slate-900 mt-2">
              ${creditSalesTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex justify-between items-center">
            <span>Customer due invoice ledger</span>
            <span className="font-semibold text-amber-700">
              {totalSalesRevenue > 0 ? Math.round((creditSalesTotal / totalSalesRevenue) * 105) / 1.05 : 0}% of net
            </span>
          </div>
        </div>
      </div>

      {/* CORE SALES VIEW STRUCTURE */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column: Sales ledger matching table */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-6">
            
            {/* Header section with add button */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-sans text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-indigo-505 text-indigo-550 text-indigo-500 shrink-0" />
                  Sales Journal Desk
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  View historically indexed customer orders, product margins, and payment state records
                </p>
              </div>

              {userRole !== 'viewer' && (
                <button
                  type="button"
                  onClick={openForm}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs hover:shadow-md cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>Record New Sale</span>
                </button>
              )}
            </div>

            {/* Filters panel */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2 border-t border-slate-100">
              <div className="sm:col-span-2 relative">
                <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search ledger by product, customer, or payment type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-xs font-medium text-slate-800 placeholder:text-slate-400 transition focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none font-sans"
                />
              </div>

              <div className="flex bg-slate-50 border border-slate-100 p-1 rounded-xl">
                {([ 'All', 'Cash', 'Credit' ] as const).map((filterOpt) => (
                  <button
                    key={filterOpt}
                    type="button"
                    onClick={() => setPaymentFilter(filterOpt)}
                    className={`flex-1 text-center py-2 text-[10px] font-bold tracking-tight rounded-lg transition cursor-pointer ${
                      paymentFilter === filterOpt
                        ? 'bg-white text-indigo-600 shadow-xs border border-slate-100' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {filterOpt}
                  </button>
                ))}
              </div>
            </div>

            {/* List entries */}
            <div className="space-y-4 pt-2">
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="border border-slate-200 rounded-2xl p-5 bg-white animate-pulse flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-3 flex-grow">
                        <div className="h-4 bg-slate-100 rounded-md w-1/3"></div>
                        <div className="grid grid-cols-3 gap-4 pt-1">
                          <div className="h-3.5 bg-slate-50 rounded-md w-1/2"></div>
                          <div className="h-3.5 bg-slate-50 rounded-md w-2/3"></div>
                          <div className="h-3.5 bg-slate-50 rounded-md w-1/2"></div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 border-slate-100 pt-3 md:pt-0 shrink-0">
                        <div className="h-5 bg-slate-100 rounded-md w-24"></div>
                        <div className="w-8 h-8 bg-slate-50 rounded-lg"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-rose-500 border border-dashed border-rose-200 rounded-[2rem] bg-rose-50/10">
                  <div className="w-12 h-12 bg-rose-50 border border-rose-100 rounded-full flex items-center justify-center text-rose-500 mb-3 animate-bounce">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-bold text-rose-800">Connection Offline</p>
                  <p className="text-xs text-rose-500 mt-1 max-w-sm px-6">
                    {error}
                  </p>
                </div>
              ) : filteredSalesList.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0, y: 12 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  transition={{ duration: 0.3 }}
                  className="mx-auto max-w-md w-full my-6 bg-slate-50/50 border border-slate-200/60 rounded-3xl p-8 text-center flex flex-col items-center gap-4.5 shadow-3xs hover:shadow-2xs transition-all"
                >
                  <div className="relative group">
                    <div className="absolute inset-0 bg-indigo-200/20 rounded-full blur-xl group-hover:scale-125 transition duration-300"></div>
                    <div className="relative w-16 h-16 bg-white border border-slate-100 rounded-2xl shadow-3xs flex items-center justify-center text-slate-400 group-hover:text-indigo-600 transition-all duration-300">
                      <ShoppingBag className="h-8 w-8 text-slate-400 transition-transform duration-300 group-hover:scale-110" />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest leading-none">
                      {sales.length === 0 ? 'No Sales Yet' : 'No Sales Found'}
                    </h4>
                    <p className="text-xs text-slate-500 mt-2 max-w-xs leading-relaxed font-semibold">
                      {sales.length === 0 
                        ? 'Log your customer sales orders and settlements to build real-time profit reports, ledger charts, and inventory balances.'
                        : searchQuery || paymentFilter !== 'All'
                          ? "We couldn't identify any transactions mapping to your active filters or text inputs."
                          : 'No matched sales logs. Clean up filters or register a new transaction.'}
                    </p>
                  </div>
                  <div className="flex gap-2.5 pt-1.5 flex-wrap justify-center">
                    {sales.length > 0 && (searchQuery || paymentFilter !== 'All') ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setPaymentFilter('All');
                        }}
                        className="bg-white border border-slate-200 hover:border-slate-350 text-slate-705 font-extrabold text-[11px] uppercase tracking-wider px-5 py-2.5 rounded-xl transition cursor-pointer shadow-3xs"
                      >
                        Reset Search Filters
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openForm()}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[11px] uppercase tracking-wider h-10 px-5 rounded-xl transition cursor-pointer shadow-xs hover:shadow-md inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Log First Sales Order</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs bg-white">
                  <div className="overflow-x-auto max-h-[550px]">
                    <table className="w-full text-left border-collapse table-auto">
                      <thead className="sticky top-0 bg-slate-50 z-10 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                        <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                          <th className="py-4 px-6">Sale Date</th>
                          <th className="py-4 px-5">Customer & Product</th>
                          <th className="py-4 px-5">Qty & Unit Price</th>
                          <th className="py-4 px-5">Settlement Type</th>
                          <th className="py-4 px-5">Credit Status / Progress</th>
                          <th className="py-4 px-5 text-right font-mono">Invoice Total</th>
                          <th className="py-4 px-6 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                        {filteredSalesList.map((sale) => {
                          const isVoided = sale.status === 'voided' || sale.status === 'VOID';
                          const isCredit = sale.paymentType === 'Credit';
                          const creditInfo = isCredit && !isVoided
                            ? creditSalesPaymentInfo.get(sale.id) || { amountPaid: 0, remainingBalance: sale.totalAmount, status: 'Unpaid' }
                            : null;

                          return (
                            <tr 
                              key={sale.id}
                              className={`hover:bg-indigo-50/20 even:bg-slate-50/30 transition duration-150 ${
                                isVoided ? 'opacity-40 bg-slate-50 line-through text-slate-400' : ''
                              }`}
                            >
                              {/* Date */}
                              <td className="py-4 px-6 font-mono text-slate-500 font-bold whitespace-nowrap">
                                {new Date(sale.saleDate).toLocaleDateString(undefined, { 
                                  month: 'short', 
                                  day: 'numeric', 
                                  year: 'numeric' 
                                })}
                              </td>

                              {/* Customer & Product */}
                              <td className="py-4 px-5 whitespace-nowrap">
                                <div className="font-extrabold text-slate-900 capitalize">{sale.customerName}</div>
                                <div className="text-[11px] text-slate-500 font-normal flex items-center gap-1 mt-0.5">
                                  <span>{sale.productName}</span>
                                </div>
                              </td>

                              {/* Qty & Unit Price */}
                              <td className="py-4 px-5 font-mono whitespace-nowrap text-slate-700">
                                <span className="font-bold text-slate-900">x{sale.quantity}</span> @ ${sale.sellingPrice.toFixed(2)}
                              </td>

                              {/* Settlement */}
                              <td className="py-4 px-5 whitespace-nowrap">
                                <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide px-2.5 py-0.5 rounded-full border ${
                                  sale.paymentType === 'Cash' 
                                    ? 'bg-emerald-50 border-emerald-250/60 text-emerald-700 shadow-3xs' 
                                    : 'bg-blue-50 border-blue-200 text-blue-700 shadow-3xs'
                                }`}>
                                  <CreditCard className="h-2.5 w-2.5 shrink-0" />
                                  {sale.paymentType}
                                </span>
                              </td>

                              {/* Credit progression */}
                              <td className="py-4 px-5">
                                {isVoided ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200 shadow-3xs">
                                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                    Void
                                  </span>
                                ) : isCredit && creditInfo ? (
                                  <div className="space-y-1.5 max-w-[200px]">
                                    <div className="flex items-center justify-between text-[10px]">
                                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold border uppercase tracking-wider ${
                                        creditInfo.status === 'Fully Paid'
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-250/60 shadow-3xs'
                                          : 'bg-orange-55 bg-orange-50 text-orange-705 text-orange-700 border border-orange-200/60 shadow-3xs'
                                      }`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${
                                          creditInfo.status === 'Fully Paid' ? 'bg-emerald-500' : 'bg-orange-55 bg-orange-500'
                                        }`}></span>
                                        {creditInfo.status === 'Fully Paid' ? 'Paid' : 'Pending'}
                                      </span>
                                      <span className="font-mono text-slate-400 font-bold">
                                        {Math.round((creditInfo.amountPaid / sale.totalAmount) * 100)}%
                                      </span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                      <div 
                                        className={`h-full rounded-full transition-all duration-300 ${
                                          creditInfo.status === 'Fully Paid' ? 'bg-emerald-500' : 'bg-orange-55 bg-orange-400 bg-orange-500'
                                        }`}
                                        style={{ width: `${Math.min(100, (creditInfo.amountPaid / sale.totalAmount) * 100)}%` }}
                                      ></div>
                                    </div>
                                    <div className="flex justify-between font-mono text-[9px] text-slate-400">
                                      <span>Paid: ${creditInfo.amountPaid.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                      <span>Bal: ${creditInfo.remainingBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-705 text-emerald-700 border border-emerald-250/60 shadow-3xs">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                    Success / Paid
                                  </span>
                                )}
                              </td>

                              {/* Total Price */}
                              <td className="py-4 px-5 text-right font-black font-mono text-sm text-indigo-600 whitespace-nowrap">
                                ${sale.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>

                              {/* Actions */}
                              <td className="py-4 px-6 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedSaleForInvoice(sale)}
                                    className="inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-55 px-3 py-1.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 transition cursor-pointer"
                                  >
                                    <FileText className="h-3.5 w-3.5" />
                                    <span>Tax Invoice</span>
                                  </button>
                                  {isVoided ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-1 text-[9px] font-mono font-bold text-slate-400 select-none">
                                      VOIDED
                                    </span>
                                  ) : (
                                    userRole === 'admin' && (
                                      <button
                                        type="button"
                                        onClick={() => voidTransaction(sale.id)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-rose-200 bg-rose-50/50 hover:bg-rose-50 text-[11px] font-bold text-rose-600 hover:text-rose-700 transition cursor-pointer"
                                        title="Void sale transaction"
                                      >
                                        <span>Void</span>
                                      </button>
                                    )
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Right side: Insights, tips and warnings */}
        <div className="space-y-6">
          {/* Quick instructions / guidelines */}
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Receivable Rules</h4>
              <CreditCard className="h-4 w-4 text-indigo-500 shrink-0" />
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              When finalizing a <strong className="text-slate-800 font-extrabold">Credit sale</strong>, the customer due balance is increased instantly. Always ensure compliance with credit boundaries.
            </p>

            <div className="pt-2 border-t border-slate-100 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Unsettled Accounts</span>
                <span className="font-mono text-[10px] font-bold text-amber-700 bg-amber-50 rounded px-2 py-0.5 border border-amber-100">
                  {sales.filter(s => s.paymentType === 'Credit').length} active
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Total volume distributed</span>
                <span className="font-bold text-slate-700">{totalItemsSold} stock units</span>
              </div>
            </div>
          </div>

          {/* Quick seed metrics info panel */}
          <div className="bg-slate-900 text-white rounded-[2rem] p-6 sm:p-8 space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-bold uppercase text-[10px] tracking-widest text-slate-400">System Integrity</h4>
              <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed">
              Stock checking operates inside a <strong className="text-white font-semibold">Single Cloud Transaction</strong> prevent race conditions. Quantities are instantly updated upon completion.
            </p>

            <div className="mt-4 border-t border-slate-800 pt-3 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Inventory Sync</span>
                <span className="font-mono text-[9px] text-emerald-400 font-semibold uppercase">ACTIVE-TX</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Customer Debt Sync</span>
                <span className="font-mono text-[9px] text-indigo-300">AUTOMATIC</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SALES RECORD MODAL FORM */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-xl max-w-xl w-full overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 px-6 sm:px-8 py-5">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Record Ledger Sales Line
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Select customer, products config, payment type and complete transactions atomically
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-800 transition rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Form body */}
              <form onSubmit={handleSubmitSymbol} className="p-6 sm:p-8 space-y-6">
                
                {/* Select Customer */}
                <div className="relative w-full">
                  {customers.length === 0 ? (
                    <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-800 font-medium animate-fade-in shadow-3xs">
                      ⚠️ No customers registered in index. Please configure Customer profiles inside directory first.
                    </div>
                  ) : (
                    <div className="relative w-full">
                      <select
                        id="form-sales-customer-field"
                        value={formData.customerId}
                        onChange={(e) => handleCustomerChange(e.target.value)}
                        required
                        className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all focus:ring-1 focus:ring-indigo-600 bg-white appearance-none cursor-pointer disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                          errors.customerId 
                            ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455' 
                            : 'border-slate-200 focus:border-indigo-605'
                        }`}
                      >
                        <option value="">-- Choose Customer profile --</option>
                        {customers.filter(cust => cust.status !== 'inactive').map((cust) => (
                          <option key={cust.id} value={cust.id}>
                            {cust.name} ({cust.customerType} - Due: ${cust.dueBalance.toFixed(2)})
                          </option>
                        ))}
                      </select>
                      <label htmlFor="form-sales-customer-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-650">
                        Customer Name <span className="text-rose-500 font-extrabold">*</span>
                      </label>
                    </div>
                  )}
                  {errors.customerId && (
                    <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                      <span>{errors.customerId}</span>
                    </div>
                  )}
                </div>

                {/* Select Product */}
                <div className="relative w-full">
                  {products.filter(p => p.status !== 'inactive').length === 0 ? (
                    <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-800 font-medium animate-fade-in shadow-3xs">
                      ⚠️ No active products cataloged inside database. Add or reactivate products first.
                    </div>
                  ) : (
                    <div className="relative w-full">
                      <select
                        id="form-sales-product-field"
                        value={formData.productId}
                        onChange={(e) => handleProductChange(e.target.value)}
                        required
                        className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all focus:ring-1 focus:ring-indigo-600 bg-white appearance-none cursor-pointer disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                          errors.productId
                            ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455' 
                            : 'border-slate-200 focus:border-indigo-605'
                        }`}
                      >
                        <option value="">-- Choose Product SKU --</option>
                        {products.filter(p => p.status !== 'inactive').map((p) => {
                          const outOfStock = p.currentStock <= 0;
                          return (
                            <option key={p.id} value={p.id} disabled={outOfStock}>
                              {p.name} ({p.currentStock > 0 ? `${p.currentStock} units left` : 'OUT OF STOCK'} • SRP: ${p.sellingPrice.toFixed(2)})
                            </option>
                          );
                        })}
                      </select>
                      <label htmlFor="form-sales-product-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-650">
                        Product Specification <span className="text-rose-500 font-extrabold">*</span>
                      </label>
                    </div>
                  )}
                  {errors.productId && (
                    <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                      <span>{errors.productId}</span>
                    </div>
                  )}
                </div>

                              {/* Grid Inputs for Quantity & Pricing */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  
                  {/* Quantity input */}
                  <div className="relative w-full">
                    <input
                      type="number"
                      required
                      min="1"
                      id="form-sales-qty-field"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      placeholder=" "
                      className={`peer w-full rounded-xl border px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                        errors.quantity
                          ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455' 
                          : 'border-slate-200 focus:border-indigo-605'
                      }`}
                    />
                    <label htmlFor="form-sales-qty-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                      Quantity Trade Units <span className="text-rose-500 font-extrabold">*</span>
                    </label>
                    {errors.quantity && (
                      <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-505 shrink-0" />
                        <span>{errors.quantity}</span>
                      </div>
                    )}
                  </div>

                  {/* Selling price */}
                  <div className="relative w-full">
                    <span className="absolute left-3.5 top-[18px] text-slate-400 text-xs font-semibold leading-none">$</span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      id="form-sales-price-field"
                      value={formData.sellingPrice}
                      onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })}
                      placeholder=" "
                      className={`peer w-full rounded-xl border pl-[26px] pr-3.5 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                        errors.sellingPrice 
                          ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455' 
                          : 'border-slate-200 focus:border-indigo-605'
                      }`}
                    />
                    <label htmlFor="form-sales-price-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-placeholder-shown:left-[26px] peer-focus:top-1.5 peer-focus:left-3.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600">
                      Selling Price Override ($) <span className="text-rose-500 font-extrabold">*</span>
                    </label>
                    {errors.sellingPrice && (
                      <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-505 shrink-0" />
                        <span>{errors.sellingPrice}</span>
                      </div>
                    )}
                  </div>

                </div>

                {/* Date and Settlement selection */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Settlement Segment Choice */}
                  <div className="relative w-full">
                    <div className="flex bg-slate-50 border border-slate-200 p-1 rounded-xl h-[52px] items-center">
                      {([ 'Cash', 'Credit' ] as const).map((typeOpt) => (
                        <button
                          key={typeOpt}
                          type="button"
                          onClick={() => setFormData({ ...formData, paymentType: typeOpt })}
                          className={`flex-1 text-center py-2 text-xs font-extrabold rounded-lg uppercase tracking-wider transition cursor-pointer ${
                            formData.paymentType === typeOpt 
                              ? 'bg-white text-indigo-600 shadow-xs border border-slate-200/40' 
                              : 'text-slate-500 hover:text-slate-800 opacity-80'
                          }`}
                        >
                          {typeOpt}
                        </button>
                      ))}
                    </div>
                    <span className="absolute -top-2.5 left-3 px-1.5 bg-white text-[10px] font-extrabold text-slate-400 uppercase tracking-widest leading-none">
                      Settlement Type <span className="text-rose-500 font-extrabold">*</span>
                    </span>
                  </div>

                  {/* Completion date */}
                  <div className="relative w-full">
                    <input
                      type="date"
                      required
                      id="form-sales-date-field"
                      value={formData.saleDate}
                      onChange={(e) => setFormData({ ...formData, saleDate: e.target.value })}
                      className="peer w-full rounded-xl border border-slate-200 bg-white px-3.5 pt-5 pb-1.5 text-xs font-semibold focus:border-indigo-605 focus:ring-1 focus:ring-indigo-605 focus:outline-none transition duration-150 cursor-pointer h-[52px]"
                    />
                    <label htmlFor="form-sales-date-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider pointer-events-none origin-left peer-focus:text-indigo-650">
                      Sale Completion Date <span className="text-rose-500 font-extrabold">*</span>
                    </label>
                    {errors.saleDate && (
                      <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-505 shrink-0" />
                        <span>{errors.saleDate}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tax Configuration Segment */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="relative w-full">
                    <span className="absolute right-3.5 top-4.5 text-slate-400 text-xs font-semibold leading-none">%</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      required
                      id="form-sales-tax-field"
                      value={formData.taxRatePercent}
                      onChange={(e) => setFormData({ ...formData, taxRatePercent: e.target.value })}
                      placeholder=" "
                      className={`peer w-full rounded-xl border pl-3.5 pr-8 pt-5 pb-1.5 text-xs font-semibold focus:outline-none transition-all placeholder-transparent focus:ring-1 focus:ring-indigo-600 disabled:opacity-60 disabled:bg-slate-50 h-[52px] ${
                        errors.taxRatePercent 
                          ? 'border-rose-300 text-rose-800 bg-rose-50/10 focus:border-rose-455' 
                          : 'border-slate-200 focus:border-indigo-605'
                      }`}
                    />
                    <label htmlFor="form-sales-tax-field" className="absolute left-3.5 top-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-150 pointer-events-none origin-left peer-placeholder-shown:text-xs peer-placeholder-shown:font-semibold peer-placeholder-shown:top-4 peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-indigo-600 font-bold">
                      Tax / VAT Rate (%) <span className="text-rose-500 font-extrabold">*</span>
                    </label>
                    {errors.taxRatePercent && (
                      <div className="mt-2 text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-3xs animate-fade-in">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                        <span>{errors.taxRatePercent}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Dynamic Summary Breakdown Banner */}
                {formData.productId && formData.customerId && (() => {
                  const subVal = (parseInt(formData.quantity) || 1) * (parseFloat(formData.sellingPrice) || 0);
                  const rateVal = parseFloat(formData.taxRatePercent) || 0;
                  const taxVal = (subVal * rateVal) / 100;
                  const grandVal = subVal + taxVal;
                  return (
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2 text-xs">
                      <p className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">Dynamic invoice Summary</p>
                      <div className="flex items-center justify-between font-medium">
                        <span className="text-slate-500">
                          {currentSelectedProduct?.name || 'Item'} (x{parseInt(formData.quantity) || 1})
                        </span>
                        <span className="text-slate-800">
                          ${subVal.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between font-medium text-[11px] text-slate-500 border-t border-dashed border-slate-200/60 pt-1.5">
                        <span>Sales Tax / VAT ({rateVal}%)</span>
                        <span>
                          ${taxVal.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between font-bold text-indigo-600 pt-1.5 border-t border-slate-200">
                        <span>Total Invoice Due (Locked)</span>
                        <span>
                          ${grandVal.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Submits */}
                <div className="flex justify-end items-center gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setIsFormOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-700 transition shadow-xs hover:shadow-md cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed font-semibold"
                  >
                    {isSaving ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0"></span>
                        <span>Posting Ledger...</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        <span>Post ledger Transaction</span>
                      </>
                    )}
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedSaleForInvoice && (
          <TaxInvoiceModal 
            sale={selectedSaleForInvoice}
            customers={customers}
            products={products}
            sales={sales}
            customerPayments={customerPayments}
            onClose={() => setSelectedSaleForInvoice(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {voidConfirmationSale && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-8 shadow-xl"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-sans text-sm font-bold tracking-tight text-slate-850">
                    Confirm Void Transaction
                  </h3>
                  <p className="text-xs text-slate-550 leading-relaxed">
                    Are you sure you want to VOID this sales transaction? This will mark it as VOID, reverse customer due balances, rollback stock levels, and flag the transaction in the ledger. This action is irreversible.
                  </p>
                  <div className="text-[10px] font-mono text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                    <div><span className="font-bold">Transaction ID:</span> {voidConfirmationSale.id}</div>
                    <div><span className="font-bold">Customer:</span> {voidConfirmationSale.customerName}</div>
                    <div><span className="font-bold">Product:</span> {voidConfirmationSale.productName} (x{voidConfirmationSale.quantity})</div>
                    <div><span className="font-bold">Total Amount:</span> ${voidConfirmationSale.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setVoidConfirmationSale(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const saleToVoid = voidConfirmationSale;
                    setVoidConfirmationSale(null);
                    await handleVoidSale(saleToVoid);
                  }}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 transition cursor-pointer shadow-xs"
                >
                  Yes, Void Transaction
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
