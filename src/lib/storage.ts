import type { AppSettings, FamilyStatus, GrantInfo, PlanType, StockOrigin } from './types';

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

// ---------------------------------------------------------------------------
// Grants (Microsoft StockExport reconciliation data)
// ---------------------------------------------------------------------------

/**
 * Versioned persistence for grant metadata imported from Microsoft StockExport.
 * Stored separately from AppSettings to keep the two schemas decoupled.
 * Contains only hashed IDs and non-nominative fields — no PII.
 */
export const GRANTS_STORAGE_KEY = 'stockExportGrants';
const GRANTS_VERSION = 1;

const VALID_PLAN_TYPES_ALL: readonly PlanType[] = ['qualified_macron', 'qualified_pre_macron', 'non_qualified'];
const VALID_ORIGINS: readonly StockOrigin[] = ['SP', 'DO', 'FM', 'FQ'];

export function saveGrants(grants: GrantInfo[]): boolean {
  const payload = {
    version: GRANTS_VERSION,
    data: grants.map((g) => ({
      grantIdHash: g.grantIdHash,
      awardType: g.awardType,
      awardDate: g.awardDate.toISOString(),
      planType: g.planType,
      origin: g.origin,
      vestSchedule: g.vestSchedule.map((v) => ({ date: v.date.toISOString(), shares: v.shares })),
      totalAwarded: g.totalAwarded,
      totalVested: g.totalVested,
      totalUnvested: g.totalUnvested,
    })),
  };
  return safeSetItem(GRANTS_STORAGE_KEY, JSON.stringify(payload));
}

export function loadGrants(): GrantInfo[] {
  try {
    const raw = localStorage.getItem(GRANTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return [];

    // Currently a single version; validation only
    const arr = Array.isArray(parsed.data) ? parsed.data : [];
    const out: GrantInfo[] = [];
    for (const item of arr) {
      const g = validateGrant(item);
      if (g) out.push(g);
    }
    return out;
  } catch {
    return [];
  }
}

export function clearGrants(): void {
  try {
    localStorage.removeItem(GRANTS_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function validateGrant(raw: unknown): GrantInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const grantIdHash = typeof obj.grantIdHash === 'string' ? obj.grantIdHash : null;
  const awardType = typeof obj.awardType === 'string' ? obj.awardType : null;
  const awardDate = typeof obj.awardDate === 'string' ? new Date(obj.awardDate) : null;
  const planType = VALID_PLAN_TYPES_ALL.includes(obj.planType as PlanType) ? (obj.planType as PlanType) : null;
  const origin = VALID_ORIGINS.includes(obj.origin as StockOrigin) ? (obj.origin as StockOrigin) : null;

  if (!grantIdHash || !awardType || !awardDate || !planType || !origin) return null;
  if (isNaN(awardDate.getTime())) return null;

  const vestRaw = Array.isArray(obj.vestSchedule) ? obj.vestSchedule : [];
  const vestSchedule = vestRaw
    .map((v) => {
      if (!v || typeof v !== 'object') return null;
      const vo = v as Record<string, unknown>;
      const date = typeof vo.date === 'string' ? new Date(vo.date) : null;
      const shares = typeof vo.shares === 'number' ? vo.shares : NaN;
      if (!date || isNaN(date.getTime()) || !Number.isFinite(shares) || shares <= 0) return null;
      return { date, shares };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  return {
    grantIdHash,
    awardType,
    awardDate,
    planType,
    origin,
    vestSchedule,
    totalAwarded: isNonNegativeNumber(obj.totalAwarded) ? (obj.totalAwarded as number) : 0,
    totalVested: isNonNegativeNumber(obj.totalVested) ? (obj.totalVested as number) : 0,
    totalUnvested: isNonNegativeNumber(obj.totalUnvested) ? (obj.totalUnvested as number) : 0,
  };
}
