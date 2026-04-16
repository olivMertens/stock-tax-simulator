import type { TaxSimulationResult, DeclarationData, Form2074Line, SaleLotEntry } from './types';

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
  // Case 1WZ: abatement amount
  const case1WZ = acquisitionGainTax.abatement50;
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
      date: new Date().toLocaleDateString('fr-FR'),
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
    case1WZ,
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
  if (data.case3VG > 0) text += `  Case 3VG : ${fmt(data.case3VG)} (plus-value nette de cession)\n`;
  if (data.case3VH > 0) text += `  Case 3VH : ${fmt(data.case3VH)} (moins-value nette)\n`;
  text += `  Case 2OP : ${data.option2OP ? '☑ Cocher' : '☐ Ne pas cocher'} (option barème progressif)\n`;
  if (data.case3SG > 0)
    text += `  Case 3SG : ${fmt(data.case3SG)} (abattement de droit commun)\n`;
  text += '\n';

  if (data.case1TZ > 0 || data.case1WZ > 0 || data.case1TT > 0) {
    text += `FORMULAIRE 2042-C (déclaration complémentaire) :\n`;
    if (data.case1TZ > 0)
      text += `  Case 1TZ : ${fmt(data.case1TZ)} (gain d'acquisition AGA, fraction ≤ 300k€, après abattement 50%)\n`;
    if (data.case1WZ > 0)
      text += `  Case 1WZ : ${fmt(data.case1WZ)} (abattement 50% appliqué)\n`;
    if (data.case1TT > 0)
      text += `  Case 1TT : ${fmt(data.case1TT)} (gain d'acquisition AGA, fraction > 300k€)\n`;
    text += '\n';
  }

  text += `FORMULAIRE 2074 (plus-values mobilières) :\n`;
  text += `  À remplir avec le détail de chaque opération de cession :\n`;
  for (const line of data.form2074Lines) {
    text += `  ${line.date} | ${line.quantity} actions | ${line.origin} | Vente ${fmt(line.salePrice)}/action | Revient ${fmt(line.costBasis)}/action | ${line.gainLoss >= 0 ? 'PV' : 'MV'} ${fmt(Math.abs(line.gainLoss))}\n`;
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
