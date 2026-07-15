export function cn(...classes: (string | undefined | null | boolean)[]) {
  return classes.filter(Boolean).join(' ');
}

/**
 * Returns the normalized status string: trimmed, converted to upper case.
 * Handles null/undefined by returning an empty string.
 */
export function getNormalizedStatus(status: any): string {
  return String(status ?? '').trim().toUpperCase();
}

/**
 * Checks if a status is VOID or VOIDED in a case-insensitive manner.
 */
export function isVoidStatus(status: any): boolean {
  const norm = getNormalizedStatus(status);
  return norm === 'VOID' || norm === 'VOIDED';
}

/**
 * Checks if a status is ACTIVE in a case-insensitive manner.
 */
export function isActiveStatus(status: any): boolean {
  const norm = getNormalizedStatus(status);
  return norm === 'ACTIVE';
}

/**
 * Checks if a status is INACTIVE in a case-insensitive manner.
 */
export function isInactiveStatus(status: any): boolean {
  const norm = getNormalizedStatus(status);
  return norm === 'INACTIVE';
}

export function calculateCustomerLedger(sales: any[], payments: any[], customerId?: string, openingBalance: number = 0) {
  // 1. Filter by customerId if provided
  const customerSales = customerId ? sales.filter(s => s.customerId === customerId) : sales;
  const customerPayments = customerId ? payments.filter(p => p.customerId === customerId) : payments;

  // 2. Deduplicate sales by ID to avoid any double counting
  const uniqueSalesMap = new Map();
  customerSales.forEach(s => {
    if (s && s.id) {
      uniqueSalesMap.set(s.id, s);
    } else if (s) {
      // Fallback for sales without ID (if any)
      const tempId = `temp-sale-${Math.random()}`;
      uniqueSalesMap.set(tempId, s);
    }
  });
  const uniqueSales = Array.from(uniqueSalesMap.values());

  // 3. Deduplicate payments by ID to avoid double counting
  const uniquePaymentsMap = new Map();
  customerPayments.forEach(p => {
    if (p && p.id) {
      uniquePaymentsMap.set(p.id, p);
    } else if (p) {
      // Fallback for payments without ID (if any)
      const tempId = `temp-payment-${Math.random()}`;
      uniquePaymentsMap.set(tempId, p);
    }
  });
  const uniquePayments = Array.from(uniquePaymentsMap.values());

  // 4. Filter sales: Valid ONLY IF status is not "VOID" and not "voided" (missing status is valid), and paymentType is exactly "Credit"
  const validSales = uniqueSales.filter(s => {
    if (isVoidStatus(s.status)) {
      return false;
    }
    const paymentType = (s.paymentType || '').toString().toUpperCase().trim();
    if (paymentType !== 'CREDIT') {
      return false;
    }
    return true;
  });

  // 5. Filter payments: Ensure voided payments are excluded so dues rollback correctly
  const validPayments = uniquePayments.filter(p => {
    if (isVoidStatus(p.status)) {
      return false;
    }
    return true;
  });

  // 6. Sum up and compute the outstanding balance
  const totalSales = validSales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
  const totalPaid = validPayments.reduce((sum, p) => sum + (Number(p.amountPaid) || 0), 0);

  return openingBalance + totalSales - totalPaid;
}

export function calculateSupplierLedger(purchases: any[], payments: any[], supplierId?: string, openingBalance: number = 0) {
  // 1. Filter by supplierId if provided
  const supplierPurchases = supplierId ? purchases.filter(p => p.supplierId === supplierId) : purchases;
  const supplierPayments = supplierId ? payments.filter(p => p.supplierId === supplierId) : payments;

  // 2. Deduplicate purchases by ID to avoid any double counting
  const uniquePurchasesMap = new Map();
  supplierPurchases.forEach(p => {
    if (p && p.id) {
      uniquePurchasesMap.set(p.id, p);
    } else if (p) {
      const tempId = `temp-purchase-${Math.random()}`;
      uniquePurchasesMap.set(tempId, p);
    }
  });
  const uniquePurchases = Array.from(uniquePurchasesMap.values());

  // 3. Deduplicate payments by ID to avoid double counting
  const uniquePaymentsMap = new Map();
  supplierPayments.forEach(p => {
    if (p && p.id) {
      uniquePaymentsMap.set(p.id, p);
    } else if (p) {
      const tempId = `temp-payment-${Math.random()}`;
      uniquePaymentsMap.set(tempId, p);
    }
  });
  const uniquePayments = Array.from(uniquePaymentsMap.values());

  // 4. Filter purchases: Valid ONLY IF status is not "VOID" and not "voided", and paymentType is exactly "Credit"
  const validPurchases = uniquePurchases.filter(p => {
    if (isVoidStatus(p.status)) {
      return false;
    }
    const paymentType = (p.paymentType || '').toString().toUpperCase().trim();
    if (paymentType !== 'CREDIT') {
      return false;
    }
    return true;
  });

  // 5. Filter payments: Ensure voided payments are excluded so dues rollback correctly
  const validPayments = uniquePayments.filter(p => {
    if (isVoidStatus(p.status)) {
      return false;
    }
    return true;
  });

  // 6. Sum up and compute the outstanding balance
  const totalPurchases = validPurchases.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);
  const totalPaid = validPayments.reduce((sum, p) => sum + (Number(p.amountPaid) || 0), 0);

  return openingBalance + totalPurchases - totalPaid;
}


