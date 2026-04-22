import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Button } from './ui/button';
import { Alert } from './ui/alert';
import { Settings as SettingsIcon, Save, Upload, FileCheck, RefreshCw, AlertTriangle } from 'lucide-react';
import type { AppSettings, FamilyStatus, GrantInfo } from '../lib/types';
import { parseTaxNoticePdf, type TaxNoticeData } from '../lib/tax-notice-parser';
import { Tooltip } from './ui/tooltip';
import { saveVersionedSettings } from '../lib/storage';
import { formatEUR } from '../lib/utils';
import { StockExportImporter } from './StockExportImporter';

interface SettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  grants?: GrantInfo[];
  onGrantsChange?: (grants: GrantInfo[]) => void;
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

export function Settings({ settings, onSettingsChange, grants = [], onGrantsChange }: SettingsProps) {
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
    <div className="space-y-6 max-w-2xl pb-6">
      {/* StockExport import — enables automatic lot qualification */}
      <StockExportImporter
        grants={grants}
        onGrantsChange={onGrantsChange ?? (() => {})}
        defaultPlanType={local.defaultPlanType}
        onDefaultPlanTypeChange={(value) => update({ defaultPlanType: value })}
      />

      {/* PDF import — always visible */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center gap-3">
            <Upload className="h-5 w-5 text-gray-400 shrink-0" />
            <p className="flex-1 text-sm text-gray-600">
              Importez votre <strong>avis d'imposition</strong> (PDF de impots.gouv.fr) pour pré-remplir vos paramètres.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => pdfInputRef.current?.click()}
              disabled={pdfLoading}
              className="gap-1.5 shrink-0"
            >
              {pdfLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {pdfLoading ? 'Analyse…' : 'Choisir un PDF'}
            </Button>
            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handlePdfUpload}
            />
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
          {/* Section: Foyer fiscal */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Foyer fiscal</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Situation familiale</label>
                <Select
                  value={local.familyStatus}
                  onChange={(e) => update({ familyStatus: e.target.value as FamilyStatus })}
                >
                  <option value="single">Célibataire</option>
                  <option value="couple">Couple (marié / pacsé)</option>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Enfants à charge</label>
                <Input
                  type="number"
                  min="0"
                  max="20"
                  value={local.numberOfChildren}
                  onChange={(e) => update({ numberOfChildren: Math.max(0, parseInt(e.target.value) || 0) })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Parts fiscales
                  <span className="text-gray-400 font-normal ml-1 text-xs">
                    {local.taxSharesManual ? '(manuel)' : '(auto)'}
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.5"
                    min="1"
                    max="30"
                    value={local.taxShares}
                    onChange={(e) => update({ taxShares: Math.max(1, parseFloat(e.target.value) || 1), taxSharesManual: true })}
                  />
                  {local.taxSharesManual && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
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
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Section: Revenus et reports */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Revenus et reports</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                  Revenu imposable hors actions (€/an)
                  <Tooltip content="Salaires, pensions, revenus fonciers… hors plus-values mobilières. Correspond au revenu imposable de votre dernier avis d'imposition." />
                </label>
                <Input
                  type="number"
                  step="100"
                  min="0"
                  value={local.otherTaxableIncome}
                  onChange={(e) => update({ otherTaxableIncome: Math.max(0, parseFloat(e.target.value) || 0) })}
                  placeholder="Ex: 80 000"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                  Moins-values reportables (€)
                  <Tooltip content="Montant total des moins-values nettes des 10 années précédentes, non encore imputées sur des plus-values." />
                </label>
                <Input
                  type="number"
                  step="100"
                  min="0"
                  value={local.priorLosses}
                  onChange={(e) => update({ priorLosses: Math.max(0, parseFloat(e.target.value) || 0) })}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
        </CardContent>

        {/* Save bar — inside the card, visible only when dirty or just saved */}
        {(isDirty || saved) && (
          <div className="border-t bg-amber-50/50 px-6 py-3 flex items-center gap-4 rounded-b-lg">
            {isDirty && (
              <div className="flex items-center gap-2 text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Modifications non enregistrées
              </div>
            )}
            <div className="ml-auto">
              <Button onClick={handleSave} className="gap-2">
                <Save className="h-4 w-4" />
                {saved ? 'Enregistré !' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
