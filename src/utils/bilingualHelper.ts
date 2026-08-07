/**
 * Helper utility for Enterprise English + Arabic bilingual display formatting.
 * Strictly pure string manipulation with zero side effects or framework dependencies.
 */

export function getDisplayName(
  englishName?: string,
  arabicName?: string,
  showArabic: boolean = false
): string {
  const eng = (englishName || '').trim();
  const ara = (arabicName || '').trim();

  if (!showArabic || !ara) {
    return eng;
  }

  if (!eng) {
    return ara;
  }

  return `${eng}\n${ara}`;
}
