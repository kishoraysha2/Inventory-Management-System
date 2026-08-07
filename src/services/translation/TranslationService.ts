/**
 * Enterprise Translation Service Architecture (Phase 3 Hybrid Translation Framework)
 * Provides standard async contract for multi-lingual translation engines.
 * 
 * Note: Current version provides strict placeholder contract. Future engines
 * can plug into this service seamlessly without changing UI management components.
 */

import { lookupOfflineTranslation, translatePhraseOffline } from './offlineDictionary';

export interface TranslationResult {
  success: boolean;
  translatedText?: string;
  message: string;
}

export class TranslationService {
  /**
   * Checks if an active automated translation engine is installed/enabled.
   */
  public static isTranslationAvailable(): boolean {
    return true;
  }

  /**
   * Asynchronously translates given English text to Arabic using the local offline dictionary with token search.
   */
  public static async translateToArabic(text: string): Promise<TranslationResult> {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      return {
        success: false,
        message: 'No text provided for translation.'
      };
    }

    return translatePhraseOffline(trimmed);
  }

  /**
   * Asynchronously translates given Arabic text to English.
   */
  public static async translateToEnglish(text: string): Promise<TranslationResult> {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      return {
        success: false,
        message: 'No text provided for translation.'
      };
    }

    return {
      success: false,
      message: 'English Translation Engine will be available in a future update.'
    };
  }
}

