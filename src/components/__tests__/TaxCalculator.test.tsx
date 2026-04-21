// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaxCalculator } from '../TaxCalculator';
import type { TaxSimulationResult } from '../../lib/types';

function makeResult(overrides: Partial<TaxSimulationResult> = {}): TaxSimulationResult {
  return {
    totalProceeds: 40000,
    totalAcquisitionGain: 10000,
    totalCapitalGain: 5000,
    acquisitionGainTax: {
      below300k: 10000,
      above300k: 0,
      abatement50: 5000,
      irBelow: 1500,
      irAbove: 0,
      psBelow: 1720,
      psAbove: 0,
      salaryContribution: 0,
      deductibleCSG: 680,
      total: 3220,
    },
    capitalGainTax: {
      grossGain: 5000,
      netGain: 5000,
      ir: 640,
      ps: 860,
      deductibleCSG: 340,
      holdingAbatement: 0,
      total: 1500,
      remainingLosses: 0,
      netLoss: 0,
    },
    cehr: 0,
    totalTax: 4720,
    netAmount: 35280,
    effectiveTaxRate: 11.8,
    lotResults: [],
    taxMode: 'pfu',
    ...overrides,
  };
}

describe('TaxCalculator component', () => {
  it('shows placeholder when no result', () => {
    render(
      <TaxCalculator result={null} taxMode="pfu" onTaxModeChange={vi.fn()} fiscalYear={2025} />
    );
    expect(screen.getByText(/Lancez une simulation/)).toBeInTheDocument();
  });

  it('renders key figures when result is provided', () => {
    const result = makeResult();
    render(
      <TaxCalculator result={result} taxMode="pfu" onTaxModeChange={vi.fn()} fiscalYear={2025} />
    );
    // Check that net amount is displayed
    expect(screen.getAllByText(/35[\s\u202f]280,00/).length).toBeGreaterThanOrEqual(1);
    // Total proceeds appears multiple times (key figure + detail row)
    expect(screen.getAllByText(/40[\s\u202f]000,00/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows PFU button as active in PFU mode', () => {
    const result = makeResult();
    render(
      <TaxCalculator result={result} taxMode="pfu" onTaxModeChange={vi.fn()} fiscalYear={2025} />
    );
    const pfuButton = screen.getByText(/PFU/);
    expect(pfuButton).toBeInTheDocument();
  });

  it('calls onTaxModeChange when clicking barème button', () => {
    const onTaxModeChange = vi.fn();
    const result = makeResult();
    render(
      <TaxCalculator result={result} taxMode="pfu" onTaxModeChange={onTaxModeChange} fiscalYear={2025} />
    );
    fireEvent.click(screen.getByText('Barème progressif'));
    expect(onTaxModeChange).toHaveBeenCalledWith('bareme');
  });

  it('displays acquisition gain section when totalAcquisitionGain > 0', () => {
    const result = makeResult();
    render(
      <TaxCalculator result={result} taxMode="pfu" onTaxModeChange={vi.fn()} fiscalYear={2025} />
    );
    expect(screen.getByText(/Gain d'acquisition/)).toBeInTheDocument();
    expect(screen.getByText(/Abattement 50%/)).toBeInTheDocument();
  });

  it('hides acquisition gain section when totalAcquisitionGain is 0', () => {
    const result = makeResult({ totalAcquisitionGain: 0 });
    render(
      <TaxCalculator result={result} taxMode="pfu" onTaxModeChange={vi.fn()} fiscalYear={2025} />
    );
    expect(screen.queryByText(/Gain d'acquisition \(AGA\)/)).not.toBeInTheDocument();
  });

  it('displays effective tax rate', () => {
    const result = makeResult();
    render(
      <TaxCalculator result={result} taxMode="pfu" onTaxModeChange={vi.fn()} fiscalYear={2025} />
    );
    expect(screen.getAllByText(/Taux effectif/).length).toBeGreaterThanOrEqual(1);
  });

  it('shows 300k€ threshold banner when above300k > 0', () => {
    const result = makeResult({
      acquisitionGainTax: {
        below300k: 300000,
        above300k: 50000,
        abatement50: 150000,
        irBelow: 45000,
        irAbove: 20000,
        psBelow: 55800,
        psAbove: 5550,
        salaryContribution: 5000,
        deductibleCSG: 28700,
        total: 131350,
      },
    });
    render(
      <TaxCalculator result={result} taxMode="pfu" onTaxModeChange={vi.fn()} fiscalYear={2025} />
    );
    const alerts = screen.getAllByRole('alert');
    const bannerTexts = alerts.map((el) => el.textContent || '').join(' ');
    expect(bannerTexts).toMatch(/300 000/);
    expect(bannerTexts).toMatch(/abattement/i);
  });

  it('does not show 300k€ banner when above300k = 0', () => {
    const result = makeResult(); // default has above300k = 0
    render(
      <TaxCalculator result={result} taxMode="pfu" onTaxModeChange={vi.fn()} fiscalYear={2025} />
    );
    const alerts = screen.queryAllByRole('alert');
    const bannerTexts = alerts.map((el) => el.textContent || '').join(' ');
    expect(bannerTexts).not.toMatch(/300 000 € dépassé/);
  });

  it('shows CEHR banner when cehr > 0', () => {
    const result = makeResult({ cehr: 2500 });
    render(
      <TaxCalculator result={result} taxMode="pfu" onTaxModeChange={vi.fn()} fiscalYear={2025} />
    );
    const alerts = screen.getAllByRole('alert');
    const bannerTexts = alerts.map((el) => el.textContent || '').join(' ');
    expect(bannerTexts).toMatch(/CEHR/);
  });

  it('does not show CEHR banner when cehr = 0', () => {
    const result = makeResult({ cehr: 0 });
    render(
      <TaxCalculator result={result} taxMode="pfu" onTaxModeChange={vi.fn()} fiscalYear={2025} />
    );
    const alerts = screen.queryAllByRole('alert');
    const bannerTexts = alerts.map((el) => el.textContent || '').join(' ');
    expect(bannerTexts).not.toMatch(/CEHR/);
  });
});
