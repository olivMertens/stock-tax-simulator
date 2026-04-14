import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Button } from './ui/button';
import { Alert } from './ui/alert';
import { Settings as SettingsIcon, Save, Upload, FileCheck, RefreshCw, AlertTriangle } from 'lucide-react';
import type { AppSettings, FamilyStatus } from '../lib/types';
import { parseTaxNoticePdf, type TaxNoticeData } from '../lib/tax-notice-parser';
import { saveVersionedSettings } from '../lib/storage';
import { formatEUR } from '../lib/utils';

interface SettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

function calculateTaxShares(familyStatus: FamilyStatus, numberOfChildren: number): number {
  let shares = familyStatus === 'couple' ? 2 : 1;
  if (numberOfChildren <= 2) {
    shares += numberOfChildren * 0.5;
  } else {
    shares += 1; // 2 first children = 1
    shares += (numberOfChildren - 2) * 1; // 1 per additional child
  }
  return shares;
}

export function Settings({ settings, onSettingsChange }: SettingsProps) {
  const [local, setLocal] = React.useState(settings);
  const [saved, setSaved] = React.useState(false);
  const [parsedNotice, setParsedNotice] = React.useState<TaxNoticeData | null>(null);
  const [pdfLoading, setPdfLoading] = React.useState(false);
  const [pdfError, setPdfError] = React.useState<string | null>(null);
  const pdfInputRef = React.useRef<HTMLInputElement>(null);

  const update = (patch: Partial<AppSettings>) => {
    const next = { ...local, ...patch };

    // Auto-calculate tax shares unless manual
    if (!next.taxSharesManual && ('familyStatus' in patch || 'numberOfChildren' in patch)) {
      next.taxShares = calculateTaxShares(next.familyStatus, next.numberOfChildren);
    }

    setLocal(next);
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfError(null);
    setPdfLoading(true);
    try {
      const data = await parseTaxNoticePdf(file);
      setParsedNotice(data);
      if (!data.taxShares && !data.revenuImposable && !data.familyStatus) {
        setPdfError('Aucune donn\u00e9e reconnue dans ce PDF. V\u00e9rifiez qu\'il s\'agit bien d\'un avis d\'imposition de impots.gouv.fr.');
      }
    } catch (err) {
      setPdfError('Erreur lors de la lecture du PDF : ' + (err as Error).message);
    } finally {
      setPdfLoading(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  const applyNoticeData = () => {
    if (!parsedNotice) return;
    const patch: Partial<AppSettings> = {};
    if (parsedNotice.familyStatus) patch.familyStatus = parsedNotice.familyStatus;
    if (parsedNotice.taxShares) {
      patch.taxShares = parsedNotice.taxShares;
      patch.taxSharesManual = true;
    }
    if (parsedNotice.numberOfChildren !== undefined) patch.numberOfChildren = parsedNotice.numberOfChildren;
    if (parsedNotice.revenuImposable) patch.otherTaxableIncome = parsedNotice.revenuImposable;
    if (parsedNotice.fiscalYear) patch.fiscalYear = parsedNotice.fiscalYear;
    update(patch);
    setParsedNotice(null);
  };

  const handleSave = () => {
    onSettingsChange(local);
    saveVersionedSettings('appSettings', local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const isDirty = JSON.stringify(local) !== JSON.stringify(settings);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Tax notice PDF upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importer un avis d'imposition
          </CardTitle>
          <CardDescription>
            Uploadez votre avis d'imposition (PDF de impots.gouv.fr) pour pré-remplir automatiquement vos paramètres.
            Le fichier est traité localement dans votre navigateur et n'est jamais envoyé à un serveur.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => pdfInputRef.current?.click()}
              disabled={pdfLoading}
              className="gap-1.5"
            >
              {pdfLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {pdfLoading ? 'Analyse en cours…' : 'Choisir un PDF'}
            </Button>
            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handlePdfUpload}
            />
            <span className="text-xs text-gray-400">Avis d'imposition .pdf uniquement</span>
          </div>

          {pdfError && (
            <p className="mt-3 text-sm text-red-600">{pdfError}</p>
          )}

          {parsedNotice && !pdfError && (
            <div className="mt-4 space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileCheck className="h-4 w-4 text-blue-600" />
                  <span className="font-medium text-blue-800 text-sm">Données extraites de l'avis</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {parsedNotice.fiscalYear && (
                    <div>
                      <span className="text-gray-500">Année fiscale :</span>{' '}
                      <strong>{parsedNotice.fiscalYear}</strong>
                    </div>
                  )}
                  {parsedNotice.familyStatus && (
                    <div>
                      <span className="text-gray-500">Situation :</span>{' '}
                      <strong>{parsedNotice.familyStatus === 'couple' ? 'Couple' : 'Célibataire'}</strong>
                    </div>
                  )}
                  {parsedNotice.taxShares && (
                    <div>
                      <span className="text-gray-500">Parts fiscales :</span>{' '}
                      <strong>{parsedNotice.taxShares}</strong>
                    </div>
                  )}
                  {parsedNotice.numberOfChildren !== undefined && (
                    <div>
                      <span className="text-gray-500">Personnes à charge :</span>{' '}
                      <strong>{parsedNotice.numberOfChildren}</strong>
                    </div>
                  )}
                  {parsedNotice.revenuImposable && (
                    <div>
                      <span className="text-gray-500">Revenu imposable :</span>{' '}
                      <strong>{formatEUR(parsedNotice.revenuImposable)}</strong>
                    </div>
                  )}
                  {parsedNotice.revenuFiscalReference && (
                    <div>
                      <span className="text-gray-500">Revenu fiscal de référence :</span>{' '}
                      <strong>{formatEUR(parsedNotice.revenuFiscalReference)}</strong>
                    </div>
                  )}
                  {parsedNotice.revenuBrutGlobal && (
                    <div>
                      <span className="text-gray-500">Revenu brut global :</span>{' '}
                      <strong>{formatEUR(parsedNotice.revenuBrutGlobal)}</strong>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-4">
                  <Button size="sm" onClick={applyNoticeData} className="gap-1">
                    <FileCheck className="h-3.5 w-3.5" />
                    Appliquer ces valeurs
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setParsedNotice(null)}>
                    Ignorer
                  </Button>
                </div>
              </div>
              <Alert>
                Vérifiez les valeurs extraites avant de les appliquer. Le <strong>revenu imposable</strong> sera utilisé comme base pour le calcul du barème progressif.
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            Paramètres fiscaux
          </CardTitle>
          <CardDescription>
            Configurez vos paramètres pour une estimation plus précise.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Fiscal year */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Année fiscale</label>
            <Input
              type="number"
              value={local.fiscalYear}
              min="2015"
              max="2030"
              onChange={(e) => {
                const v = parseInt(e.target.value);
                if (v && v >= 2015 && v <= 2030) update({ fiscalYear: v });
              }}
              className="w-32"
            />
          </div>

          {/* Family status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Situation familiale</label>
            <Select
              value={local.familyStatus}
              onChange={(e) => update({ familyStatus: e.target.value as FamilyStatus })}
              className="w-64"
            >
              <option value="single">Célibataire</option>
              <option value="couple">Couple (marié / pacsé)</option>
            </Select>
          </div>

          {/* Children */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre d'enfants à charge</label>
            <Input
              type="number"
              min="0"
              max="20"
              value={local.numberOfChildren}
              onChange={(e) => update({ numberOfChildren: Math.max(0, parseInt(e.target.value) || 0) })}
              className="w-32"
            />
          </div>

          {/* Tax shares */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre de parts fiscales
              <span className="text-gray-400 font-normal ml-2">
                {local.taxSharesManual ? '(manuel)' : '(calculé automatiquement)'}
              </span>
            </label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                step="0.5"
                min="1"
                max="30"
                value={local.taxShares}
                onChange={(e) => update({ taxShares: Math.max(1, parseFloat(e.target.value) || 1), taxSharesManual: true })}
                className="w-32"
              />
              {local.taxSharesManual && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    update({
                      taxSharesManual: false,
                      taxShares: calculateTaxShares(local.familyStatus, local.numberOfChildren),
                    })
                  }
                >
                  Recalculer
                </Button>
              )}
            </div>
          </div>

          {/* Other taxable income */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Revenu imposable hors actions (salaire net imposable annuel, €)
            </label>
            <Input
              type="number"
              step="100"
              min="0"
              value={local.otherTaxableIncome}
              onChange={(e) => update({ otherTaxableIncome: Math.max(0, parseFloat(e.target.value) || 0) })}
              className="w-48"
              placeholder="Ex: 80000"
            />
          </div>

          {/* Default plan type for DO */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Régime par défaut des Stock Awards (DO)
            </label>
            <Select
              value={local.defaultPlanType}
              onChange={(e) =>
                update({ defaultPlanType: e.target.value as 'qualified_macron' | 'non_qualified' })
              }
              className="w-64"
            >
              <option value="qualified_macron">Qualifié (AGA)</option>
              <option value="non_qualified">Non qualifié</option>
            </Select>
            <p className="text-xs text-gray-400 mt-1">
              Appliqué à l'import pour les lots DO. Modifiable lot par lot ensuite.
            </p>
          </div>

          {/* Prior losses */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Moins-values reportables des années antérieures (€)
            </label>
            <Input
              type="number"
              step="100"
              min="0"
              value={local.priorLosses}
              onChange={(e) => update({ priorLosses: Math.max(0, parseFloat(e.target.value) || 0) })}
              className="w-48"
              placeholder="0"
            />
          </div>

          {/* Exchange rate (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Taux de change EUR/USD (optionnel)
            </label>
            <Input
              type="number"
              step="0.0001"
              min="0"
              value={local.exchangeRate || ''}
              onChange={(e) => update({ exchangeRate: parseFloat(e.target.value) || undefined })}
              className="w-48"
              placeholder="Le CSV est déjà en EUR"
            />
          </div>

          {isDirty && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex items-center gap-2 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Vous avez des modifications non enregistrées.
            </div>
          )}

          <Button onClick={handleSave} className="gap-2">
            <Save className="h-4 w-4" />
            {saved ? 'Enregistré !' : isDirty ? 'Enregistrer *' : 'Enregistrer'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
