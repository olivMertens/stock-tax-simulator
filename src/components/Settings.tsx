import React from 'react';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Button } from './ui/button';
import { Settings as SettingsIcon, Save, AlertTriangle, FileText, ShieldCheck, Users } from 'lucide-react';
import type { AppSettings, FamilyStatus, StockLot, SoldLot, SavedSimulation } from '../lib/types';
import { Tooltip } from './ui/tooltip';
import { saveVersionedSettings } from '../lib/storage';
import { TaxNoticeImporter } from './TaxNoticeImporter';
import { BackupPanel } from './BackupPanel';
import type { ImportResult } from '../lib/backup';

interface SettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  defaults?: AppSettings;
  lots?: StockLot[];
  soldLots?: SoldLot[];
  savedSimulations?: SavedSimulation[];
  onBackupImport?: (result: ImportResult) => void;
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

interface SectionHeaderProps {
  step: number;
  icon: React.ReactNode;
  title: string;
  description: string;
}

/** Top-level section heading, mirrors DataPanel's. */
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

interface AccentCardProps {
  title: string;
  icon: React.ReactNode;
  stripe: string;
  header: string;
  iconColor: string;
  children: React.ReactNode;
  /** Optional footer rendered below the body, inside the card. */
  footer?: React.ReactNode;
}

/**
 * Card with the same visual grammar as DataPanel: 4px coloured left stripe,
 * tinted header bar with a title + icon on the right, white body.
 */
function AccentCard({ title, icon, stripe, header, iconColor, children, footer }: AccentCardProps) {
  return (
    <div className={`rounded-xl border border-gray-200 border-l-4 ${stripe} bg-white shadow-sm overflow-hidden`}>
      <div className={`flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100 ${header}`}>
        <h4 className="text-base font-semibold text-gray-900">{title}</h4>
        <div className={`shrink-0 ${iconColor}`}>{icon}</div>
      </div>
      <div className="p-5">{children}</div>
      {footer}
    </div>
  );
}

export function Settings({ settings, onSettingsChange, defaults, lots = [], soldLots = [], savedSimulations = [], onBackupImport }: SettingsProps) {
  const [local, setLocal] = React.useState(settings);
  const [saved, setSaved] = React.useState(false);

  const update = (patch: Partial<AppSettings>) => {
    const next = { ...local, ...patch };

    // Auto-calculate tax shares unless manual
    if (!next.taxSharesManual && ('familyStatus' in patch || 'numberOfChildren' in patch)) {
      next.taxShares = calculateTaxShares(next.familyStatus, next.numberOfChildren);
    }

    setLocal(next);
  };

  // Sync when settings prop changes (e.g. tax notice import from Data tab)
  React.useEffect(() => {
    setLocal(settings);
  }, [settings]);

  const handleSave = () => {
    onSettingsChange(local);
    saveVersionedSettings('appSettings', local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const isDirty = JSON.stringify(local) !== JSON.stringify(settings);

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-6">
      <header className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
          <SettingsIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Paramètres</h2>
          <p className="text-sm text-gray-600">
            Configurez votre situation fiscale, importez votre avis d'imposition pour pré-remplir, et gérez vos sauvegardes locales.
          </p>
        </div>
      </header>

      {/* 1. Avis d'imposition (pré-remplissage) */}
      <section className="space-y-4">
        <SectionHeader
          step={1}
          icon={<FileText className="h-5 w-5" />}
          title="Avis d'imposition"
          description="Importez votre avis d'imposition (PDF d'impots.gouv.fr) pour pré-remplir automatiquement la situation familiale, les parts et le revenu imposable."
        />
        <AccentCard
          title="Pré-remplissage automatique"
          icon={<FileText className="h-5 w-5" />}
          stripe="border-l-amber-500"
          header="bg-amber-50/60"
          iconColor="text-amber-600"
        >
          <TaxNoticeImporter settings={settings} onSettingsChange={onSettingsChange} embedded />
        </AccentCard>
      </section>

      {/* 2. Paramètres fiscaux */}
      <section className="space-y-4">
        <SectionHeader
          step={2}
          icon={<Users className="h-5 w-5" />}
          title="Foyer fiscal & revenus"
          description="Situation familiale, parts fiscales, revenu imposable hors actions et moins-values reportables. Ces valeurs alimentent toutes les simulations."
        />
        <AccentCard
          title="Configuration manuelle"
          icon={<SettingsIcon className="h-5 w-5" />}
          stripe="border-l-sky-500"
          header="bg-sky-50/60"
          iconColor="text-sky-600"
          footer={
            (isDirty || saved) && (
              <div className="border-t bg-amber-50/50 px-5 py-3 flex items-center gap-4">
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
            )
          }
        >
          <div className="space-y-6">
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
          </div>
        </AccentCard>
      </section>

      {/* 3. Sauvegarde locale */}
      {onBackupImport && defaults && (
        <section className="space-y-4">
          <SectionHeader
            step={3}
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Sauvegarde & restauration"
            description="Vos données sont stockées localement dans ce navigateur. Exportez une sauvegarde pour les transférer sur un autre appareil ou les conserver en sécurité."
          />
          <AccentCard
            title="Export & import JSON"
            icon={<ShieldCheck className="h-5 w-5" />}
            stripe="border-l-slate-500"
            header="bg-slate-50/60"
            iconColor="text-slate-600"
          >
            <BackupPanel
              current={{ settings, lots, soldLots, savedSimulations }}
              defaults={defaults}
              onImport={onBackupImport}
              embedded
            />
          </AccentCard>
        </section>
      )}
    </div>
  );
}
