import React from 'react';
import { Trash2, AlertTriangle, Coins, HelpCircle } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Alert } from './ui/alert';
import { FileDropZone } from './ui/FileDropZone';
import { BrokerExportGuide } from './guides/BrokerExportGuide';
import { transactionHistoryGuide } from './guides/transaction-history-steps';
import { DividendsSummary } from './DividendsSummary';
import { parseTransactionHistoryCsv, type DividendEvent, type CashInterestEvent } from '../lib/transaction-parser';
import { brokerLabel } from '../lib/utils';
import type { Broker } from '../lib/types';

interface DividendsImporterProps {
  /** Broker the transactions CSV is being imported from. Defaults to Fidelity. */
  broker?: Broker;
  dividends: DividendEvent[];
  cashInterest: CashInterestEvent[];
  onDividendsChange: (payload: { dividends: DividendEvent[]; cashInterest: CashInterestEvent[] }) => void;
  /**
   * When rendered inside a BrokerSection card, set this to true to drop the
   * outer Card wrapper and the broker-name preamble (the parent section
   * already provides that context).
   */
  embedded?: boolean;
}

/**
 * Import panel for the broker's Transaction History CSV. Currently only the
 * Fidelity format is parsed; other brokers will plug in via a registry in lot 3.
 * Extracts MSFT dividends + US withholding tax; interest from the cash sweep is
 * surfaced separately. Fail-soft: errors are displayed inline, existing data is
 * left untouched.
 */
export function DividendsImporter({ broker = 'fidelity', dividends, cashInterest, onDividendsChange, embedded = false }: DividendsImporterProps) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [showGuide, setShowGuide] = React.useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    setWarnings([]);
    setFileName(file.name);
    setLoading(true);
    try {
      const content = await file.text();
      const parsed = parseTransactionHistoryCsv(content);
      if (parsed.dividends.length === 0 && parsed.cashInterest.length === 0) {
        setError(`Aucun dividende reconnu dans ce fichier. Vérifiez qu'il s'agit bien d'un historique des transactions ${brokerLabel(broker)}.`);
        return;
      }
      // Persistence is handled by the parent via onDividendsChange so that
      // the merged multi-broker state stays consistent.
      onDividendsChange({ dividends: parsed.dividends, cashInterest: parsed.cashInterest });
      setWarnings(parsed.warnings);
    } catch (err) {
      setError('Impossible de lire le fichier : ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    onDividendsChange({ dividends: [], cashInterest: [] });
    setFileName(null);
    setWarnings([]);
    setError(null);
  };

  const helpButton = (
    <button
      type="button"
      onClick={() => setShowGuide(true)}
      aria-label="Voir le guide d'export"
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-primary transition-colors whitespace-nowrap shrink-0"
    >
      <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
      Voir le guide d&rsquo;export
    </button>
  );

  const hasImports = dividends.length + cashInterest.length > 0;
  const clearButton = hasImports ? (
    <button
      type="button"
      onClick={handleClear}
      aria-label="Supprimer les dividendes importés"
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors whitespace-nowrap shrink-0"
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      Supprimer
    </button>
  ) : null;

  const body = (
    <>
      {/* Prerequisite banner: replaces the bare gray paragraph so each broker
          card opens with a coloured banner of identical structure. */}
      <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
        <Coins className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          Historique des transactions {brokerLabel(broker)} (CSV) sur l&rsquo;<strong>année civile complète</strong>.
          Indispensable pour pré-remplir les cases <strong>2DC / 2AB / 2BH</strong> de la déclaration.
        </span>
      </div>

      <FileDropZone
        accept=".csv,text/csv"
        onFile={handleFile}
        loading={loading}
        compact
        prompt={`Glissez l'historique des transactions ${brokerLabel(broker)} (CSV) ici ou cliquez pour parcourir`}
        fileName={fileName}
      />

      <BrokerExportGuide
        open={showGuide}
        onClose={() => setShowGuide(false)}
        guides={[transactionHistoryGuide]}
        title="Comment exporter votre historique des transactions"
      />

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {dividends.length > 0 && !error && (
        <DividendsSummary
          dividends={dividends}
          cashInterest={cashInterest}
          fileName={fileName}
        />
      )}

      {warnings.length > 0 && (
        <Alert>
          <div className="space-y-1">
            <p className="font-medium">Avertissements à la lecture du fichier :</p>
            <ul className="list-disc ml-5 text-xs">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        </Alert>
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-end gap-2">{clearButton}{helpButton}</div>
        {body}
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="pt-5 pb-4 space-y-4">
        <div className="flex items-center justify-end gap-2">{clearButton}{helpButton}</div>
        {body}
      </CardContent>
    </Card>
  );
}
