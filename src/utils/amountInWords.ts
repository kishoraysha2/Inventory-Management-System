import { CurrencyConfig } from './currencyFormatter';

/**
 * Enterprise Amount in Words Converter for NEXUS ERP
 * Automatically resolves Major and Minor currency units based on Company Profile
 * (e.g., SAR -> Saudi Riyals & Halalas, USD -> US Dollars & Cents, BDT -> Taka & Paisa, etc.)
 */
export function formatAmountInWords(
  num: number,
  configOverride?: CurrencyConfig
): string {
  if (isNaN(num) || num === null || num === undefined) {
    num = 0;
  }

  // 1. Resolve configuration (Override -> Global -> LocalStorage -> Default)
  let config: CurrencyConfig = {};
  if (configOverride) {
    config = configOverride;
  } else if (typeof window !== 'undefined' && (window as any).__company_profile__) {
    config = (window as any).__company_profile__;
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

  const code = (config.currencyCode || 'SAR').toUpperCase();
  const name = (config.currencyName || '').toLowerCase();

  let majorSingle = 'Saudi Riyal';
  let majorPlural = 'Saudi Riyals';
  let minorSingle = 'Halala';
  let minorPlural = 'Halalas';

  if (code === 'SAR' || name.includes('riyal') || name.includes('saudi')) {
    majorSingle = 'Saudi Riyal';
    majorPlural = 'Saudi Riyals';
    minorSingle = 'Halala';
    minorPlural = 'Halalas';
  } else if (code === 'USD' || name.includes('dollar')) {
    majorSingle = 'US Dollar';
    majorPlural = 'US Dollars';
    minorSingle = 'Cent';
    minorPlural = 'Cents';
  } else if (code === 'BDT' || name.includes('taka')) {
    majorSingle = 'Taka';
    majorPlural = 'Taka';
    minorSingle = 'Paisa';
    minorPlural = 'Paisa';
  } else if (code === 'AED' || name.includes('dirham')) {
    majorSingle = 'UAE Dirham';
    majorPlural = 'UAE Dirhams';
    minorSingle = 'Fil';
    minorPlural = 'Fils';
  } else if (code === 'GBP' || name.includes('pound')) {
    majorSingle = 'Pound';
    majorPlural = 'Pounds';
    minorSingle = 'Penny';
    minorPlural = 'Pence';
  } else if (code === 'EUR' || name.includes('euro')) {
    majorSingle = 'Euro';
    majorPlural = 'Euros';
    minorSingle = 'Cent';
    minorPlural = 'Cents';
  } else if (code === 'INR' || name.includes('rupee')) {
    majorSingle = 'Rupee';
    majorPlural = 'Rupees';
    minorSingle = 'Paisa';
    minorPlural = 'Paisa';
  } else if (code === 'QAR') {
    majorSingle = 'Qatari Riyal';
    majorPlural = 'Qatari Riyals';
    minorSingle = 'Dirham';
    minorPlural = 'Dirhams';
  } else if (code === 'KWD') {
    majorSingle = 'Kuwaiti Dinar';
    majorPlural = 'Kuwaiti Dinars';
    minorSingle = 'Fil';
    minorPlural = 'Fils';
  } else if (code === 'MYR') {
    majorSingle = 'Ringgit';
    majorPlural = 'Ringgit';
    minorSingle = 'Sen';
    minorPlural = 'Sen';
  } else if (code === 'SGD') {
    majorSingle = 'Singapore Dollar';
    majorPlural = 'Singapore Dollars';
    minorSingle = 'Cent';
    minorPlural = 'Cents';
  } else if (config.currencyName) {
    majorSingle = config.currencyName;
    majorPlural = `${config.currencyName}s`;
  }

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertLessThanOneThousand = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return ones[n] + ' ';
    if (n < 100) return tens[Math.floor(n / 10)] + ' ' + (ones[n % 10] ? ones[n % 10] + ' ' : '');
    return ones[Math.floor(n / 100)] + ' Hundred ' + convertLessThanOneThousand(n % 100);
  };

  const convert = (n: number): string => {
    if (n === 0) return '';
    if (n < 1000) return convertLessThanOneThousand(n);
    if (n < 1000000) return convert(Math.floor(n / 1000)) + 'Thousand ' + convertLessThanOneThousand(n % 1000);
    if (n < 1000000000) return convert(Math.floor(n / 1000000)) + 'Million ' + convert(n % 1000000);
    return convert(Math.floor(n / 1000000000)) + 'Billion ' + convert(n % 1000000000);
  };

  const absVal = Math.abs(num);
  const cleanNum = Math.floor(absVal);
  const cents = Math.round((absVal - cleanNum) * 100);

  const majorName = cleanNum === 1 ? majorSingle : majorPlural;
  const minorName = cents === 1 ? minorSingle : minorPlural;

  if (absVal === 0) return `Zero ${majorPlural} Only`;

  let result = convert(cleanNum).trim();
  if (result) {
    result += ` ${majorName}`;
  } else {
    result = `Zero ${majorPlural}`;
  }

  if (cents > 0) {
    const centsText = convert(cents).trim();
    result += ` and ${centsText || cents} ${minorName}`;
  }

  result += ' Only';
  return result;
}
