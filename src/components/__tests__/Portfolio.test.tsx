// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Portfolio } from '../Portfolio';
import type { StockLot } from '../../lib/types';

// Mock recharts: jsdom has no layout engine, and the chart is not what we
// test here. A minimal pass-through is sufficient.
vi.mock('recharts', () => ({
  Treemap: () => <div data-testid="treemap" />,
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

function makeLot(overrides: Partial<StockLot> = {}): StockLot {
  return {
    id: 'lot-1',
    broker: 'fidelity',
    acquisitionDate: new Date(2023, 5, 10),
    quantity: 100,
    costBasisPerShare: 200,
    totalCostBasis: 20000,
    currentValue: 35000,
    unrealizedGainLoss: 15000,
    origin: 'FM',
    holdingPeriod: 'Long',
    planType: 'qualified_macron',
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('Portfolio', () => {
  it('renders summary with totals', () => {
    const lots = [
      makeLot({ id: 'a', quantity: 100, currentValue: 35000, unrealizedGainLoss: 15000 }),
      makeLot({ id: 'b', quantity: 50, currentValue: 17500, unrealizedGainLoss: 7500 }),
    ];
    render(<Portfolio lots={lots} onLotsChange={vi.fn()} />);

    // Actions totales 150
    expect(screen.getByText('150')).toBeDefined();
    // Totals 52 500 €
    const matches = screen.getAllByText((t) => /52[\s\u00a0\u202f]500/.test(t));
    expect(matches.length).toBeGreaterThan(0);
  });

  it('filters by origin', () => {
    const lots = [
      makeLot({ id: 'fm', origin: 'FM' }),
      makeLot({ id: 'sp', origin: 'SP' }),
    ];
    render(<Portfolio lots={lots} onLotsChange={vi.fn()} />);

    // Initially both origins rendered — switch filter to SP
    const originSelect = screen.getByLabelText('Filtrer par type') as HTMLSelectElement;
    fireEvent.change(originSelect, { target: { value: 'SP' } });
    // After filter, "AGA Macron" label should not appear in rows
    expect(screen.queryAllByText('AGA Macron').length).toBe(0);
  });

  it('fires onLotsChange when a DO lot plan type is changed', () => {
    const onLotsChange = vi.fn();
    const lot = makeLot({ id: 'do-1', origin: 'DO', planType: 'qualified_macron' });
    render(<Portfolio lots={[lot]} onLotsChange={onLotsChange} />);

    // Find the plan-type select inside the desktop table (Select component = native <select>)
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    const planSelect = selects.find((s) => s.value === 'qualified_macron');
    expect(planSelect).toBeDefined();
    fireEvent.change(planSelect!, { target: { value: 'non_qualified' } });

    expect(onLotsChange).toHaveBeenCalledTimes(1);
    const next = onLotsChange.mock.calls[0][0];
    expect(next[0].planType).toBe('non_qualified');
  });

  it('persists plan type overrides to localStorage', () => {
    const onLotsChange = vi.fn();
    const lot = makeLot({ id: 'do-1', origin: 'DO', planType: 'qualified_macron' });
    render(<Portfolio lots={[lot]} onLotsChange={onLotsChange} />);

    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    const planSelect = selects.find((s) => s.value === 'qualified_macron');
    fireEvent.change(planSelect!, { target: { value: 'non_qualified' } });

    const overrides = JSON.parse(localStorage.getItem('planTypeOverrides') ?? '{}');
    expect(overrides['do-1']).toBe('non_qualified');
  });

  it('shows "PV/MV latente" card with gain value', () => {
    const lots = [makeLot({ unrealizedGainLoss: 15000 })];
    render(<Portfolio lots={lots} onLotsChange={vi.fn()} />);
    expect(screen.getByText(/PV\/MV latente/)).toBeDefined();
  });
});
