/**
 * Centralized Enterprise Currency Formatting Utility for NEXUS ERP
 * 
 * Single Source of Truth (SSOT) for all currency formatting across
 * both React UI DOM and PDF Export engines.
 */

import reshaper from 'arabic-persian-reshaper';

export interface CurrencyConfig {
  country?: string;
  currencyName?: string;
  currencyCode?: string;
  currencySymbol?: string;
  currencyPosition?: 'Before' | 'After' | string;
  decimalPrecision?: number | string;
  thousandsSeparator?: string;
  decimalSeparator?: string;
}

const DEFAULT_CONFIG: Required<CurrencyConfig> = {
  country: 'United States (USA)',
  currencyName: 'US Dollar',
  currencyCode: 'USD',
  currencySymbol: '$',
  currencyPosition: 'Before',
  decimalPrecision: 2,
  thousandsSeparator: ',',
  decimalSeparator: '.',
};

/**
 * Enterprise Single Source of Truth (SSOT) Currency Formatting Service.
 * Centralizes all formatting, symbol placement, precision, separators,
 * and PDF Unicode/Arabic compatibility.
 */
export class CurrencyFormattingService {
  /**
   * Resolves current configuration (Override -> Global -> LocalStorage -> Fallback).
   */
  public static resolveConfig(configOverride?: CurrencyConfig): CurrencyConfig {
    let config: CurrencyConfig = {};
    if (configOverride) {
      config = { ...configOverride };
    } else if (typeof window !== 'undefined' && (window as any).__company_profile__) {
      config = { ...(window as any).__company_profile__ };
    } else {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('invoice_company_profile') : null;
      if (saved) {
        try {
          config = JSON.parse(saved);
        } catch (e) {
          // Fallback
        }
      }
    }

    return config;
  }

  /**
   * Formats a numeric or string amount into localized UI currency.
   */
  public static format(
    value: number | string | null | undefined,
    configOverride?: CurrencyConfig
  ): string {
    // 1. Resolve numeric amount
    let amount = 0;
    if (value !== null && value !== undefined) {
      if (typeof value === 'number') {
        amount = value;
      } else {
        amount = parseFloat(value);
        if (isNaN(amount)) {
          amount = 0;
        }
      }
    }

    // 2. Resolve formatting configuration
    const config = this.resolveConfig(configOverride);

    const symbol = config.currencySymbol ?? DEFAULT_CONFIG.currencySymbol;
    const position = config.currencyPosition ?? DEFAULT_CONFIG.currencyPosition;
    
    // Parse precision safely
    let precision = 2;
    if (config.decimalPrecision !== undefined && config.decimalPrecision !== null) {
      precision = typeof config.decimalPrecision === 'number'
        ? config.decimalPrecision
        : parseInt(config.decimalPrecision, 10);
    } else {
      precision = typeof DEFAULT_CONFIG.decimalPrecision === 'number'
        ? DEFAULT_CONFIG.decimalPrecision
        : parseInt(DEFAULT_CONFIG.decimalPrecision, 10);
    }
    const safePrecision = [0, 2, 3, 4].includes(precision) ? precision : 2;

    // Separators
    let thousandsSep = config.thousandsSeparator ?? DEFAULT_CONFIG.thousandsSeparator;
    if (thousandsSep === 'None') {
      thousandsSep = '';
    }
    const decimalSep = config.decimalSeparator ?? DEFAULT_CONFIG.decimalSeparator;

    // 3. Perform formatting
    const isNegative = amount < 0;
    const absAmount = Math.abs(amount);

    const fixedString = absAmount.toFixed(safePrecision);
    const parts = fixedString.split('.');
    let integerPart = parts[0];
    const decimalPart = parts[1] || '';

    if (thousandsSep !== '') {
      integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSep);
    }

    let formattedNumber = integerPart;
    if (safePrecision > 0 && decimalPart) {
      formattedNumber += decimalSep + decimalPart;
    }

    if (isNegative) {
      formattedNumber = '-' + formattedNumber;
    }

    if (position === 'Before') {
      return `${symbol}${formattedNumber}`;
    } else {
      return `${formattedNumber} ${symbol}`;
    }
  }

  /**
   * Formats currency specifically for PDF rendering, reshaping Arabic and normalizing Unicode.
   */
  public static formatForPdf(
    value: number | string | null | undefined,
    configOverride?: CurrencyConfig
  ): string {
    const formatted = this.format(value, configOverride);
    if (!formatted) return '';

    let str = String(formatted);
    try {
      // Reshape Arabic text if present
      if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(str)) {
        let reshaped = reshaper.ArabicShaper.convertArabic(str);
        // Map isolated forms back to standard font characters
        reshaped = reshaped.replace(/\uFEAD/g, '\u0631').replace(/\uFEB1/g, '\u0633');
        return reshaped;
      }
    } catch (e) {
      // Fallback to formatted string
    }
    return str;
  }

  /**
   * Setup/update global company profile configuration dynamically.
   */
  public static setGlobalCompanyProfile(profile: any): void {
    if (typeof window !== 'undefined') {
      (window as any).__company_profile__ = profile;
    }
  }

  /**
   * Gets the current active currency symbol.
   */
  public static getCurrencySymbol(configOverride?: CurrencyConfig): string {
    const config = this.resolveConfig(configOverride);
    return config.currencySymbol ?? DEFAULT_CONFIG.currencySymbol;
  }

  /**
   * Gets the current active currency ISO code.
   */
  public static getCurrencyCode(configOverride?: CurrencyConfig): string {
    const config = this.resolveConfig(configOverride);
    return config.currencyCode ?? DEFAULT_CONFIG.currencyCode;
  }
}

/**
 * Top-level canonical functions for full backward compatibility across existing callsites.
 */
export function formatCurrency(
  value: number | string | null | undefined,
  configOverride?: CurrencyConfig
): string {
  return CurrencyFormattingService.format(value, configOverride);
}

export function formatPdfCurrency(
  value: number | string | null | undefined,
  configOverride?: CurrencyConfig
): string {
  return CurrencyFormattingService.formatForPdf(value, configOverride);
}

export function setGlobalCompanyProfile(profile: any): void {
  CurrencyFormattingService.setGlobalCompanyProfile(profile);
}

export function getCurrencySymbol(configOverride?: CurrencyConfig): string {
  return CurrencyFormattingService.getCurrencySymbol(configOverride);
}

export function getCurrencyCode(configOverride?: CurrencyConfig): string {
  return CurrencyFormattingService.getCurrencyCode(configOverride);
}

