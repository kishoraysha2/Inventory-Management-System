import { Product } from '../../types';
import { isInactiveStatus } from '../shared/utils';

export interface IInventoryService {
  /**
   * Checks if a product's current stock has fallen to or below its minimum threshold limit.
   */
  isLowStock(product: Product): boolean;

  /**
   * Counts the number of active products with low stock.
   */
  getCriticalAlertsCount(products: Product[]): number;

  /**
   * Calculates the total inventory valuation based on purchase prices.
   */
  calculateTotalValuation(products: Product[]): number;

  /**
   * Calculates the total potential revenue of current stock based on selling prices.
   */
  calculatePotentialRevenue(products: Product[]): number;

  /**
   * Validates product creation or edit form inputs.
   */
  validateProductForm(formData: {
    name: string;
    sku: string;
    category: string;
    purchasePrice: string;
    sellingPrice: string;
    currentStock: string;
    minimumStockAlert: string;
  }): Record<string, string>;
}

export class InventoryService implements IInventoryService {
  isLowStock(product: Product): boolean {
    return product.currentStock <= product.minimumStockAlert;
  }

  getCriticalAlertsCount(products: Product[]): number {
    return products.filter(
      p => !isInactiveStatus(p.status) && this.isLowStock(p)
    ).length;
  }

  calculateTotalValuation(products: Product[]): number {
    return products
      .filter(p => !isInactiveStatus(p.status))
      .reduce((sum, p) => sum + (Number(p.purchasePrice || 0) * Number(p.currentStock || 0)), 0);
  }

  calculatePotentialRevenue(products: Product[]): number {
    return products
      .filter(p => !isInactiveStatus(p.status))
      .reduce((sum, p) => sum + (Number(p.sellingPrice || 0) * Number(p.currentStock || 0)), 0);
  }

  validateProductForm(formData: {
    name: string;
    sku: string;
    category: string;
    purchasePrice: string;
    sellingPrice: string;
    currentStock: string;
    minimumStockAlert: string;
  }): Record<string, string> {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Product name is required';
    }

    if (!formData.sku.trim()) {
      errors.sku = 'SKU identifier is required';
    }

    if (!formData.category.trim()) {
      errors.category = 'Category selection is required';
    }

    const purchasePrice = parseFloat(formData.purchasePrice);
    if (isNaN(purchasePrice) || purchasePrice < 0) {
      errors.purchasePrice = 'Purchase price must be 0 or greater';
    }

    const sellingPrice = parseFloat(formData.sellingPrice);
    if (isNaN(sellingPrice) || sellingPrice < 0) {
      errors.sellingPrice = 'Selling price must be 0 or greater';
    }

    if (!isNaN(purchasePrice) && !isNaN(sellingPrice) && sellingPrice < purchasePrice) {
      errors.sellingPrice = 'Selling price should normally be greater than or equal to purchase cost';
    }

    const stock = parseInt(formData.currentStock);
    if (isNaN(stock) || stock < 0) {
      errors.currentStock = 'Stock level must be 0 or greater';
    }

    const minAlert = parseInt(formData.minimumStockAlert);
    if (isNaN(minAlert) || minAlert < 0) {
      errors.minimumStockAlert = 'Minimum stock alert level must be 0 or greater';
    }

    return errors;
  }
}

export const inventoryService = new InventoryService();
