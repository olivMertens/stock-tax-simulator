import { X, ChevronDown, ChevronRight } from 'lucide-react';
import React from 'react';

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="border rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        {title}
      </button>
      {open && <div className="px-4 pb-4 text-sm text-gray-700 space-y-3">{children}</div>}
    </div>
  );
}

function Rate({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 border-b border-gray-100 last:border-0">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

export function TaxRulesPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-xl bg-white shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-gray-900">Règles fiscales — Aide-mémoire</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          {/* ---- ESPP ---- */}
          <Section title="ESPP — Plan d'achat d'actions avec rabais">
            <p>
              Le rabais (typiquement 10 %) est un <strong>gain d'acquisition</strong> imposé comme du <strong>salaire</strong> l'année de l'achat, prélevé à la source.
            </p>
            <div className="rounded bg-gray-50 p-3 space-y-1">
              <Rate label="Barème progressif (0 → 45 %)" value="salaire" />
              <Rate label="Cotisations sociales" value="incluses en paie" />
              <Rate label="CEHR (si applicable)" value="3 % / 4 %" />
            </div>
            <p className="text-xs text-gray-500">
              Déclaration : 2042 — cases 1AJ/1BJ (prérempli). PAS en 8HV/8IV.
            </p>
          </Section>

          {/* ---- Non-qualifiés ---- */}
          <Section title="Stock Awards non qualifiés — Imposition au vesting">
            <p>
              Le gain d'acquisition (= valeur au vesting) est imposé comme du <strong>salaire</strong> l'année du vesting, prélevé à la source via le mécanisme <em>Sell-to-cover</em>.
            </p>
            <div className="rounded bg-gray-50 p-3 space-y-1">
              <Rate label="Barème progressif (0 → 45 %)" value="salaire" />
              <Rate label="Cotisations sociales" value="incluses en paie" />
              <Rate label="CEHR (si applicable)" value="3 % / 4 %" />
            </div>
            <p className="text-xs text-gray-500">
              Déclaration : 2042 — cases 1AJ/1BJ (prérempli). PAS en 8HV/8IV.
            </p>
            <p>
              À la <strong>cession</strong>, seule la <strong>plus/moins-value</strong> (prix de vente − valeur au vesting) est imposée (voir section PV de cession).
            </p>
          </Section>

          {/* ---- Qualifiés Macron I ---- */}
          <Section title="Stock Awards qualifiés — Régime Macron I (attribution ≥ 01/01/2018)">
            <p>
              Le gain d'acquisition est imposé <strong>à la cession</strong> (pas au vesting). Deux fractions :
            </p>
            <div className="rounded bg-blue-50 p-3 space-y-2 text-sm">
              <p className="font-semibold text-blue-900">Fraction ≤ 300 000 €</p>
              <div className="space-y-1">
                <Rate label="IR : barème progressif après abattement" value="0 → 45 %" />
                <Rate label="Abattement fixe (sans condition de durée)" value="50 %" />
                <Rate label="PS (sur montant brut, sans abattement)" value="18,6 %" />
              </div>
            </div>
            <div className="rounded bg-amber-50 p-3 space-y-2 text-sm">
              <p className="font-semibold text-amber-900">Fraction &gt; 300 000 €</p>
              <div className="space-y-1">
                <Rate label="IR : barème progressif (pas d'abattement)" value="0 → 45 %" />
                <Rate label="Cotisations sociales (activité)" value="11,1 %" />
                <Rate label="Contribution salariale" value="10 %" />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Si la MV de cession est supérieure au prix de vente, elle s'impute sur le gain d'acquisition.
            </p>
            <p className="text-xs text-gray-500">
              Déclaration : 2042-C — cases 1TZ (≤ 300k après abattement), 1WZ (abattement), 1TT (&gt; 300k).
            </p>
            <p className="text-xs text-gray-500">
              Source : <a href="https://www.impots.gouv.fr/particulier/questions/mon-entreprise-ma-attribue-des-actions-gratuites-comment-sera-impose-le-gain" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-800">impots.gouv.fr</a>
            </p>
          </Section>

          {/* ---- Qualifiés pré-Macron ---- */}
          {/* ---- Qualifiés transitoire 31/12/2016 → 31/12/2017 ---- */}
          <Section title="Stock Awards qualifiés — Transitoire (31/12/2016 → 31/12/2017)">
            <p>
              Le gain d'acquisition est imposé <strong>à la cession</strong>. Deux fractions avec abattement pour durée de détention :
            </p>
            <div className="rounded bg-blue-50 p-3 space-y-2 text-sm">
              <p className="font-semibold text-blue-900">Fraction ≤ 300 000 €</p>
              <div className="space-y-1">
                <Rate label="IR : barème progressif après abattement" value="0 → 45 %" />
                <Rate label="Abattement (détention 2–8 ans depuis vesting)" value="50 %" />
                <Rate label="Abattement (détention > 8 ans)" value="65 %" />
                <Rate label="PS (patrimoine, sur montant brut)" value="18,6 %" />
              </div>
            </div>
            <div className="rounded bg-amber-50 p-3 space-y-2 text-sm">
              <p className="font-semibold text-amber-900">Fraction &gt; 300 000 €</p>
              <div className="space-y-1">
                <Rate label="IR : barème progressif (pas d'abattement)" value="0 → 45 %" />
                <Rate label="Cotisations sociales (activité)" value="9,7 %" />
                <Rate label="Contribution salariale" value="10 %" />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              La durée de détention est appréciée entre la date d'acquisition définitive et la date de cession.
            </p>
            <p className="text-xs text-gray-500">
              Déclaration : 2042-C — cases 1TZ (≤ 300k après abattement), 1WZ (abattement), 1TT (&gt; 300k).
            </p>
            <p className="text-xs text-gray-500">
              Source : <a href="https://www.impots.gouv.fr/particulier/questions/mon-entreprise-ma-attribue-des-actions-gratuites-comment-sera-impose-le-gain" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-800">impots.gouv.fr</a>
            </p>
          </Section>

          {/* ---- Qualifiés 08/08/2015 → 30/12/2016 ---- */}
          <Section title="Stock Awards qualifiés — Pré-Macron (08/08/2015 → 30/12/2016)">
            <p>
              Le gain d'acquisition bénéficie des abattements pour durée de détention (comme les plus-values mobilières).
            </p>
            <div className="rounded bg-gray-50 p-3 space-y-1">
              <Rate label="IR : barème progressif après abattement" value="0 → 45 %" />
              <Rate label="Abattement (détention 2–8 ans depuis vesting)" value="50 %" />
              <Rate label="Abattement (détention > 8 ans)" value="65 %" />
              <Rate label="PS (patrimoine, sur montant brut)" value="18,6 %" />
            </div>
            <p className="text-xs text-gray-500">
              Pas de contribution salariale. Déclaration : 2042-C — mêmes cases que les plus-values mobilières.
            </p>
            <p className="text-xs text-gray-500">
              Source : <a href="https://www.impots.gouv.fr/particulier/questions/mon-entreprise-ma-attribue-des-actions-gratuites-comment-sera-impose-le-gain" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-800">impots.gouv.fr</a>
            </p>
          </Section>

          {/* ---- Qualifiés 28/09/2012 → 07/08/2015 ---- */}
          <Section title="Stock Awards qualifiés — Pré-Macron (28/09/2012 → 07/08/2015)">
            <div className="rounded bg-gray-50 p-3 space-y-1">
              <Rate label="Barème progressif (traitements & salaires, sans abattement)" value="0 → 45 %" />
              <Rate label="PS (activité)" value="9,7 %" />
              <Rate label="Contribution salariale" value="10 %" />
              <Rate label="CEHR (si applicable)" value="3 % / 4 %" />
            </div>
            <p className="text-xs text-gray-500">
              Taux maximum global : ~66 %. Déclaration : 2042-C — cases 1TT/1UT.
            </p>
            <p className="text-xs text-gray-500">
              Source : <a href="https://www.impots.gouv.fr/particulier/questions/mon-entreprise-ma-attribue-des-actions-gratuites-comment-sera-impose-le-gain" target="_blank" rel="noopener noreferrer" className="underline text-blue-600 hover:text-blue-800">impots.gouv.fr</a>
            </p>
          </Section>

          <Section title="Stock Awards qualifiés — Avant le 28/09/2012">
            <div className="rounded bg-gray-50 p-3 space-y-1">
              <Rate label="Option 1 : taux forfaitaire" value="30 %" />
              <Rate label="Option 2 : barème progressif" value="0 → 45 %" />
              <Rate label="PS (patrimoine)" value="18,6 %" />
              <Rate label="Contribution salariale (si attribué après 16/10/2007)" value="10 %" />
              <Rate label="CEHR (si applicable)" value="3 % / 4 %" />
            </div>
            <p className="text-xs text-gray-500">
              Taux maximum global : ~62,6 %. Déclaration : 2042-C — cases 3VI / 3VJ-VK / 3VN.
            </p>
          </Section>

          {/* ---- PV de cession ---- */}
          <Section title="Plus/moins-values de cession">
            <p>
              PV = prix de cession − prix d'acquisition (= valeur au vesting, converti en EUR au taux BCE du jour).
            </p>
            <div className="rounded bg-green-50 p-3 space-y-2 text-sm">
              <p className="font-semibold text-green-900">Option PFU (Flat Tax)</p>
              <div className="space-y-1">
                <Rate label="IR forfaitaire" value="12,8 %" />
                <Rate label="PS" value="18,6 %" />
                <Rate label="Total" value="31,4 %" />
              </div>
              <p className="text-xs text-green-700">Pas d'abattement pour durée de détention. Pas de CSG déductible.</p>
            </div>
            <div className="rounded bg-indigo-50 p-3 space-y-2 text-sm">
              <p className="font-semibold text-indigo-900">Option barème progressif (case 2OP)</p>
              <div className="space-y-1">
                <Rate label="IR barème progressif" value="0 → 45 %" />
                <Rate label="PS (sur PV avant abattement)" value="18,6 %" />
                <Rate label="CSG déductible l'année suivante" value="8,2 %" />
              </div>
              <p className="text-xs text-indigo-700">
                Abattement durée de détention (titres acquis avant 01/01/2018 uniquement) : 50 % (2–8 ans), 65 % (&gt; 8 ans).
              </p>
            </div>
            <p className="text-xs text-gray-500">
              Les moins-values sont reportables pendant 10 ans et imputables sur les plus-values futures.
            </p>
            <p className="text-xs text-gray-500">
              Déclaration : annexe 2074, puis 2042 — cases 3VG (PV) / 3VH (MV), 3SG (abattement).
            </p>
          </Section>

          {/* ---- Dividendes ---- */}
          <Section title="Dividendes (actions conservées à l'étranger)">
            <p>
              Dividendes trimestriels imposables en France. Retenue à la source US : 15 % (crédit d'impôt via convention).
            </p>
            <div className="rounded bg-gray-50 p-3 space-y-2 text-sm">
              <p className="font-semibold">PFU : 12,8 % IR + 18,6 % PS = 31,4 %</p>
              <p className="font-semibold">Barème (option) : abattement 40 % sur IR, PS 18,6 % sans abattement, CSG déductible 8,2 %</p>
            </div>
            <p className="text-xs text-gray-500">
              Si le broker ne prélève pas : formulaire <strong>2778-DIV</strong> + paiement au plus tard le 15 du mois suivant la perception.
            </p>
            <p className="text-xs text-gray-500">
              Dispense possible si RFR N-2 &lt; 50k€ (célibataire) / 75k€ (couple).
            </p>
            <p className="text-xs text-gray-500">
              Déclaration annuelle : annexe 2047, puis 2042 — cases 2DC, 2CG/2BH, 2CK (crédit d'impôt), 2OP si barème.
            </p>
          </Section>

          {/* ---- CEHR ---- */}
          <Section title="CEHR — Contribution Exceptionnelle sur les Hauts Revenus">
            <div className="rounded bg-gray-50 p-3 space-y-1">
              <p className="font-semibold text-sm mb-2">Célibataire</p>
              <Rate label="250 001 € → 500 000 €" value="3 %" />
              <Rate label="Au-delà de 500 000 €" value="4 %" />
            </div>
            <div className="rounded bg-gray-50 p-3 space-y-1 mt-2">
              <p className="font-semibold text-sm mb-2">Couple (imposition commune)</p>
              <Rate label="500 001 € → 1 000 000 €" value="3 %" />
              <Rate label="Au-delà de 1 000 000 €" value="4 %" />
            </div>
            <p className="text-xs text-gray-500">
              Assise sur le Revenu Fiscal de Référence (RFR). S'applique sans abattement.
            </p>
          </Section>

          {/* ---- Obligations déclaratives ---- */}
          <Section title="Obligations déclaratives — Récapitulatif">
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="shrink-0 font-semibold text-primary">①</span>
                <span><strong>Vesting non qualifié / ESPP</strong> → 2042 (1AJ/1BJ) + PAS (8HV/8IV) — prérempli, à vérifier.</span>
              </div>
              <div className="flex gap-2">
                <span className="shrink-0 font-semibold text-primary">②</span>
                <span><strong>Dividendes</strong> → 2778-DIV chaque trimestre (si broker ne prélève pas) + 2047 + 2042 (2DC/2CG, 2CK, 2OP si barème).</span>
              </div>
              <div className="flex gap-2">
                <span className="shrink-0 font-semibold text-primary">③</span>
                <span><strong>Cession d'actions</strong> → annexe 2074 + 2042 (3VG/3VH, 3SG) + 2042-C (1TZ/1WZ/1TT si qualifié Macron).</span>
              </div>
              <div className="flex gap-2">
                <span className="shrink-0 font-semibold text-primary">④</span>
                <span><strong>Compte à l'étranger</strong> → annexe 3916 + case 8UU. Amende : 1 500 € / 10 000 € par compte omis.</span>
              </div>
            </div>
          </Section>

          {/* ---- Barème IR ---- */}
          <Section title="Barème progressif de l'IR (revenus 2025-2026)">
            <div className="rounded bg-gray-50 p-3 space-y-1">
              <Rate label="Jusqu'à 11 497 €" value="0 %" />
              <Rate label="11 497 € → 29 315 €" value="11 %" />
              <Rate label="29 315 € → 83 823 €" value="30 %" />
              <Rate label="83 823 € → 180 294 €" value="41 %" />
              <Rate label="Au-delà de 180 294 €" value="45 %" />
            </div>
            <p className="text-xs text-gray-500">
              Le barème est appliqué par part de quotient familial : impôt = (revenu ÷ parts) × barème × parts, plafonné.
            </p>
          </Section>

          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-xs text-amber-800">
            <strong>⚠️ Rappel important :</strong> ce résumé est indicatif et basé sur la législation en vigueur (source : présentation KPMG Avocats). Il ne constitue pas un conseil fiscal. Consultez un professionnel pour votre situation personnelle.
          </div>
        </div>
      </div>
    </div>
  );
}
