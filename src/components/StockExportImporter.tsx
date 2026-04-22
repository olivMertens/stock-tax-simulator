import React from 'react';
import { Upload, RefreshCw, FileCheck, Trash2, AlertTriangle, Award, HelpCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Alert } from './ui/alert';
import { Select } from './ui/select';
import { BrokerExportGuide } from './guides/BrokerExportGuide';
import { stockexportGuide } from './guides/stockexport-steps';
import { parseStockExportFile, hashGrantIds } from '../lib/stockexport-parser';
import { saveGrants, clearGrants } from '../lib/storage';
import type { GrantInfo } from '../lib/types';

type DoPlanType = 'qualified_macron' | 'non_qualified';

interface StockExportImporterProps {
  grants: GrantInfo[];
  onGrantsChange: (grants: GrantInfo[]) => void;
  /** Fallback plan type applied to DO lots when no StockExport is imported. */
  defaultPlanType?: DoPlanType;
  onDefaultPlanTypeChange?: (value: DoPlanType) => void;
}

/**
 * Import panel for the Microsoft StockExport .xlsx file.
 * Lives in Settings because StockExport is a one-time configuration artefact:
 * imported once to enable automatic lot qualification, then rarely touched.
 *
 * Fail-soft: any parsing error surfaces an inline message; existing grants and
 * lots are left untouched. Never blocks the rest of the app.
 */
export function StockExportImporter({
  grants,
  onGrantsChange,
  defaultPlanType,
  onDefaultPlanTypeChange,
}: StockExportImporterProps) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [showGuide, setShowGuide] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setWarnings([]);
    setFileName(file.name);
    setLoading(true);
    try {
      const parsed = await parseStockExportFile(file);
      if (parsed.grants.length === 0) {
        setError('Aucun grant reconnu dans ce fichier. Vérifiez qu\'il s\'agit bien d\'un export Microsoft StockExport.');
        return;
      }
      await hashGrantIds(parsed);
      saveGrants(parsed.grants);
      onGrantsChange(parsed.grants);
      setWarnings(parsed.warnings);
    } catch (err) {
      setError('Impossible de lire le fichier : ' + (err as Error).message);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleClear = () => {
    clearGrants();
    onGrantsChange([]);
    setFileName(null);
    setWarnings([]);
    setError(null);
  };

  const totals = React.useMemo(() => {
    return grants.reduce(
      (acc, g) => ({
        awarded: acc.awarded + g.totalAwarded,
        vested: acc.vested + g.totalVested,
        unvested: acc.unvested + g.totalUnvested,
      }),
      { awarded: 0, vested: 0, unvested: 0 },
    );
  }, [grants]);

  return (
    <Card>
      <CardContent className="pt-5 pb-4 space-y-4">
        <div className="flex items-start gap-3">
          <Award className="h-5 w-5 text-gray-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-sm text-gray-600">
            <p>
              Importez votre <strong>StockExport Microsoft</strong> (.xlsx) pour qualifier automatiquement
              vos lots (AGA Macron, Stock Award, ESPP…) à partir du type réel de chaque grant.
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Sans cet import, l'app utilise des valeurs par défaut modifiables à la main. Les identifiants
              de grant ne sont jamais stockés en clair — uniquement un hash SHA-256.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={loading}
            className="gap-1.5"
          >
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {loading ? 'Analyse…' : 'Choisir un fichier'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowGuide(true)}
            className="gap-1.5"
            aria-label="Afficher le guide de téléchargement du StockExport"
          >
            <HelpCircle className="h-4 w-4" />
            Comment le télécharger ?
          </Button>
          {grants.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="gap-1.5 text-red-600 hover:text-red-700 ml-auto"
            >
              <Trash2 className="h-4 w-4" />
              Supprimer
            </Button>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={handleFile}
        />

        <BrokerExportGuide
          open={showGuide}
          onClose={() => setShowGuide(false)}
          guides={[stockexportGuide]}
          title="Comment télécharger votre StockExport"
        />

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {grants.length > 0 && !error && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
            <div className="flex items-center gap-2 mb-3">
              <FileCheck className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-blue-800">
                {grants.length} grant{grants.length > 1 ? 's' : ''} importé{grants.length > 1 ? 's' : ''}
                {fileName ? ` depuis ${fileName}` : ''}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <Totals label="Total attribué" value={totals.awarded} />
              <Totals label="Vested" value={totals.vested} />
              <Totals label="Unvested" value={totals.unvested} />
            </div>
            <ul className="space-y-1 text-xs text-gray-700">
              {grants.map((g) => (
                <li key={g.grantIdHash} className="flex items-center justify-between gap-2 border-t border-blue-100 pt-1 first:border-t-0 first:pt-0">
                  <span className="font-medium">{g.awardType}</span>
                  <span className="text-gray-500">
                    {g.awardDate.toLocaleDateString('fr-FR')} · {planTypeLabel(g.planType)} · {g.totalVested}/{g.totalAwarded} vested
                  </span>
                </li>
              ))}
            </ul>
          </div>
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

        {defaultPlanType !== undefined && onDefaultPlanTypeChange && (
          <div className="border-t border-gray-100 pt-3 mt-1">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Régime par défaut — lots DO sans StockExport
            </label>
            <div className="max-w-xs">
              <Select
                value={defaultPlanType}
                onChange={(e) => onDefaultPlanTypeChange(e.target.value as DoPlanType)}
              >
                <option value="qualified_macron">Qualifié (AGA)</option>
                <option value="non_qualified">Non qualifié</option>
              </Select>
              <p className="text-xs text-gray-400 mt-1">
                {grants.length > 0
                  ? 'Les lots déjà réconciliés via le StockExport conservent leur type. Cette valeur ne s\u2019applique qu\u2019aux lots DO non réconciliés.'
                  : 'Appliqué à tous les lots DO tant qu\u2019aucun StockExport n\u2019est importé.'}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Totals({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-md border border-blue-100 p-2 text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-900">{Math.round(value * 100) / 100}</div>
    </div>
  );
}

function planTypeLabel(p: GrantInfo['planType']): string {
  switch (p) {
    case 'qualified_macron': return 'AGA Macron';
    case 'qualified_pre_macron': return 'AGA pré-Macron';
    case 'non_qualified': return 'Non qualifié';
  }
}
