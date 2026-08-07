/**
 * Enterprise Offline Translation Dictionary
 * Contains predefined English-to-Arabic mappings for common retail, ERP, and product terms.
 * Keys are stored in lowercase for fast, case-insensitive matching.
 */

export const OFFLINE_TRANSLATION_DICTIONARY: Record<string, string> = {
  "bag": "كيس",
  "bank": "بنك",
  "battery": "بطارية",
  "balance": "رصيد",
  "bottle": "قارورة",
  "box": "صندوق",
  "bread": "خبز",
  "cable": "كابل",
  "card": "بطاقة",
  "carton": "كرتون",
  "cash": "نقداً",
  "centimeter": "سنتيمتر",
  "chair": "كرسي",
  "chicken": "دجاج",
  "cleaning": "تنظيف",
  "coffee": "قهوة",
  "company": "شركة",
  "customer": "عميل",
  "detergent": "منظف",
  "discount": "خصم",
  "due": "مستحق",
  "egg": "بيض",
  "electrical": "كهرباء",
  "fish": "سمك",
  "flour": "دقيق",
  "food": "طعام",
  "general": "عام",
  "gram": "جرام",
  "grocery": "بقالة",
  "hardware": "خردوات",
  "invoice": "فاتورة",
  "keyboard": "لوحة مفاتيح",
  "kilogram": "كيلو جرام",
  "laptop": "حاسوب محمول",
  "liter": "لتر",
  "meat": "لحم",
  "medicine": "دواء",
  "meter": "متر",
  "milk": "حليب",
  "milliliter": "ملليلتر",
  "monitor": "شاشة",
  "mouse": "فأرة",
  "notebook": "دفتر",
  "oil": "زيت",
  "pack": "عبوة",
  "packet": "باكيت",
  "paid": "مدفوع",
  "paper": "ورق",
  "pen": "قلم",
  "pencil": "قلم رصاص",
  "pharmacy": "صيدلية",
  "phone": "هاتف",
  "piece": "قطعة",
  "price": "سعر",
  "printer": "طابعة",
  "purchase": "شراء",
  "quantity": "كمية",
  "rice": "أرز",
  "sale": "بيع",
  "salt": "ملح",
  "shampoo": "شامبو",
  "soap": "صابون",
  "stock": "مخزون",
  "sugar": "سكر",
  "supplier": "مورد",
  "table": "طاولة",
  "tax": "ضريبة",
  "tea": "شاي",
  "toothpaste": "معجون أسنان",
  "unit": "وحدة",
  "vat": "ضريبة القيمة المضافة",
  "warehouse": "مستودع",
  "water": "ماء"
};

/**
 * Helper function to lookup a term in the offline dictionary.
 * Performs trimming and case-insensitive matching.
 */
export function lookupOfflineTranslation(text: string): string | null {
  if (!text) return null;
  const key = text.trim().toLowerCase();
  return OFFLINE_TRANSLATION_DICTIONARY[key] || null;
}

/**
 * Translates an English phrase or product name to Arabic using the offline dictionary.
 * Follows a 3-step pipeline:
 * 1. Normalize (trim, collapse whitespace)
 * 2. Exact match lookup
 * 3. Token-based word search (replacing recognized dictionary words while preserving unknown tokens)
 */
export function translatePhraseOffline(text: string): {
  success: boolean;
  translatedText?: string;
  message: string;
} {
  if (!text || !text.trim()) {
    return {
      success: false,
      message: 'No text provided for translation.'
    };
  }

  // STEP 1: Normalize
  const rawTrimmed = text.trim();
  const normalized = rawTrimmed.replace(/\s+/g, ' ').toLowerCase();

  // STEP 2: Try Exact Match
  const exactMatch = OFFLINE_TRANSLATION_DICTIONARY[normalized];
  if (exactMatch) {
    return {
      success: true,
      translatedText: exactMatch,
      message: 'Translation completed using offline dictionary.'
    };
  }

  // STEP 3: Token Based Search
  const originalTokens = rawTrimmed.split(/\s+/);
  let translatedCount = 0;

  const resultTokens = originalTokens.map((token) => {
    // Strip trailing/leading common punctuation if present for dictionary lookup
    const cleanToken = token.replace(/^[^\w]+|[^\w]+$/g, '').toLowerCase();
    const tokenMatch = OFFLINE_TRANSLATION_DICTIONARY[cleanToken || token.toLowerCase()];

    if (tokenMatch) {
      translatedCount++;
      if (cleanToken && cleanToken !== token.toLowerCase()) {
        return token.toLowerCase().replace(cleanToken, tokenMatch);
      }
      return tokenMatch;
    }

    return token;
  });

  if (translatedCount > 0) {
    return {
      success: true,
      translatedText: resultTokens.join(' '),
      message: 'Translation completed using offline dictionary.'
    };
  }

  return {
    success: false,
    message: 'Translation not found in offline dictionary.'
  };
}
