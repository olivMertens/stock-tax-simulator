// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SoldLotsTable } from '../SoldLotsTable';
import type { SoldLot } from '../../lib/types';

function makeSold(overrides: Partial<SoldLot> = {}): SoldLot {
  return {
    id: 'sl-1',
    broker: 'fidelity',
    acquisitionDate: new Date(2022, 5, 10),
    saleDate: new Date(2024, 3, 15),
    quantity: 100,
    proceeds: 40000,
    costBasis: 25000,
    gainLoss: 15000,
    holdingPeriod: 'Long',
    origin: 'DO',
    planType: 'qualified_macron',
    ...overrides,
  };
}

describe('SoldLotsTable', () => {
  it('renders summary totals correctly', () => {
    const lots = [makeSold(), makeSold({ id: 'sl-2', quantity: 50, proceeds: 20000, costBasis: 10000, gainLoss: 10000 })];
    render(
      <SoldLotsTable
        soldLots={lots}
        onSoldLotsChange={vi.fn()}
        defaultPlanType="qualified_macron"
        saleYear={2024}
        onSaleYearChange={vi.fn()}
      />
    );
    // Total gain/loss = 25 000 €
    expect(screen.getAllByText((t) => /25[\s\u00a0\u202f]000/.test(t)).length).toBeGreaterThan(0);
  });

  it('filters lots by sale year', () => {
    const lots = [
      makeSold({ id: 'a', saleDate: new Date(2023, 5, 1) }),
      makeSold({ id: 'b', saleDate: new Date(2024, 5, 1) }),
      makeSold({ id: 'c', saleDate: new Date(2024, 8, 1) }),
    ];
    render(
      <SoldLotsTable
        soldLots={lots}
        onSoldLotsChange={vi.fn()}
        defaultPlanType="qualified_macron"
        saleYear={2024}
        onSaleYearChange={vi.fn()}
      />
    );
    // Title shows 2 lots for 2024
    expect(screen.getByText(/Ventes effectuées \(2 lots\)/)).toBeDefined();
    expect(screen.getByText(/masquée/i)).toBeDefined();
  });

  it('fires onSoldLotsChange when origin changes', () => {
    const onSoldLotsChange = vi.fn();
    const lot = makeSold({ origin: 'DO' });
    render(
      <SoldLotsTable
        soldLots={[lot]}
        onSoldLotsChange={onSoldLotsChange}
        defaultPlanType="qualified_macron"
        saleYear={2024}
        onSaleYearChange={vi.fn()}
      />
    );
    const originSelect = screen.getAllByLabelText(/Origine du lot/)[0] as HTMLSelectElement;
    fireEvent.change(originSelect, { target: { value: 'FM' } });
    expect(onSoldLotsChange).toHaveBeenCalledTimes(1);
    const next = onSoldLotsChange.mock.calls[0][0];
    expect(next[0].origin).toBe('FM');
    expect(next[0].planType).toBe('qualified_macron');
  });

  it('shows ESPP badge and hides plan select for SP origin', () => {
    const lot = makeSold({ origin: 'SP', planType: 'non_qualified' });
    render(
      <SoldLotsTable
        soldLots={[lot]}
        onSoldLotsChange={vi.fn()}
        defaultPlanType="qualified_macron"
        saleYear={2024}
        onSaleYearChange={vi.fn()}
      />
    );
    expect(screen.queryAllByLabelText(/Régime fiscal du lot/).length).toBe(0);
    expect(screen.getAllByText(/ESPP/i).length).toBeGreaterThan(0);
  });

  it('renders USD annotations when any lot has USD import', () => {
    const lot = makeSold({
      importCurrency: 'USD',
      proceedsUsd: 42000,
      costBasisUsd: 26000,
    });
    render(
      <SoldLotsTable
        soldLots={[lot]}
        onSoldLotsChange={vi.fn()}
        defaultPlanType="qualified_macron"
        saleYear={2024}
        onSaleYearChange={vi.fn()}
      />
    );
    expect(screen.getByText(/taux BCE de la date de vente/i)).toBeDefined();
  });
});
