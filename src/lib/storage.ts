import type { AppSettings, FamilyStatus } from './types';

/**
 * Current version of the localStorage data schema.
 * Increment this when breaking changes are made to the persisted data structures.
 */
const CURRENT_VERSION = 2;

interface VersionedData<T> {
  version: number;
  data: T;
}

const VALID_FAMILY_STATUSES: FamilyStatus[] = ['single', 'couple'];
const VALID_PLAN_TYPES = ['qualified_macron', 'non_qualified'] as const;

/**
 * Validate and sanitize AppSettings loaded from localStorage.
 * Returns a valid AppSettings object, falling back to defaults for invalid fields.
 */
export function validateSettings(raw: unknown, defaults: AppSettings): AppSettings {
  if (!raw || typeof raw !== 'object') return defaults;
  const obj = raw as Record<string, unknown>;

  return {
    familyStatus: VALID_FAMILY_STATUSES.includes(obj.familyStatus as FamilyStatus)
      ? obj.familyStatus as FamilyStatus
      : defaults.familyStatus,
    numberOfChildren: isNonNegativeInt(obj.numberOfChildren) ? obj.numberOfChildren as number : defaults.numberOfChildren,
    taxShares: isPositiveNumber(obj.taxShares) ? obj.taxShares as number : defaults.taxShares,
    taxSharesManual: typeof obj.taxSharesManual === 'boolean' ? obj.taxSharesManual : defaults.taxSharesManual,
    otherTaxableIncome: isNonNegativeNumber(obj.otherTaxableIncome) ? obj.otherTaxableIncome as number : defaults.otherTaxableIncome,
    defaultPlanType: VALID_PLAN_TYPES.includes(obj.defaultPlanType as typeof VALID_PLAN_TYPES[number])
      ? obj.defaultPlanType as 'qualified_macron' | 'non_qualified'
      : defaults.defaultPlanType,
    priorLosses: isNonNegativeNumber(obj.priorLosses) ? obj.priorLosses as number : defaults.priorLosses,
  };
}

/**
 * Load versioned data from localStorage.
 * Handles migration from unversioned (legacy) data to versioned format.
 */
export function loadVersionedSettings(key: string, defaults: AppSettings): AppSettings {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaults;

    const parsed = JSON.parse(raw);

    // Check if this is versioned data
    if (parsed && typeof parsed === 'object' && typeof parsed.version === 'number') {
      const versioned = parsed as VersionedData<unknown>;
      return migrateSettings(versioned.data, versioned.version, defaults);
    }

    // Legacy unversioned data — treat as version 0
    return migrateSettings(parsed, 0, defaults);
  } catch {
    return defaults;
  }
}

/**
 * Save settings with version metadata.
 */
export function saveVersionedSettings(key: string, settings: AppSettings): boolean {
  const versioned: VersionedData<AppSettings> = {
    version: CURRENT_VERSION,
    data: settings,
  };
  return safeSetItem(key, JSON.stringify(versioned));
}

/**
 * Migrate data from any version to current.
 */
function migrateSettings(data: unknown, _fromVersion: number, defaults: AppSettings): AppSettings {
  // All versions: validate, strip removed fields (e.g. fiscalYear from v1)
  return validateSettings(data, defaults);
}

// ---- Type guards ----

function isNonNegativeInt(val: unknown): val is number {
  return typeof val === 'number' && Number.isInteger(val) && val >= 0;
}

function isNonNegativeNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0;
}

function isPositiveNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val > 0;
}

/**
 * Safely write to localStorage, catching QuotaExceededError.
 * Returns true on success, false on failure.
 */
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded for key:', key);
    }
    return false;
  }
}
