import React from 'react';
import { Briefcase, Calculator, FileText, Settings as SettingsIcon, AlertTriangle, RefreshCw, Loader2, Check, Upload, BookOpen } from 'lucide-react';
import { TaxRulesPanel } from './components/TaxRulesPanel';
import { CsvImporter } from './components/CsvImporter';
import { SoldLotsTable } from './components/SoldLotsTable';
import { SaleSimulator } from './components/SaleSimulator';
import { TaxCalculator } from './components/TaxCalculator';
import { DeclarationGuide } from './components/DeclarationGuide';
import { PfuVsBaremeComparator } from './components/PfuVsBaremeComparator';
import { BackupPanel } from './components/BackupPanel';
import { Dialog, DialogHeader, DialogFooter } from './components/ui/dialog';
import { runSimulation } from './lib/tax-engine';
import { loadVersionedSettings, safeSetItem, saveVersionedSettings, loadGrants } from './lib/storage';
import { reconcileLots } from './lib/stockexport-reconciliation';
import type { ImportResult } from './lib/backup';
import type { StockLot, SoldLot, SaleLotEntry, AppSettings, TaxSimulationResult, TaxMode, SavedSimulation, GrantInfo } from './lib/types';
import { generateId } from './lib/utils';

// Lazy-load heavy components (pdfjs-dist via Settings, recharts via Portfolio)
const Portfolio = React.lazy(() =>
  import('./components/Portfolio').then((m) => ({ default: m.Portfolio }))
);
const Settings = React.lazy(() =>
  import('./components/Settings').then((m) => ({ default: m.Settings }))
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

type Tab = 'portfolio' | 'simulator' | 'declaration' | 'settings';
const TAB_STORAGE_KEY = 'activeTab';
const VALID_TABS: readonly Tab[] = ['portfolio', 'simulator', 'declaration', 'settings'] as const;

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
  const [saleYear, setSaleYear] = React.useState<number | null>(null);
  const [saleEntries, setSaleEntries] = React.useState<SaleLotEntry[]>([]);
  const [taxMode, setTaxMode] = React.useState<TaxMode>('pfu');
  const [result, setResult] = React.useState<TaxSimulationResult | null>(null);
  const [settings, setSettings] = React.useState<AppSettings>(() => {
    return loadVersionedSettings('appSettings', DEFAULT_SETTINGS);
  });
  const [grants, setGrants] = React.useState<GrantInfo[]>(() => loadGrants());
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

  // Fiscal year: from sold lots year filter, or current year for portfolio simulations
  const fiscalYear = saleYear ?? new Date().getFullYear();

  const handleImport = React.useCallback((importedLots: StockLot[]) => {
    // 1. First, reconcile with StockExport grants when available — this gives the
    //    most authoritative classification (actual plan type from Microsoft).
    const reconciled = grants.length > 0 ? reconcileLots(importedLots, grants).lots : importedLots;

    // 2. Then apply user overrides and defaults for any DO lots that are still not
    //    reconciled (no grant matched or StockExport not imported).
    try {
      const overrides = JSON.parse(localStorage.getItem('planTypeOverrides') || '{}');
      const lotsWithOverrides = reconciled.map((lot) => {
        if (lot.reconciled) return lot; // StockExport wins over overrides/defaults
        if (lot.origin === 'DO' && overrides[lot.id]) {
          return { ...lot, planType: overrides[lot.id] };
        }
        if (lot.origin === 'DO') {
          return { ...lot, planType: settings.defaultPlanType === 'non_qualified' ? 'non_qualified' as const : 'qualified_macron' as const };
        }
        return lot;
      });
      setLots(lotsWithOverrides);
    } catch {
      setLots(reconciled);
    }
    // Clear sales data — positions and sales are mutually exclusive workflows
    setSoldLots([]);
    setSaleEntries([]);
    setResult(null);
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
  }, [lots]);

  const handleImportSales = React.useCallback((importedSoldLots: SoldLot[]) => {
    const withPlanType = importedSoldLots.map((sl) => ({
      ...sl,
      planType: settings.defaultPlanType === 'non_qualified' ? 'non_qualified' as const : 'qualified_macron' as const,
    }));
    setSoldLots(withPlanType);
    // Clear positions data — positions and sales are mutually exclusive workflows
    setLots([]);

    // Default to the most recent sale year (likely N-1 for declaration)
    const years = getSaleYears(withPlanType);
    const defaultYear = years[0] ?? new Date().getFullYear();
    setSaleYear(defaultYear);

    // Filter to selected year and auto-run simulation
    const yearLots = withPlanType.filter((sl) => sl.saleDate.getFullYear() === defaultYear);
    const entries = soldLotsToSaleEntries(yearLots);
    setSaleEntries(entries);
    const simulation = {
      lots: entries,
      taxMode,
      otherTaxableIncome: settings.otherTaxableIncome,
      taxShares: settings.taxShares,
      familyStatus: settings.familyStatus,
      priorLosses: settings.priorLosses,
      fiscalYear: defaultYear,
    };
    const res = runSimulation(simulation);
    setResult(res);
    setShowSalesImportDialog(true);
  }, [settings, taxMode]);

  const handleSoldLotsChange = React.useCallback((updatedSoldLots: SoldLot[]) => {
    setSoldLots(updatedSoldLots);
    // Re-run simulation with year-filtered lots
    const yearLots = saleYear != null
      ? updatedSoldLots.filter((sl) => sl.saleDate.getFullYear() === saleYear)
      : updatedSoldLots;
    const entries = soldLotsToSaleEntries(yearLots);
    setSaleEntries(entries);
    const simulation = {
      lots: entries,
      taxMode,
      otherTaxableIncome: settings.otherTaxableIncome,
      taxShares: settings.taxShares,
      familyStatus: settings.familyStatus,
      priorLosses: settings.priorLosses,
      fiscalYear,
    };
    setResult(runSimulation(simulation));
  }, [settings, taxMode, fiscalYear, saleYear]);

  const handleSaleYearChange = React.useCallback((year: number) => {
    setSaleYear(year);
    const yearLots = soldLots.filter((sl) => sl.saleDate.getFullYear() === year);
    const entries = soldLotsToSaleEntries(yearLots);
    setSaleEntries(entries);
    const simulation = {
      lots: entries,
      taxMode,
      otherTaxableIncome: settings.otherTaxableIncome,
      taxShares: settings.taxShares,
      familyStatus: settings.familyStatus,
      priorLosses: settings.priorLosses,
      fiscalYear: year,
    };
    setResult(runSimulation(simulation));
  }, [soldLots, settings, taxMode]);

  const handleSimulate = React.useCallback((entries: SaleLotEntry[]) => {
    setSaleEntries(entries);
    const simulation = {
      lots: entries,
      taxMode,
      otherTaxableIncome: settings.otherTaxableIncome,
      taxShares: settings.taxShares,
      familyStatus: settings.familyStatus,
      priorLosses: settings.priorLosses,
      fiscalYear: new Date().getFullYear(),
    };
    const res = runSimulation(simulation);
    setResult(res);

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
  }, [taxMode, settings, savedSimulations]);

  const handleTaxModeChange = React.useCallback((mode: TaxMode) => {
    setTaxMode(mode);
    if (saleEntries.length > 0) {
      const simulation = {
        lots: saleEntries,
        taxMode: mode,
        otherTaxableIncome: settings.otherTaxableIncome,
        taxShares: settings.taxShares,
        familyStatus: settings.familyStatus,
        priorLosses: settings.priorLosses,
        fiscalYear,
      };
      setResult(runSimulation(simulation));
    }
  }, [saleEntries, settings, fiscalYear]);

  const handleBackupImport = React.useCallback((imported: ImportResult) => {
    setSettings(imported.settings);
    saveVersionedSettings('appSettings', imported.settings);
    setLots(imported.lots);
    setSoldLots(imported.soldLots);
    setSavedSimulations(imported.savedSimulations);
    safeSetItem('savedSimulations', JSON.stringify(imported.savedSimulations));
    // Reset derived/session state — results will be re-computed from imported data on demand
    setSaleEntries([]);
    setResult(null);
    setSaleYear(null);
  }, []);

  const settingsDone = isSettingsConfigured(settings, DEFAULT_SETTINGS);
  const portfolioDone = lots.length > 0 || soldLots.length > 0;
  const simulationDone = result !== null;

  const tabs = [
    { id: 'settings' as const, step: 1, label: 'Paramètres', icon: SettingsIcon, done: settingsDone },
    { id: 'portfolio' as const, step: 2, label: 'Mon portefeuille', icon: Briefcase, done: portfolioDone },
    { id: 'simulator' as const, step: 3, label: 'Cessions', icon: Calculator, done: simulationDone },
    { id: 'declaration' as const, step: 4, label: 'Ma déclaration', icon: FileText, done: simulationDone },
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
      <main className="max-w-7xl mx-auto px-4 py-6">
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
            <CsvImporter onImport={handleImport} onImportSales={handleImportSales} />
            {soldLots.length > 0 && (
              <SoldLotsTable
                soldLots={soldLots}
                onSoldLotsChange={handleSoldLotsChange}
                defaultPlanType={settings.defaultPlanType}
                saleYear={saleYear}
                onSaleYearChange={handleSaleYearChange}
              />
            )}
            {lots.length > 0 && (
              <React.Suspense fallback={<LazyFallback />}>
                <Portfolio lots={lots} onLotsChange={setLots} />
              </React.Suspense>
            )}
          </div>
        </div>

        <div hidden={activeTab !== 'simulator'}>
          <div className="space-y-6">
            {lots.length === 0 && soldLots.length === 0 ? (
              <div className="text-center py-16">
                <Briefcase className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-600 font-medium">Aucun portefeuille importé</p>
                <p className="text-sm text-gray-500 mt-1 mb-4">
                  Importez votre fichier CSV pour commencer une simulation de vente ou déclarer des ventes effectuées.
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
                {lots.length > 0 && (
                  <SaleSimulator lots={lots} settings={settings} onSimulate={handleSimulate} />
                )}
                <TaxCalculator result={result} taxMode={taxMode} onTaxModeChange={handleTaxModeChange} fiscalYear={fiscalYear} familyStatus={settings.familyStatus} />
                {saleEntries.length > 0 && (
                  <>
                    <PfuVsBaremeComparator lots={saleEntries} settings={settings} fiscalYear={fiscalYear} />
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div hidden={activeTab !== 'declaration'}>
          {result ? (
            <DeclarationGuide result={result} lots={saleEntries} fiscalYear={fiscalYear} />
          ) : (
            <div className="text-center py-16">
              <Calculator className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-600 font-medium">Aucune simulation effectuée</p>
              <p className="text-sm text-gray-500 mt-1 mb-4">
                {lots.length === 0
                  ? 'Importez votre portefeuille puis lancez une simulation pour obtenir les instructions de déclaration.'
                  : 'Lancez une simulation de vente pour obtenir les formulaires et montants à déclarer.'
                }
              </p>
              <button
                onClick={() => setActiveTab(lots.length === 0 ? 'portfolio' : 'simulator')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
              >
                {lots.length === 0 ? (
                  <>
                    <Upload className="h-4 w-4" />
                    Importer mon portefeuille
                  </>
                ) : (
                  <>
                    <Calculator className="h-4 w-4" />
                    Aller aux cessions
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        <div hidden={activeTab !== 'settings'}>
          <div className="space-y-6">
            <React.Suspense fallback={<LazyFallback />}>
              <Settings
                settings={settings}
                onSettingsChange={setSettings}
                grants={grants}
                onGrantsChange={handleGrantsChange}
              />
            </React.Suspense>
            <div className="max-w-2xl">
              <BackupPanel
                current={{ settings, lots, soldLots, savedSimulations }}
                defaults={DEFAULT_SETTINGS}
                onImport={handleBackupImport}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Tax rules panel */}
      {showRules && <TaxRulesPanel onClose={() => setShowRules(false)} />}

      {/* Sales import requalification dialog */}
      <Dialog open={showSalesImportDialog} onClose={() => setShowSalesImportDialog(false)}>
        <DialogHeader>
          <p className="font-semibold text-gray-900 mb-2">Vérification nécessaire</p>
          <p>
            L'export Fidelity des ventes effectuées ne contient pas l'origine des actions. Vérifiez et corrigez le <strong>type</strong> (ESPP, Stock Award, AGA…) et le <strong>régime fiscal</strong> de chaque lot importé.
          </p>
        </DialogHeader>
        <DialogFooter>
          <button
            onClick={() => {
              setShowSalesImportDialog(false);
              setActiveTab('portfolio');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            Qualifier les lots
          </button>
          <button
            onClick={() => {
              setShowSalesImportDialog(false);
              setActiveTab('simulator');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Aller aux cessions
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
