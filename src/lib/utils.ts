export function cn(...classes: (string | undefined | null | boolean)[]) {
  return classes.filter(Boolean).join(' ');
}

export function calculateCustomerLedger(sales: any[], payments: any[], customerId?: string) {
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
    const status = (s.status || '').toString().toUpperCase().trim();
    if (status === 'VOID' || status === 'VOIDED') {
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
    const status = (p.status || '').toString().toUpperCase().trim();
    if (status === 'VOID' || status === 'VOIDED') {
      return false;
    }
    return true;
  });

  // 6. Sum up and compute the outstanding balance
  const totalSales = validSales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
  const totalPaid = validPayments.reduce((sum, p) => sum + (Number(p.amountPaid) || 0), 0);

  return totalSales - totalPaid;
}

