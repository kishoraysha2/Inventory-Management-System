import { customerService } from '../services/customer/customerService';
import { supplierService } from '../services/supplier/supplierService';

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
  return customerService.calculateCustomerLedger(sales, payments, customerId, openingBalance);
}

export function calculateSupplierLedger(purchases: any[], payments: any[], supplierId?: string, openingBalance: number = 0) {
  return supplierService.calculateSupplierLedger(purchases, payments, supplierId, openingBalance);
}

/**
 * Formats a quantity with its unit code.
 * Examples: formatQuantity(250, 'PCS') => "250 PCS"
 *           formatQuantity(15, 'KG') => "15 KG"
 *           formatQuantity(10) => "10 Units"
 */
export function formatQuantity(quantity: number | string | undefined | null, unitCode?: string, fallback = 'Units'): string {
  const qtyNum = typeof quantity === 'number' ? quantity : parseFloat(String(quantity ?? 0)) || 0;
  const formattedQty = Number.isInteger(qtyNum) ? qtyNum.toString() : qtyNum.toFixed(3).replace(/\.?0+$/, '');
  const code = (unitCode && unitCode.trim()) ? unitCode.trim() : fallback;
  return `${formattedQty} ${code}`;
}

/**
 * Formats a unit price with currency and unit code suffix.
 * Examples: formatUnitPrice(150, 'PCS', 'SAR') => "150.00 SAR / PCS"
 *           formatUnitPrice(80, 'KG', 'SAR') => "80.00 SAR / KG"
 */
export function formatUnitPrice(price: number | string | undefined | null, unitCode?: string, currency = 'SAR'): string {
  const priceNum = typeof price === 'number' ? price : parseFloat(String(price ?? 0)) || 0;
  const formattedPrice = priceNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const code = (unitCode && unitCode.trim()) ? unitCode.trim() : 'Unit';
  return `${formattedPrice} ${currency} / ${code}`;
}



