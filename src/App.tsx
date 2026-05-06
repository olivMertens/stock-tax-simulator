import React from 'react';
import { Briefcase, Calculator, FileText, Settings as SettingsIcon, Database, AlertTriangle, RefreshCw, Loader2, Check, Upload, BookOpen } from 'lucide-react';
import { TaxRulesPanel } from './components/TaxRulesPanel';
import { SoldLotsTable } from './components/SoldLotsTable';
import { SaleSimulator } from './components/SaleSimulator';
import { TaxCalculator } from './components/TaxCalculator';
import { DeclarationGuide } from './components/DeclarationGuide';
import { PfuVsBaremeComparator } from './components/PfuVsBaremeComparator';
import { Dialog, DialogHeader, DialogFooter } from './components/ui/dialog';
import { runSimulation } from './lib/tax-engine';
import { loadVersionedSettings, safeSetItem, saveVersionedSettings, loadGrants, loadDividends, saveDividends, clearDividends } from './lib/storage';
import { reconcileLots, reconcileSoldLots } from './lib/stockexport-reconciliation';
import { applyBulkChoiceToLots, applyBulkChoiceToSoldLots, countEligible, type BulkQualifyChoice } from './lib/bulk-qualify';
import type { ImportResult } from './lib/backup';
import type { StockLot, SoldLot, SaleLotEntry, AppSettings, TaxSimulationResult, TaxMode, SavedSimulation, GrantInfo, Broker } from './lib/types';
import type { DividendEvent, CashInterestEvent } from './lib/transaction-parser';
import { DividendsDeclaration } from './components/DividendsDeclaration';
import { BulkQualifyPanel } from './components/BulkQualifyPanel';
import { generateId, mergeByBroker } from './lib/utils';

// Lazy-load heavy components (pdfjs-dist via Settings, recharts via Portfolio)
const Portfolio = React.lazy(() =>
  import('./components/Portfolio').then((m) => ({ default: m.Portfolio }))
);
const Settings = React.lazy(() =>
  import('./components/Settings').then((m) => ({ default: m.Settings }))
);
const DataPanel = React.lazy(() =>
  import('./components/DataPanel').then((m) => ({ default: m.DataPanel }))
);

function LazyFallback() {
  return (
    <div className="flex items-center justify-center py-12 text-gray-400">
      <Loader2 className="h-6 w-6 animate-spin mr-2" />
      Chargement…
    </div>
  );
}

const DEFAULT_SETTINGS: AppSettings = {
  familyStatus: 'single',
  numberOfChildren: 0,
  taxShares: 1,
  taxSharesManual: false,
  otherTaxableIncome: 0,
  defaultPlanType: 'qualified_macron',
  priorLosses: 0,
};

type Tab = 'portfolio' | 'simulator' | 'declaration' | 'data' | 'settings';
const TAB_STORAGE_KEY = 'activeTab';
const VALID_TABS: readonly Tab[] = ['portfolio', 'simulator', 'declaration', 'data', 'settings'] as const;

function loadPersistedTab(): Tab | null {
  try {
    const saved = localStorage.getItem(TAB_STORAGE_KEY);
    return saved && (VALID_TABS as readonly string[]).includes(saved) ? saved as Tab : null;
  } catch {
    return null;
  }
}

function isSettingsConfigured(s: AppSettings, defaults: AppSettings): boolean {
  return s.otherTaxableIncome !== defaults.otherTaxableIncome
    || s.taxShares !== defaults.taxShares
    || s.familyStatus !== defaults.familyStatus
    || s.numberOfChildren !== defaults.numberOfChildren;
}

function soldLotsToSaleEntries(soldLots: SoldLot[]): SaleLotEntry[] {
  return soldLots.map((sl) => {
    const costBasisPerShare = sl.quantity > 0 ? sl.costBasis / sl.quantity : 0;
    const salePricePerShare = sl.quantity > 0 ? sl.proceeds / sl.quantity : 0;
    const syntheticLot: StockLot = {
      id: sl.id,
      broker: sl.broker,
      acquisitionDate: sl.acquisitionDate,
      quantity: sl.quantity,
      costBasisPerShare,
      totalCostBasis: sl.costBasis,
      currentValue: sl.proceeds,
      unrealizedGainLoss: sl.gainLoss,
      origin: sl.origin,
      holdingPeriod: sl.holdingPeriod,
      planType: sl.planType,
      importCurrency: sl.importCurrency,
      esppFmvPerShare: sl.origin === 'SP' ? costBasisPerShare / 0.90 : undefined,
    };
    return {
      lot: syntheticLot,
      quantitySold: sl.quantity,
      salePricePerShare,
      saleDate: sl.saleDate,
    };
  });
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-lg w-full text-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
            <h2 className="text-lg font-bold text-gray-900">Une erreur est survenue</h2>
            <p className="text-sm text-gray-600">
              L'application a rencontré un problème inattendu. Vos données sont sauvegardées dans le navigateur.
            </p>
            <pre className="text-xs text-left bg-red-50 text-red-700 p-3 rounded-lg overflow-auto max-h-32">
              {this.state.error?.message}
            </pre>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Recharger l'application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Extract distinct sale years from sold lots. */
function getSaleYears(soldLots: SoldLot[]): number[] {
  const years = [...new Set(soldLots.map((sl) => sl.saleDate.getFullYear()))].sort((a, b) => b - a);
  return years;
}

function App() {
  const [activeTab, setActiveTab] = React.useState<Tab>(() => {
    const persisted = loadPersistedTab();
    if (persisted) return persisted;
    const saved = loadVersionedSettings('appSettings', DEFAULT_SETTINGS);
    return isSettingsConfigured(saved, DEFAULT_SETTINGS) ? 'portfolio' : 'settings';
  });

  // Persist active tab across reloads
  React.useEffect(() => {
    safeSetItem(TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);
  const [lots, setLots] = React.useState<StockLot[]>([]);
  const [soldLots, setSoldLots] = React.useState<SoldLot[]>([]);
  // Declaration workflow state (tab "Ma déclaration"): driven by imported soldLots.
  const [saleYear, setSaleYear] = React.useState<number | null>(null);
  const [declEntries, setDeclEntries] = React.useState<SaleLotEntry[]>([]);
  const [declTaxMode, setDeclTaxMode] = React.useState<TaxMode>('pfu');
  const [declResult, setDeclResult] = React.useState<TaxSimulationResult | null>(null);
  // Simulation workflow state (tab "Simuler"): driven by current portfolio lots.
  const [simEntries, setSimEntries] = React.useState<SaleLotEntry[]>([]);
  const [simTaxMode, setSimTaxMode] = React.useState<TaxMode>('pfu');
  const [simResult, setSimResult] = React.useState<TaxSimulationResult | null>(null);
  // Ref + flash state used to scroll the tax-result block into view and briefly
  // highlight it when the user clicks "Simuler la vente" — otherwise the result
  // appears far below the fold and the click looks like a no-op.
  const simResultRef = React.useRef<HTMLDivElement | null>(null);
  const [simResultFlash, setSimResultFlash] = React.useState(false);
  // Set to true when the user mutates the lot selection in SaleSimulator
  // after a simulation has already been computed; rendered as a discreet
  // "relancer la simulation" hint on the result card.
  const [simStale, setSimStale] = React.useState(false);
  const [settings, setSettings] = React.useState<AppSettings>(() => {
    return loadVersionedSettings('appSettings', DEFAULT_SETTINGS);
  });
  const [grants, setGrants] = React.useState<GrantInfo[]>(() => loadGrants());
  const [dividends, setDividends] = React.useState<DividendEvent[]>(() => loadDividends()?.dividends ?? []);
  const [cashInterest, setCashInterest] = React.useState<CashInterestEvent[]>(() => loadDividends()?.cashInterest ?? []);
  const [showRules, setShowRules] = React.useState(false);
  const [showSalesImportDialog, setShowSalesImportDialog] = React.useState(false);
  const [savedSimulations, setSavedSimulations] = React.useState<SavedSimulation[]>(() => {
    try {
      const saved = localStorage.getItem('savedSimulations');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Fiscal years: simulations always use the current year; the declaration view
  // uses the year selected via SoldLotsTable (defaults to most recent sale year).
  const simFiscalYear = new Date().getFullYear();
  const declFiscalYear = saleYear ?? new Date().getFullYear();

  const handleImport = React.useCallback((importedLots: StockLot[]) => {
    if (importedLots.length === 0) return;
    // 1. First, reconcile with StockExport grants when available — this gives the
    //    most authoritative classification (actual plan type from Microsoft).
    const reconciled = grants.length > 0 ? reconcileLots(importedLots, grants).lots : importedLots;

    // 2. Then apply user overrides and defaults for any DO lots that are still not
    //    reconciled (no grant matched or StockExport not imported).
    let prepared: StockLot[];
    try {
      const overrides = JSON.parse(localStorage.getItem('planTypeOverrides') || '{}');
      prepared = reconciled.map((lot) => {
        if (lot.reconciled) return lot; // StockExport wins over overrides/defaults
        if (lot.origin === 'DO' && overrides[lot.id]) {
          return { ...lot, planType: overrides[lot.id] };
        }
        if (lot.origin === 'DO') {
          return { ...lot, planType: settings.defaultPlanType === 'non_qualified' ? 'non_qualified' as const : 'qualified_macron' as const };
        }
        return lot;
      });
    } catch {
      prepared = reconciled;
    }
    // 3. Merge by broker: re-importing one courtier replaces only its slice and
    //    leaves positions imported from any other courtier untouched.
    setLots((prev) => mergeByBroker(prev, prepared));
    // Reset only the simulation state — freshly imported positions invalidate any
    // previous simulation. Declaration data (soldLots) lives independently.
    setSimEntries([]);
    setSimResult(null);
  }, [settings.defaultPlanType, grants]);

  /**
   * Update grants and re-reconcile any lots currently loaded. This is the path
   * when the user imports StockExport AFTER already loading their Fidelity
   * positions — we want lots to pick up the new classification immediately.
   */
  const handleGrantsChange = React.useCallback((nextGrants: GrantInfo[]) => {
    setGrants(nextGrants);
    if (lots.length > 0 && nextGrants.length > 0) {
      const reconciled = reconcileLots(lots, nextGrants).lots;
      setLots(reconciled);
      // Capture reconciled planTypes as overrides so subsequent re-imports honour them.
      try {
        const overrides = JSON.parse(localStorage.getItem('planTypeOverrides') || '{}');
        for (const lot of reconciled) {
          if (lot.reconciled) overrides[lot.id] = lot.planType;
        }
        localStorage.setItem('planTypeOverrides', JSON.stringify(overrides));
      } catch {
        // non-fatal
      }
    }
    // Apply the same refinement to already-imported sold lots so the
    // declaration view picks up the StockExport classification immediately
    // (e.g. switches Macron lots to pré-Macron) without forcing the user to
    // re-import their sales export.
    if (soldLots.length > 0 && nextGrants.length > 0) {
      const reconciledSold = reconcileSoldLots(soldLots, nextGrants).lots;
      setSoldLots(reconciledSold);
    }
  }, [lots, soldLots]);

  const handleDividendsChange = React.useCallback(
    (payload: { dividends: DividendEvent[]; cashInterest: CashInterestEvent[] }) => {
      // The DividendsImporter that calls us is broker-scoped to Fidelity, so
      // we replace the Fidelity slice in full (a re-import with fewer events
      // must drop the missing ones) while preserving any dividend already
      // loaded from another courtier (typically Morgan Stanley DRIP).
      setDividends((prev) => {
        const nextDividends = [...prev.filter((d) => d.broker !== 'fidelity'), ...payload.dividends];
        setCashInterest((prevCash) => {
          const nextCash = [...prevCash.filter((c) => c.broker !== 'fidelity'), ...payload.cashInterest];
          if (nextDividends.length === 0 && nextCash.length === 0) {
            clearDividends();
            return nextCash;
          }
          saveDividends({
            dividends: nextDividends,
            cashInterest: nextCash,
            importedAt: new Date().toISOString(),
          });
          return nextCash;
        });
        return nextDividends;
      });
    },
    [],
  );

  /**
   * Called by the Morgan Stanley CsvImporter when the activity report
   * contains DRIP dividend rows. We merge by broker: existing MS dividends
   * are dropped (re-importing the same period is the way to refresh them)
   * and replaced by the freshly parsed batch; dividends from other brokers
   * are preserved untouched. Cash interest is unaffected (MS does not
   * expose any).
   */
  const handleImportMsDividends = React.useCallback(
    (msDividends: DividendEvent[]) => {
      setDividends((prev) => {
        const others = prev.filter((d) => d.broker !== 'morgan_stanley');
        const next = [...others, ...msDividends];
        saveDividends({
          dividends: next,
          cashInterest,
          importedAt: new Date().toISOString(),
        });
        return next;
      });
    },
    [cashInterest],
  );

  const handleImportSales = React.useCallback((importedSoldLots: SoldLot[]) => {
    if (importedSoldLots.length === 0) return;
    // 1. Reconcile against StockExport grants when available — this refines the
    //    planType (Macron vs pré-Macron, decided by the grant award date which
    //    sales exports do not carry) and stamps grantIdHash/awardType so the
    //    UI can mark these lots as "verified". Same matching logic as for
    //    open positions: by acquisition (vest) date.
    const reconciled = grants.length > 0
      ? reconcileSoldLots(importedSoldLots, grants).lots
      : importedSoldLots;

    // 2. For lots that did NOT reconcile, fall back to the user's default
    //    planType (Macron / pré-Macron). Reconciled lots keep the planType
    //    derived from their grant — never overwrite it.
    const withPlanType = reconciled.map((sl) => {
      if (sl.reconciled) return sl;
      return {
        ...sl,
        planType: settings.defaultPlanType === 'non_qualified' ? 'non_qualified' as const : 'qualified_macron' as const,
      };
    });
    // Merge by broker: re-importing one courtier replaces only its sales,
    // leaving sales already loaded from another courtier untouched. Positions
    // (`lots`) are also preserved, since a user may legitimately hold a current
    // portfolio AND have N-1 sales to declare at the same time.
    const merged = mergeByBroker(soldLots, withPlanType);
    setSoldLots(merged);

    // Default to the most recent sale year across the *aggregated* set so that
    // re-importing one courtier opens the dialog on the year that now matters
    // (likely N-1 for declaration), with the full multi-broker tally for that
    // year — which is what users actually declare in France.
    const years = getSaleYears(merged);
    const defaultYear = years[0] ?? new Date().getFullYear();
    setSaleYear(defaultYear);

    const yearLots = merged.filter((sl) => sl.saleDate.getFullYear() === defaultYear);
    const entries = soldLotsToSaleEntries(yearLots);
    setDeclEntries(entries);
    const simulation = {
      lots: entries,
      taxMode: declTaxMode,
      otherTaxableIncome: settings.otherTaxableIncome,
      taxShares: settings.taxShares,
      familyStatus: settings.familyStatus,
      priorLosses: settings.priorLosses,
      fiscalYear: defaultYear,
    };
    const res = runSimulation(simulation);
    setDeclResult(res);
    setShowSalesImportDialog(true);
  }, [settings, declTaxMode, soldLots, grants]);

  /**
   * Drop every position, sale, and (for Morgan Stanley only) dividend that
   * was imported from a given broker. Fidelity dividends keep their own
   * dedicated clear button on the DividendsImporter card so users can scope
   * the reset more precisely; on Morgan Stanley dividends ride on the same
   * activity report as the rest, so it would be confusing to leave them
   * behind. Cash interest is broker-agnostic in practice (only Fidelity
   * surfaces it today) and follows the lot/sale slice.
   */
  const handleClearBroker = React.useCallback((broker: Broker) => {
    setLots((prev) => prev.filter((l) => l.broker !== broker));
    setSoldLots((prev) => prev.filter((sl) => sl.broker !== broker));
    setCashInterest((prev) => prev.filter((c) => c.broker !== broker));
    if (broker === 'morgan_stanley') {
      setDividends((prev) => {
        const next = prev.filter((d) => d.broker !== broker);
        if (next.length === 0) {
          clearDividends();
        } else {
          saveDividends({
            dividends: next,
            cashInterest: cashInterest.filter((c) => c.broker !== broker),
            importedAt: new Date().toISOString(),
          });
        }
        return next;
      });
    }
    // Resetting the simulation state matches the import path: stale results
    // would no longer match the (now smaller) portfolio.
    setSimEntries([]);
    setSimResult(null);
  }, [cashInterest]);

  // Fine-grained per-slice clear handlers. They mirror handleClearBroker but
  // only touch one storage bucket so the user can drop a single mistakenly
  // imported slice (e.g. DRIP dividends) without losing positions or sales.
  const handleClearBrokerLots = React.useCallback((broker: Broker) => {
    setLots((prev) => prev.filter((l) => l.broker !== broker));
    // Positions feeding the simulator are gone — purge stale results too.
    setSimEntries([]);
    setSimResult(null);
  }, []);

  const handleClearBrokerSales = React.useCallback((broker: Broker) => {
    setSoldLots((prev) => prev.filter((sl) => sl.broker !== broker));
  }, []);

  const handleClearBrokerDividends = React.useCallback((broker: Broker) => {
    setDividends((prev) => {
      const next = prev.filter((d) => d.broker !== broker);
      const remainingCash = broker === 'morgan_stanley'
        ? cashInterest.filter((c) => c.broker !== broker)
        : cashInterest;
      if (next.length === 0 && remainingCash.length === 0) {
        clearDividends();
      } else {
        saveDividends({
          dividends: next,
          cashInterest: remainingCash,
          importedAt: new Date().toISOString(),
        });
      }
      return next;
    });
    if (broker === 'morgan_stanley') {
      setCashInterest((prev) => prev.filter((c) => c.broker !== broker));
    }
  }, [cashInterest]);

  const handleSoldLotsChange = React.useCallback((updatedSoldLots: SoldLot[]) => {
    setSoldLots(updatedSoldLots);
    // Re-run the declaration computation with year-filtered lots
    const yearLots = saleYear != null
      ? updatedSoldLots.filter((sl) => sl.saleDate.getFullYear() === saleYear)
      : updatedSoldLots;
    const entries = soldLotsToSaleEntries(yearLots);
    setDeclEntries(entries);
    const simulation = {
      lots: entries,
      taxMode: declTaxMode,
      otherTaxableIncome: settings.otherTaxableIncome,
      taxShares: settings.taxShares,
      familyStatus: settings.familyStatus,
      priorLosses: settings.priorLosses,
      fiscalYear: declFiscalYear,
    };
    setDeclResult(runSimulation(simulation));
  }, [settings, declTaxMode, declFiscalYear, saleYear]);

  /**
   * Bulk-requalify all eligible (= non-reconciled, non-ESPP) sold lots according
   * to a BulkQualifyChoice. Used by the post-import dialog and by the
   * SoldLotsTable banner when the user has not loaded a StockExport file.
   * Re-runs the declaration computation so the result card reflects the new
   * classification immediately.
   */
  const handleBulkQualifySoldLots = React.useCallback((choice: BulkQualifyChoice) => {
    setSoldLots((prev) => {
      const next = applyBulkChoiceToSoldLots(prev, choice);
      const yearLots = saleYear != null
        ? next.filter((sl) => sl.saleDate.getFullYear() === saleYear)
        : next;
      const entries = soldLotsToSaleEntries(yearLots);
      setDeclEntries(entries);
      const simulation = {
        lots: entries,
        taxMode: declTaxMode,
        otherTaxableIncome: settings.otherTaxableIncome,
        taxShares: settings.taxShares,
        familyStatus: settings.familyStatus,
        priorLosses: settings.priorLosses,
        fiscalYear: declFiscalYear,
      };
      setDeclResult(runSimulation(simulation));
      return next;
    });
  }, [saleYear, declTaxMode, declFiscalYear, settings]);

  /**
   * Bulk-requalify open positions. Persists planType overrides so that
   * re-importing the same broker file later honours the user's choice.
   * (Origin overrides are not persisted because the per-row UI does not
   * expose origin editing for open lots — bulk-set origins remain
   * authoritative until the next import.)
   */
  const handleBulkQualifyLots = React.useCallback((choice: BulkQualifyChoice) => {
    setLots((prev) => {
      const next = applyBulkChoiceToLots(prev, choice);
      try {
        const overrides = JSON.parse(localStorage.getItem('planTypeOverrides') || '{}');
        for (const lot of next) {
          if (lot.reconciled || lot.origin === 'SP') continue;
          overrides[lot.id] = lot.planType;
        }
        safeSetItem('planTypeOverrides', JSON.stringify(overrides));
      } catch {
        // non-fatal — overrides are an optimisation, not a correctness requirement
      }
      return next;
    });
  }, []);

  const handleSaleYearChange = React.useCallback((year: number) => {
    setSaleYear(year);
    const yearLots = soldLots.filter((sl) => sl.saleDate.getFullYear() === year);
    const entries = soldLotsToSaleEntries(yearLots);
    setDeclEntries(entries);
    const simulation = {
      lots: entries,
      taxMode: declTaxMode,
      otherTaxableIncome: settings.otherTaxableIncome,
      taxShares: settings.taxShares,
      familyStatus: settings.familyStatus,
      priorLosses: settings.priorLosses,
      fiscalYear: year,
    };
    setDeclResult(runSimulation(simulation));
  }, [soldLots, settings, declTaxMode]);

  const handleSimulate = React.useCallback((entries: SaleLotEntry[]) => {
    setSimEntries(entries);
    const simulation = {
      lots: entries,
      taxMode: simTaxMode,
      otherTaxableIncome: settings.otherTaxableIncome,
      taxShares: settings.taxShares,
      familyStatus: settings.familyStatus,
      priorLosses: settings.priorLosses,
      fiscalYear: simFiscalYear,
    };
    const res = runSimulation(simulation);
    setSimResult(res);
    setSimStale(false);

    const saved: SavedSimulation = {
      id: generateId(),
      date: new Date().toISOString(),
      name: `Simulation du ${new Date().toLocaleDateString('fr-FR')}`,
      result: res,
      settings,
      lots: entries,
    };
    const updatedSimulations = [saved, ...savedSimulations].slice(0, 20);
    setSavedSimulations(updatedSimulations);
    safeSetItem('savedSimulations', JSON.stringify(updatedSimulations));

    setActiveTab('simulator');

    // Defer until after the TaxCalculator has rendered the new result so the
    // scroll target's height is correct, then briefly flash it to confirm
    // the simulation has been (re)computed.
    requestAnimationFrame(() => {
      simResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setSimResultFlash(true);
      window.setTimeout(() => setSimResultFlash(false), 1200);
    });
  }, [simTaxMode, simFiscalYear, settings, savedSimulations]);

  const handleSimTaxModeChange = React.useCallback((mode: TaxMode) => {
    setSimTaxMode(mode);
    if (simEntries.length > 0) {
      const simulation = {
        lots: simEntries,
        taxMode: mode,
        otherTaxableIncome: settings.otherTaxableIncome,
        taxShares: settings.taxShares,
        familyStatus: settings.familyStatus,
        priorLosses: settings.priorLosses,
        fiscalYear: simFiscalYear,
      };
      setSimResult(runSimulation(simulation));
      setSimStale(false);
    }
  }, [simEntries, settings, simFiscalYear]);

  // Stable handler so SaleSimulator's "selection changed" effect does not
  // re-fire on every parent render (would otherwise show the stale banner
  // permanently as soon as a simulation exists).
  const handleSimSelectionChange = React.useCallback(() => {
    setSimStale((prev) => prev || simResult !== null);
  }, [simResult]);

  const handleDeclTaxModeChange = React.useCallback((mode: TaxMode) => {
    setDeclTaxMode(mode);
    if (declEntries.length > 0) {
      const simulation = {
        lots: declEntries,
        taxMode: mode,
        otherTaxableIncome: settings.otherTaxableIncome,
        taxShares: settings.taxShares,
        familyStatus: settings.familyStatus,
        priorLosses: settings.priorLosses,
        fiscalYear: declFiscalYear,
      };
      setDeclResult(runSimulation(simulation));
    }
  }, [declEntries, settings, declFiscalYear]);

  const handleBackupImport = React.useCallback((imported: ImportResult) => {
    setSettings(imported.settings);
    saveVersionedSettings('appSettings', imported.settings);
    setLots(imported.lots);
    setSoldLots(imported.soldLots);
    setSavedSimulations(imported.savedSimulations);
    safeSetItem('savedSimulations', JSON.stringify(imported.savedSimulations));
    // Reset derived/session state — results will be re-computed from imported data on demand
    setSimEntries([]);
    setSimResult(null);
    setDeclEntries([]);
    setDeclResult(null);
    setSaleYear(null);
  }, []);

  const settingsDone = isSettingsConfigured(settings, DEFAULT_SETTINGS);
  const portfolioDone = lots.length > 0;
  const simulationDone = simResult !== null;
  const declarationDone = declResult !== null || dividends.length > 0;

  const tabs = [
    { id: 'settings' as const, step: 1, label: 'Paramètres', icon: SettingsIcon, done: settingsDone },
    { id: 'data' as const, step: 2, label: 'Mes données', icon: Database, done: lots.length > 0 || soldLots.length > 0 || grants.length > 0 || dividends.length > 0 },
    { id: 'portfolio' as const, step: 3, label: 'Mon portefeuille', icon: Briefcase, done: portfolioDone },
    { id: 'simulator' as const, step: 4, label: 'Ma simulation', icon: Calculator, done: simulationDone },
    { id: 'declaration' as const, step: 5, label: 'Ma déclaration', icon: FileText, done: declarationDone },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Simulateur fiscal — Actions Microsoft
              </h1>
              <p className="text-sm text-gray-500">
                Calculez vos impôts sur la vente d'actions MSFT acquises via ESPP et Stock Awards
              </p>
            </div>
            <span className="text-xs text-gray-400">
              Données fiscales à jour du {new Date().toLocaleDateString('fr-FR')}
            </span>
          </div>
        </div>
      </header>

      {/* Disclaimer banner */}
      <div className="bg-amber-50 border-b border-amber-200">
        <div className="max-w-7xl mx-auto px-4 py-2 text-xs text-amber-700">
          ⚠️ Cet outil est un simulateur indicatif. Il ne constitue pas un conseil fiscal. Consultez un conseiller fiscal ou référez-vous aux instructions de KPMG Avocats fournies par votre employeur.
        </div>
      </div>

      {/* Navigation tabs with workflow indicators */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex items-center gap-1 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                  }`}
                >
                  {tab.done && !isActive ? (
                    <span className="flex items-center justify-center h-5 w-5 rounded-full bg-green-100 text-green-600 shrink-0">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : (
                    <span
                      className={`flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold shrink-0 ${
                        isActive
                          ? 'bg-primary text-white'
                          : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {tab.step}
                    </span>
                  )}
                  <Icon className="h-4 w-4 sm:hidden" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
            <div className="ml-auto">
              <button
                onClick={() => setShowRules(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-primary transition-colors whitespace-nowrap"
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Règles fiscales</span>
              </button>
            </div>
          </nav>
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-screen-2xl mx-auto px-4 py-6">
        <div hidden={activeTab !== 'portfolio'}>
          <div className="space-y-6">
            {!settingsDone && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-start gap-3 text-sm">
                <SettingsIcon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-blue-800">
                    <strong>Conseil :</strong> configurez d'abord vos paramètres fiscaux (situation familiale, revenus, parts) pour des calculs précis.
                  </p>
                  <button
                    onClick={() => setActiveTab('settings')}
                    className="mt-2 inline-flex items-center gap-1 text-primary font-medium hover:underline"
                  >
                    Configurer mes paramètres →
                  </button>
                </div>
              </div>
            )}
            {lots.length === 0 && soldLots.length === 0 && (
              <div className="text-center py-12 rounded-lg border border-dashed border-gray-300 bg-white">
                <Briefcase className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-700 font-medium">Aucune donnée importée</p>
                <p className="text-sm text-gray-500 mt-1 mb-4 max-w-md mx-auto">
                  Pour visualiser votre portefeuille, importez d'abord vos fichiers depuis l'onglet <strong>Mes données</strong>.
                </p>
                <button
                  onClick={() => setActiveTab('data')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  Aller à Mes données
                </button>
              </div>
            )}
            {lots.length > 0 && (
              <React.Suspense fallback={<LazyFallback />}>
                <Portfolio lots={lots} onLotsChange={setLots} onBulkQualify={handleBulkQualifyLots} hasGrants={grants.length > 0} grants={grants} dividends={dividends} cashInterest={cashInterest} />
              </React.Suspense>
            )}
          </div>
        </div>

        <div hidden={activeTab !== 'simulator'}>
          <div className="space-y-6">
            {lots.length === 0 ? (
              <div className="text-center py-16">
                <Briefcase className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-600 font-medium">Aucun portefeuille importé</p>
                <p className="text-sm text-gray-500 mt-1 mb-4">
                  Importez vos positions actuelles pour simuler une vente.
                </p>
                <button
                  onClick={() => setActiveTab('portfolio')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  Importer mon portefeuille
                </button>
              </div>
            ) : (
              <>
                <SaleSimulator
                  lots={lots}
                  settings={settings}
                  onSimulate={handleSimulate}
                  onSelectionChange={handleSimSelectionChange}
                />
                <div
                  ref={simResultRef}
                  className={`scroll-mt-4 rounded-lg transition-shadow duration-500 ${simResultFlash ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                >
                  {simStale && simResult && (
                    <div
                      className="mb-4 flex items-center gap-2 px-3 py-2 rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-xs"
                      role="status"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>Sélection modifiée — relancez la simulation pour mettre à jour le résultat.</span>
                    </div>
                  )}
                  {simEntries.length > 0 && simResult && (
                    <div className="mb-6">
                      <PfuVsBaremeComparator
                        lots={simEntries}
                        settings={settings}
                        fiscalYear={simFiscalYear}
                        taxMode={simTaxMode}
                        onTaxModeChange={handleSimTaxModeChange}
                      />
                    </div>
                  )}
                  <TaxCalculator
                    result={simResult}
                    taxMode={simTaxMode}
                    onTaxModeChange={handleSimTaxModeChange}
                    fiscalYear={simFiscalYear}
                    familyStatus={settings.familyStatus}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <div hidden={activeTab !== 'declaration'}>
          <div className="space-y-6">
            {soldLots.length === 0 && dividends.length === 0 ? (
              <div className="text-center py-16">
                <Calculator className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-600 font-medium">Aucune vente à déclarer</p>
                <p className="text-sm text-gray-500 mt-1 mb-4">
                  Importez votre historique de ventes ou de dividendes pour préparer votre déclaration.
                </p>
                <button
                  onClick={() => setActiveTab('portfolio')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  Importer mes ventes
                </button>
              </div>
            ) : (
              <>
                {soldLots.length > 0 && (
                  <SoldLotsTable
                    soldLots={soldLots}
                    onSoldLotsChange={handleSoldLotsChange}
                    onBulkQualify={handleBulkQualifySoldLots}
                    hasGrants={grants.length > 0}
                    defaultPlanType={settings.defaultPlanType}
                    saleYear={saleYear}
                    onSaleYearChange={handleSaleYearChange}
                  />
                )}
                {soldLots.length > 0 && (
                  <TaxCalculator result={declResult} taxMode={declTaxMode} onTaxModeChange={handleDeclTaxModeChange} fiscalYear={declFiscalYear} familyStatus={settings.familyStatus} />
                )}
                {declResult && (
                  <DeclarationGuide result={declResult} lots={declEntries} fiscalYear={declFiscalYear} />
                )}
                {dividends.length > 0 && (
                  <DividendsDeclaration dividends={dividends} fiscalYear={declFiscalYear} />
                )}
              </>
            )}
          </div>
        </div>

        <div hidden={activeTab !== 'data'}>
          <React.Suspense fallback={<LazyFallback />}>
            <DataPanel
            settings={settings}
            grants={grants}
            onGrantsChange={handleGrantsChange}
            lots={lots}
            soldLots={soldLots}
            dividends={dividends}
            cashInterest={cashInterest}
            onDividendsChange={handleDividendsChange}
            onImportMsDividends={handleImportMsDividends}
            onDefaultPlanTypeChange={(value) => {
              const next = { ...settings, defaultPlanType: value };
              setSettings(next);
              saveVersionedSettings('appSettings', next);
            }}
            onImportLots={handleImport}
            onImportSales={handleImportSales}
            onClearBroker={handleClearBroker}
            onClearBrokerLots={handleClearBrokerLots}
            onClearBrokerSales={handleClearBrokerSales}
            onClearBrokerDividends={handleClearBrokerDividends}
          />
          </React.Suspense>
        </div>

        <div hidden={activeTab !== 'settings'}>
          <React.Suspense fallback={<LazyFallback />}>
            <Settings
              settings={settings}
              onSettingsChange={setSettings}
              defaults={DEFAULT_SETTINGS}
              lots={lots}
              soldLots={soldLots}
              savedSimulations={savedSimulations}
              onBackupImport={handleBackupImport}
            />
          </React.Suspense>
        </div>
      </main>

      {/* Tax rules panel */}
      {showRules && <TaxRulesPanel onClose={() => setShowRules(false)} />}

      {/* Sales import requalification dialog */}
      <Dialog
        open={showSalesImportDialog}
        onClose={() => setShowSalesImportDialog(false)}
        className="max-w-xl"
      >
        <DialogHeader>
          <p className="font-semibold text-gray-900 mb-2">Vérification nécessaire</p>
          <p>
            Les exports de ventes ne contiennent pas toujours l'origine ni le régime fiscal exact des actions
            (Fidelity ne fournit aucune origine&nbsp;; Morgan Stanley fournit le plan mais pas l'année d'attribution).
            {grants.length > 0 ? (
              <> Les lots dont la date d'acquisition correspond à une attribution de votre StockExport ont été <strong>reconciliés automatiquement</strong>. </>
            ) : (
              <> Importez votre fichier StockExport dans <strong>Mes données &gt; Attributions</strong> pour qualifier automatiquement les lots dont la date correspond à une attribution. </>
            )}
          </p>
        </DialogHeader>
        {countEligible(soldLots) > 0 && (
          <div className="border-t border-gray-100 pt-4 mb-2 space-y-3">
            <p className="text-sm font-medium text-gray-900">
              Qualifier en lot les ventes non reconciliées ({countEligible(soldLots)})
            </p>
            <BulkQualifyPanel
              eligibleCount={countEligible(soldLots)}
              onApply={(choice) => {
                handleBulkQualifySoldLots(choice);
                setShowSalesImportDialog(false);
                setActiveTab('declaration');
              }}
              compact
            />
            <p className="text-xs text-gray-500">
              Vous pourrez toujours ajuster manuellement chaque ligne ensuite dans l'onglet Ma déclaration.
            </p>
          </div>
        )}
        <DialogFooter>
          <button
            onClick={() => {
              setShowSalesImportDialog(false);
              setActiveTab('declaration');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            {countEligible(soldLots) > 0 ? 'Qualifier manuellement' : 'Aller à ma déclaration'}
          </button>
        </DialogFooter>
      </Dialog>

      {/* Footer */}
      <footer className="border-t bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 py-4 text-center text-xs text-gray-400">
          ⚠️ Cet outil est un simulateur indicatif. Il ne constitue pas un conseil fiscal. Les calculs sont basés sur la législation fiscale française en vigueur et peuvent évoluer. Pour votre déclaration officielle, consultez un conseiller fiscal ou référez-vous aux instructions de KPMG Avocats fournies par votre employeur.
        </div>
      </footer>
    </div>
  );
}

export default function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
