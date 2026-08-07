import { UnitConversion } from '../types';

/**
 * Converts a quantity using a conversion factor and direction.
 * By default, 1 Alternate Unit = conversionFactor Base Units (multiply direction).
 * 
 * @param quantity The quantity to convert
 * @param conversionFactor The factor ratio
 * @param direction 'multiply' or 'divide' (default: 'multiply')
 */
export function convertQuantity(
  quantity: number | string | undefined | null,
  conversionFactor: number | string | undefined | null,
  direction: 'multiply' | 'divide' = 'multiply'
): number {
  const qty = typeof quantity === 'number' ? quantity : parseFloat(String(quantity ?? 0)) || 0;
  const factor = typeof conversionFactor === 'number' ? conversionFactor : parseFloat(String(conversionFactor ?? 1)) || 1;

  if (factor <= 0) return qty;

  if (direction === 'divide') {
    return qty / factor;
  }
  return qty * factor;
}

/**
 * Converts an alternate unit quantity into its equivalent base unit quantity.
 * Example: 2 Bags (where 1 Bag = 50 KG) => 2 * 50 = 100 KG
 */
export function convertToBase(
  alternateQuantity: number | string | undefined | null,
  conversionFactor: number | string | undefined | null,
  direction: 'multiply' | 'divide' = 'multiply'
): number {
  return convertQuantity(alternateQuantity, conversionFactor, direction);
}

/**
 * Converts a base unit quantity into its equivalent alternate unit quantity.
 * Example: 100 KG (where 1 Bag = 50 KG) => 100 / 50 = 2 Bags
 */
export function convertFromBase(
  baseQuantity: number | string | undefined | null,
  conversionFactor: number | string | undefined | null,
  direction: 'multiply' | 'divide' = 'multiply'
): number {
  const reverseDirection = direction === 'multiply' ? 'divide' : 'multiply';
  return convertQuantity(baseQuantity, conversionFactor, reverseDirection);
}

/**
 * Formats a conversion rule into a human-readable text string.
 * Example: "1 CTN = 24 PCS" or "1 Bag = 50 KG"
 */
export function formatConversionText(conversion: Partial<UnitConversion>): string {
  const alt = conversion.alternateUnitCode || 'ALT';
  const factor = conversion.conversionFactor ?? 1;
  const base = conversion.baseUnitCode || 'BASE';
  
  if (conversion.direction === 'divide') {
    return `1 ${base} = ${factor} ${alt}`;
  }
  return `1 ${alt} = ${factor} ${base}`;
}

/**
 * Formats a conversion summary string from components.
 */
export function formatConversionSummary(
  alternateUnitCode: string,
  conversionFactor: number,
  baseUnitCode: string,
  direction: 'multiply' | 'divide' = 'multiply'
): string {
  if (direction === 'divide') {
    return `1 ${baseUnitCode} = ${conversionFactor} ${alternateUnitCode}`;
  }
  return `1 ${alternateUnitCode} = ${conversionFactor} ${baseUnitCode}`;
}
