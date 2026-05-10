import type { TaxSimulationResult, DeclarationData, Form2074Line, SaleLotEntry } from './types';
import { FORM_2042, FORM_2042C_AGA_MACRON, FORM_2074_CADRE_510 } from './tax-forms';

export function generateDeclaration(
  result: TaxSimulationResult,
  lots: SaleLotEntry[],
  fiscalYear: number
): DeclarationData {
  const { acquisitionGainTax, capitalGainTax, taxMode } = result;

  // Case 3VG: plus-value nette de cession (if positive)
  const case3VG = capitalGainTax.netGain > 0 ? capitalGainTax.netGain : 0;
  // Case 3VH: moins-value nette (if net loss)
  const case3VH = capitalGainTax.netLoss > 0 ? capitalGainTax.netLoss : 0;

  // Case 1TZ: gain d'acquisition net, fraction ≤ 300k€, AFTER 50% abatement
  const case1TZ = acquisitionGainTax.below300k - acquisitionGainTax.abatement50;
  // Case 1UZ: abatement amount
  const case1UZ = acquisitionGainTax.abatement50;
  // Case 1TT: fraction > 300k€
  const case1TT = acquisitionGainTax.above300k;

  const option2OP = taxMode === 'bareme';
  const case3SG = capitalGainTax.holdingAbatement;

  const deductibleCSGNextYear =
    acquisitionGainTax.deductibleCSG + capitalGainTax.deductibleCSG;

  // Form 2074 lines
  const form2074Lines: Form2074Line[] = lots.map((entry) => {
    const effectiveCostBasis = entry.lot.origin === 'SP'
      ? (entry.lot.esppFmvPerShare ?? entry.lot.costBasisPerShare)
      : entry.lot.costBasisPerShare;
    const gainLoss = entry.quantitySold * (entry.salePricePerShare - effectiveCostBasis);
    const originLabels: Record<string, string> = {
      SP: 'ESPP',
      DO: 'Stock Award',
      FM: 'AGA Macron',
      FQ: 'AGA pré-Macron',
    };
    return {
      date: (entry.saleDate ?? new Date()).toLocaleDateString('fr-FR'),
      quantity: entry.quantitySold,
      origin: originLabels[entry.lot.origin] || entry.lot.origin,
      salePrice: entry.salePricePerShare,
      costBasis: effectiveCostBasis,
      gainLoss,
    };
  });

  const psDetails = {
    pvCessionPS: capitalGainTax.ps,
    acquisitionGainPSBelow: acquisitionGainTax.psBelow,
    acquisitionGainPSAbove: acquisitionGainTax.psAbove,
    total: capitalGainTax.ps + acquisitionGainTax.psBelow + acquisitionGainTax.psAbove,
  };

  return {
    fiscalYear,
    case3VG,
    case3VH,
    case1TZ: Math.max(0, case1TZ),
    case1UZ,
    case1TT,
    option2OP,
    case3SG,
    deductibleCSGNextYear,
    form2074Lines,
    psDetails,
  };
}

export function formatDeclarationText(data: DeclarationData): string {
  const fmt = (n: number) =>
    n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

  let text = `📋 INSTRUCTIONS DE DÉCLARATION — REVENUS ${data.fiscalYear}\n\n`;

  text += `FORMULAIRE 2042 (déclaration principale) :\n`;
  if (data.case3VG > 0) text += `  Case ${FORM_2042.case3VG.code} : ${fmt(data.case3VG)} (${FORM_2042.case3VG.label.toLowerCase()})\n`;
  if (data.case3VH > 0) text += `  Case ${FORM_2042.case3VH.code} : ${fmt(data.case3VH)} (${FORM_2042.case3VH.label.toLowerCase()})\n`;
  text += `  Case ${FORM_2042.option2OP.code} : ${data.option2OP ? '☑ Cocher' : '☐ Ne pas cocher'} (${FORM_2042.option2OP.label.toLowerCase()})\n`;
  if (data.case3SG > 0)
    text += `  Case ${FORM_2042.case3SG.code} : ${fmt(data.case3SG)} (${FORM_2042.case3SG.label.toLowerCase()})\n`;
  text += '\n';

  if (data.case1TZ > 0 || data.case1UZ > 0 || data.case1TT > 0) {
    text += `FORMULAIRE 2042-C (déclaration complémentaire) :\n`;
    if (data.case1TZ > 0)
      text += `  Case ${FORM_2042C_AGA_MACRON.case1TZ.code} : ${fmt(data.case1TZ)} (${FORM_2042C_AGA_MACRON.case1TZ.label})\n`;
    if (data.case1UZ > 0)
      text += `  Case ${FORM_2042C_AGA_MACRON.case1UZ.code} : ${fmt(data.case1UZ)} (${FORM_2042C_AGA_MACRON.case1UZ.label})\n`;
    if (data.case1TT > 0)
      text += `  Case ${FORM_2042C_AGA_MACRON.case1TT.code} : ${fmt(data.case1TT)} (${FORM_2042C_AGA_MACRON.case1TT.label})\n`;
    text += '\n';
  }

  text += `FORMULAIRE 2074 (plus-values mobilières) :\n`;
  text += `  À remplir avec le détail de chaque opération de cession (codes lignes du cadre 510) :\n`;
  const F = FORM_2074_CADRE_510;
  for (const line of data.form2074Lines) {
    const totalSale = line.quantity * line.salePrice;
    const totalCost = line.quantity * line.costBasis;
    text += `  ${line.date} (${F.saleDate.line}) | ${line.origin} (${F.designation.line}) | ${line.quantity} actions (${F.quantity.line}) | PU vente ${fmt(line.salePrice)} (${F.unitSalePrice.line}) | Montant vente ${fmt(totalSale)} (${F.totalSale.line}) | PU acquisition ${fmt(line.costBasis)} (${F.unitAcqPrice.line}) | Prix revient ${fmt(totalCost)} (${F.costBasis.line}) | ${line.gainLoss >= 0 ? 'PV' : 'MV'} ${fmt(Math.abs(line.gainLoss))} (${F.result.line})\n`;
  }
  if (data.case3SG > 0) {
    text += `\n  ⚠️ Abattement durée de détention de ${fmt(data.case3SG)} appliqué (titres acquis avant le 01/01/2018, option barème).\n`;
    text += `     → Compléter l'annexe 2074-ABT « Fiche de calcul de l'abattement pour durée de détention » et reporter le montant en case 3SG.\n`;
  }
  if (data.case3VH > 0) {
    text += `\n  ⚠️ Moins-value globale de ${fmt(data.case3VH)} : à inscrire également au cadre 12 de la 2074 « Suivi de vos moins-values antérieures reportables sur 10 ans », ligne ${data.fiscalYear}.\n`;
  }
  text += '\n';

  text += `PRÉLÈVEMENTS SOCIAUX :\n`;
  if (data.psDetails.pvCessionPS > 0)
    text += `  PS sur PV de cession : ${fmt(data.psDetails.pvCessionPS)}\n`;
  if (data.psDetails.acquisitionGainPSBelow > 0)
    text += `  PS sur gain d'acquisition (≤ 300k€) : ${fmt(data.psDetails.acquisitionGainPSBelow)}\n`;
  if (data.psDetails.acquisitionGainPSAbove > 0)
    text += `  PS sur gain d'acquisition (> 300k€) : ${fmt(data.psDetails.acquisitionGainPSAbove)}\n`;
  text += `  Total PS : ${fmt(data.psDetails.total)}\n\n`;

  text += `💡 RAPPELS :\n`;
  text += `- Le gain d'acquisition n'est imposé que l'année de la VENTE des actions, pas au vesting.\n`;
  if (data.deductibleCSGNextYear > 0)
    text += `- La CSG déductible de ${fmt(data.deductibleCSGNextYear)} sera à déduire sur la déclaration de l'année suivante.\n`;
  if (data.case3VH > 0)
    text += `- La moins-value de ${fmt(data.case3VH)} est reportable pendant 10 ans.\n`;

  return text;
}
