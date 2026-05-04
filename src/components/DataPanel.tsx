import React from 'react';
import { Database, Award, Building2 } from 'lucide-react';
import { CsvImporter } from './CsvImporter';
import { StockExportImporter } from './StockExportImporter';
import { DividendsImporter } from './DividendsImporter';
import { DividendsSummary } from './DividendsSummary';
import { BrokerLogo } from './BrokerLogo';
import { brokerLabel } from '../lib/utils';
import type { AppSettings, Broker, GrantInfo, StockLot, SoldLot } from '../lib/types';
import type { DividendEvent, CashInterestEvent } from '../lib/transaction-parser';

interface DataPanelProps {
  settings: AppSettings;
  grants: GrantInfo[];
  onGrantsChange: (grants: GrantInfo[]) => void;
  lots: StockLot[];
  soldLots: SoldLot[];
  dividends: DividendEvent[];
  cashInterest: CashInterestEvent[];
  onDividendsChange: (p: { dividends: DividendEvent[]; cashInterest: CashInterestEvent[] }) => void;
  /** Merge dividends extracted from a Morgan Stanley activity report (replaces the MS subset only). */
  onImportMsDividends: (dividends: DividendEvent[]) => void;
  onDefaultPlanTypeChange: (v: AppSettings['defaultPlanType']) => void;
  onImportLots: (lots: StockLot[]) => void;
  onImportSales: (soldLots: SoldLot[]) => void;
  /** Drop all positions + sales (and dividends, for MS) belonging to a broker. */
  onClearBroker: (broker: Broker) => void;
  /** Fine-grained clear actions: drop only the named slice for one broker. */
  onClearBrokerLots: (broker: Broker) => void;
  onClearBrokerSales: (broker: Broker) => void;
  onClearBrokerDividends: (broker: Broker) => void;
}

interface SectionHeaderProps {
  step: number;
  icon: React.ReactNode;
  title: string;
  description: string;
}

/** Top-level section heading. */
function SectionHeader({ step, icon, title, description }: SectionHeaderProps) {
  return (
    <div className="flex items-start gap-3 pt-4 first:pt-0">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="text-base font-semibold text-gray-900 leading-tight">
          <span className="text-gray-400 mr-1.5">{step}.</span>
          {title}
        </h3>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
    </div>
  );
}

interface BrokerSectionProps {
  broker: Broker;
  description: string;
  children: React.ReactNode;
}

/**
 * Sub-section grouping all imports for a single broker. The card carries
 * the broker identity (logo + name + description) so its embedded
 * importers can drop their own redundant headers.
 */
/**
 * Per-broker visual accent. We deliberately keep the card body on a neutral
 * white so the inner colored summary banners stay readable; instead we lean
 * on a thicker coloured left border + tinted header strip for separation.
 */
const BROKER_ACCENT: Record<Broker, { stripe: string; header: string }> = {
  fidelity: { stripe: 'border-l-emerald-500', header: 'bg-emerald-50/60' },
  morgan_stanley: { stripe: 'border-l-sky-500', header: 'bg-sky-50/60' },
};

function BrokerSection({ broker, description, children }: BrokerSectionProps) {
  const accent = BROKER_ACCENT[broker];
  return (
    <div className={`rounded-xl border border-gray-200 border-l-4 ${accent.stripe} bg-white shadow-sm overflow-hidden`}>
      <div className={`flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100 ${accent.header}`}>
        <h4 className="text-base font-semibold text-gray-900">{brokerLabel(broker)}</h4>
        <BrokerLogo broker={broker} className="h-6 shrink-0" />
      </div>
      <div className="p-5 space-y-4">
        <p className="text-xs text-gray-600">{description}</p>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
}

interface SubLabelProps {
  label: string;
}

function SubLabel({ label }: SubLabelProps) {
  return (
    <div className="text-[11px] font-medium text-gray-500 pb-1 border-b border-gray-100">
      {label}
    </div>
  );
}

/**
 * Data hub for broker / employer imports. Organised so that each courtier
 * has its own self-contained section: re-importing one courtier never
 * affects data already loaded from another.
 */
export function DataPanel({
  settings,
  grants,
  onGrantsChange,
  lots,
  soldLots,
  dividends,
  cashInterest,
  onDividendsChange,
  onImportMsDividends,
  onDefaultPlanTypeChange,
  onImportLots,
  onImportSales,
  onClearBroker,
  onClearBrokerLots,
  onClearBrokerSales,
  onClearBrokerDividends,
}: DataPanelProps) {
  const fidelityLots = React.useMemo(() => lots.filter((l) => l.broker === 'fidelity'), [lots]);
  const fidelitySold = React.useMemo(() => soldLots.filter((s) => s.broker === 'fidelity'), [soldLots]);
  const msLots = React.useMemo(() => lots.filter((l) => l.broker === 'morgan_stanley'), [lots]);
  const msSold = React.useMemo(() => soldLots.filter((s) => s.broker === 'morgan_stanley'), [soldLots]);
  const msDividends = React.useMemo(() => dividends.filter((d) => d.broker === 'morgan_stanley'), [dividends]);
  const msDividendsGrossUsd = React.useMemo(() => msDividends.reduce((s, d) => s + (d.grossUsd ?? 0), 0), [msDividends]);
  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-6">
      <header className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
          <Database className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Mes données</h2>
          <p className="text-sm text-gray-600">
            Importez les fichiers nécessaires à votre déclaration. Chaque
            courtier a sa propre section{'\u00A0'}: vous pouvez les combiner
            librement, l'agrégation (positions, ventes, dividendes) se fait
            automatiquement.
          </p>
        </div>
      </header>

      {/* 1. Grants & vesting (transverse) */}
      <section className="space-y-4">
        <SectionHeader
          step={1}
          icon={<Award className="h-5 w-5" />}
          title="Attributions & vesting"
          description="Métadonnées d'attribution exportées par Microsoft (plan, date, calendrier de vesting). Indispensable pour classer vos lots et projeter les vestings à venir."
        />
        <div className="rounded-xl border border-gray-200 border-l-4 border-l-violet-500 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100 bg-violet-50/60">
            <h4 className="text-base font-semibold text-gray-900">Microsoft StockExport</h4>
            <Award className="h-5 w-5 text-violet-600 shrink-0" aria-hidden="true" />
          </div>
          <div className="p-5">
            <StockExportImporter
              grants={grants}
              onGrantsChange={onGrantsChange}
              defaultPlanType={settings.defaultPlanType}
              onDefaultPlanTypeChange={onDefaultPlanTypeChange}
              embedded
            />
          </div>
        </div>
      </section>

      {/* 2. Per-broker data */}
      <section className="space-y-4">
        <SectionHeader
          step={2}
          icon={<Building2 className="h-5 w-5" />}
          title="Mes données par courtier"
          description="Importez positions, ventes et dividendes depuis chacun de vos courtiers. Re-importer un courtier ne touche pas aux données déjà chargées des autres."
        />

        <BrokerSection
          broker="fidelity"
          description="Trois fichiers distincts : positions (snapshot du portefeuille), ventes (réalisations de l'année), et historique des transactions (dividendes & intérêts)."
        >
          <div className="space-y-4">
            <SubLabel label="Positions & ventes" />
            <CsvImporter
              broker="fidelity"
              onImport={onImportLots}
              onImportSales={onImportSales}
              onClear={() => onClearBroker('fidelity')}
              onClearLots={() => onClearBrokerLots('fidelity')}
              onClearSales={() => onClearBrokerSales('fidelity')}
              lots={fidelityLots}
              soldLots={fidelitySold}
              embedded
            />
          </div>
          <div className="space-y-4">
            <SubLabel label="Dividendes & intérêts" />
            <DividendsImporter
              broker="fidelity"
              dividends={dividends.filter((d) => d.broker === 'fidelity')}
              cashInterest={cashInterest.filter((c) => c.broker === 'fidelity')}
              onDividendsChange={onDividendsChange}
              embedded
            />
          </div>
        </BrokerSection>

        <BrokerSection
          broker="morgan_stanley"
          description="Un seul rapport « Participant Share Sales Report » (XLSX ou CSV) regroupe positions, ventes et dividendes réinvestis (DRIP)."
        >
          <CsvImporter
            broker="morgan_stanley"
            onImport={onImportLots}
            onImportSales={onImportSales}
            onImportDividends={onImportMsDividends}
            onClear={() => onClearBroker('morgan_stanley')}
            onClearLots={() => onClearBrokerLots('morgan_stanley')}
            onClearSales={() => onClearBrokerSales('morgan_stanley')}
            onClearDividends={() => onClearBrokerDividends('morgan_stanley')}
            lots={msLots}
            soldLots={msSold}
            dividendsCount={msDividends.length}
            dividendsGrossUsd={msDividendsGrossUsd}
            embedded
          />
          {dividends.some((d) => d.broker === 'morgan_stanley') ? (
            <div className="space-y-4">
              <SubLabel label="Dividendes réinvestis (DRIP)" />
              <DividendsSummary
                dividends={dividends.filter((d) => d.broker === 'morgan_stanley')}
                footnote={
                  <>
                    Hypothèse retenue{'\u00A0'}: la colonne «{'\u00A0'}Cash{'\u00A0'}»
                    du rapport est nette de la retenue à la source US de
                    15{'\u00A0'}%, le brut et le crédit d'impôt conventionnel
                    sont reconstruits en conséquence.
                  </>
                }
              />
            </div>
          ) : (
            <p className="text-xs text-gray-500 leading-relaxed">
              Les dividendes réinvestis sont extraits automatiquement du rapport
              ci-dessus. Hypothèse retenue{'\u00A0'}: la colonne «{'\u00A0'}Cash{'\u00A0'}»
              est nette de la retenue à la source US de 15{'\u00A0'}%.
            </p>
          )}
        </BrokerSection>
      </section>
    </div>
  );
}

