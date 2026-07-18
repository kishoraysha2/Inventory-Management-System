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
