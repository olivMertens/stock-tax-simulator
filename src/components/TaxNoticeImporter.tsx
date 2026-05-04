import React from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Alert } from './ui/alert';
import { FileCheck } from 'lucide-react';
import { FileDropZone } from './ui/FileDropZone';
import { parseTaxNoticePdf, type TaxNoticeData } from '../lib/tax-notice-parser';
import { saveVersionedSettings } from '../lib/storage';
import { formatEUR } from '../lib/utils';
import type { AppSettings } from '../lib/types';

interface TaxNoticeImporterProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  /** When true, render bare body without the outer Card (parent provides one). */
  embedded?: boolean;
}

/**
 * Imports a French tax notice PDF and lets the user apply extracted values
 * (family status, shares, taxable income) directly to the current fiscal
 * settings. Used in the Data tab; complements the manual form in Settings.
 */
export function TaxNoticeImporter({ settings, onSettingsChange, embedded = false }: TaxNoticeImporterProps) {
  const [parsed, setParsed] = React.useState<TaxNoticeData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setFileName(file.name);
    setLoading(true);
    try {
      const data = await parseTaxNoticePdf(file);
      setParsed(data);
      if (!data.taxShares && !data.revenuImposable && !data.familyStatus) {
        setError("Aucune donnée reconnue dans ce PDF. Vérifiez qu'il s'agit bien d'un avis d'imposition de impots.gouv.fr.");
      }
    } catch (err) {
      setError('Erreur lors de la lecture du PDF : ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const applyNoticeData = () => {
    if (!parsed) return;
    const patch: Partial<AppSettings> = {};
    if (parsed.familyStatus) patch.familyStatus = parsed.familyStatus;
    if (parsed.taxShares) {
      patch.taxShares = parsed.taxShares;
      patch.taxSharesManual = true;
    }
    if (parsed.numberOfChildren !== undefined) patch.numberOfChildren = parsed.numberOfChildren;
    if (parsed.revenuImposable) patch.otherTaxableIncome = parsed.revenuImposable;
    const next = { ...settings, ...patch };
    onSettingsChange(next);
    saveVersionedSettings('appSettings', next);
    setParsed(null);
  };

  const body = (
    <>
      <p className="text-sm text-gray-600">
        Importez votre <strong>avis d'imposition</strong> (PDF de impots.gouv.fr) pour
        pré-remplir automatiquement situation familiale, parts et revenu imposable.
      </p>

      <FileDropZone
        accept=".pdf,application/pdf"
        onFile={handleFile}
        loading={loading}
        prompt="Glissez votre avis d'imposition (PDF) ici ou cliquez pour parcourir"
        fileName={fileName}
      />

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {parsed && !error && (
          <div className="mt-4 space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileCheck className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-blue-800 text-sm">Données extraites de l'avis</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {parsed.familyStatus && (
                  <div>
                    <span className="text-gray-500">Situation :</span>{' '}
                    <strong>{parsed.familyStatus === 'couple' ? 'Couple' : 'Célibataire'}</strong>
                  </div>
                )}
                {parsed.taxShares && (
                  <div>
                    <span className="text-gray-500">Parts fiscales :</span> <strong>{parsed.taxShares}</strong>
                  </div>
                )}
                {parsed.numberOfChildren !== undefined && (
                  <div>
                    <span className="text-gray-500">Personnes à charge :</span>{' '}
                    <strong>{parsed.numberOfChildren}</strong>
                  </div>
                )}
                {parsed.revenuImposable && (
                  <div>
                    <span className="text-gray-500">Revenu imposable :</span>{' '}
                    <strong>{formatEUR(parsed.revenuImposable)}</strong>
                  </div>
                )}
                {parsed.revenuFiscalReference && (
                  <div>
                    <span className="text-gray-500">Revenu fiscal de référence :</span>{' '}
                    <strong>{formatEUR(parsed.revenuFiscalReference)}</strong>
                  </div>
                )}
                {parsed.revenuBrutGlobal && (
                  <div>
                    <span className="text-gray-500">Revenu brut global :</span>{' '}
                    <strong>{formatEUR(parsed.revenuBrutGlobal)}</strong>
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="sm" onClick={applyNoticeData} className="gap-1">
                  <FileCheck className="h-3.5 w-3.5" />
                  Appliquer ces valeurs
                </Button>
                <Button variant="outline" size="sm" onClick={() => setParsed(null)}>
                  Ignorer
                </Button>
              </div>
            </div>
            <Alert>
              Vérifiez les valeurs avant d'appliquer. Le <strong>revenu imposable</strong>
              sera utilisé comme base pour le calcul du barème progressif.
            </Alert>
          </div>
        )}
    </>
  );

  if (embedded) return body;
  return (
    <Card>
      <CardContent className="pt-5 pb-4">{body}</CardContent>
    </Card>
  );
}
