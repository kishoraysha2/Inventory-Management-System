import { jsPDF } from 'jspdf';
import reshaper from 'arabic-persian-reshaper';
import { CAIRO_FONT_BASE64 } from './cairoFontBase64';
import { CurrencyFormattingService, CurrencyConfig } from './currencyFormatter';
import { formatAmountInWords } from './amountInWords';

let cairoRegisteredMap = new WeakMap<jsPDF, boolean>();

/**
 * Applies production-grade Cairo TTF font (Unicode + Arabic + English + Numbers + SAR)
 * to a jsPDF instance. Returns the active font family name.
 */
export function applyEnterprisePdfFont(doc: jsPDF): string {
  try {
    if (CAIRO_FONT_BASE64) {
      if (!cairoRegisteredMap.has(doc)) {
        doc.addFileToVFS('Cairo-Regular.ttf', CAIRO_FONT_BASE64);
        doc.addFont('Cairo-Regular.ttf', 'Cairo', 'normal');
        doc.addFont('Cairo-Regular.ttf', 'Cairo', 'bold');
        doc.addFont('Cairo-Regular.ttf', 'Cairo', 'italic');
        doc.addFont('Cairo-Regular.ttf', 'Cairo', 'bolditalic');
        cairoRegisteredMap.set(doc, true);
      }
      doc.setFont('Cairo', 'normal');

      // Ensure U+20C1 codeMap points to official Saudi Riyal symbol glyph
      const internal = (doc as any).internal;
      if (internal && internal.getFont) {
        const font = internal.getFont();
        if (font && font.metadata && font.metadata.cmap && font.metadata.cmap.unicode) {
          const codeMap = font.metadata.cmap.unicode.codeMap;
          if (codeMap && !codeMap[0x20C1] && codeMap[0xFDFC]) {
            codeMap[0x20C1] = codeMap[0xFDFC];
          }
        }
      }

      return 'Cairo';
    }
  } catch (e) {
    console.warn('Failed to register Cairo font in jsPDF, falling back to standard font:', e);
  }
  doc.setFont('helvetica', 'normal');
  return 'helvetica';
}

/**
 * Sets font style cleanly while preserving Unicode Cairo capability if registered.
 */
export function setPdfFont(doc: jsPDF, style: 'normal' | 'bold' | 'italic' | 'bolditalic' | 'oblique' = 'normal'): void {
  const fontStyle = style === 'oblique' ? 'italic' : style;
  if (cairoRegisteredMap.has(doc)) {
    doc.setFont('Cairo', fontStyle);
    const internal = (doc as any).internal;
    if (internal && internal.getFont) {
      const font = internal.getFont();
      if (font && font.metadata && font.metadata.cmap && font.metadata.cmap.unicode) {
        const codeMap = font.metadata.cmap.unicode.codeMap;
        if (codeMap && !codeMap[0x20C1] && codeMap[0xFDFC]) {
          codeMap[0x20C1] = codeMap[0xFDFC];
        }
      }
    }
  } else {
    doc.setFont('helvetica', style);
  }
}

/**
 * Formats and reshapes text for jsPDF rendering, ensuring Arabic letters,
 * SAR symbols, and numbers render connected and correctly without corrupting.
 */
export function formatPdfText(text: string | null | undefined): string {
  if (text === null || text === undefined) return '';
  let str = String(text);
  if (!str) return '';
  
  try {
    // Reshape Arabic text if present (including Presentation Forms A/B)
    if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(str)) {
      let reshaped = reshaper.ArabicShaper.convertArabic(str);
      // Map isolated form code points U+FEAD and U+FEB1 back to standard font-supported characters U+0631 (ر) and U+0633 (س)
      reshaped = reshaped.replace(/\uFEAD/g, '\u0631').replace(/\uFEB1/g, '\u0633');
      return reshaped;
    }
  } catch (e) {
    // Fallback to raw string
  }
  return str;
}

/**
 * Formats currency values specifically for PDF output, consuming the
 * canonical CurrencyFormattingService SSOT pipeline.
 */
export function formatPdfCurrency(
  value: number | string | null | undefined,
  configOverride?: CurrencyConfig
): string {
  return CurrencyFormattingService.formatForPdf(value, configOverride);
}

/**
 * Safe string resolver for jsPDF text calls.
 */
export function safePdfString(val: any, fallback: string = ''): string {
  if (val === null || val === undefined) return fallback;
  const str = String(val);
  return formatPdfText(str);
}

export { formatAmountInWords };

