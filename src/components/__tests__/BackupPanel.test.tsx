// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BackupPanel } from '../BackupPanel';
import type { AppSettings } from '../../lib/types';

const DEFAULTS: AppSettings = {
  familyStatus: 'single',
  numberOfChildren: 0,
  taxShares: 1,
  taxSharesManual: false,
  otherTaxableIncome: 0,
  defaultPlanType: 'qualified_macron',
  priorLosses: 0,
};

const CURRENT = {
  settings: DEFAULTS,
  lots: [],
  soldLots: [],
  savedSimulations: [],
};

beforeEach(() => {
  // Stub blob URL APIs used by the download mechanism
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  globalThis.URL.revokeObjectURL = vi.fn();
});

describe('BackupPanel', () => {
  it('renders export and import buttons', () => {
    render(<BackupPanel current={CURRENT} defaults={DEFAULTS} onImport={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Exporter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Importer/i })).toBeInTheDocument();
  });

  it('triggers a download on export click', () => {
    render(<BackupPanel current={CURRENT} defaults={DEFAULTS} onImport={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Exporter/i }));

    expect(globalThis.URL.createObjectURL).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent(/téléchargée/i);
  });

  it('rejects oversized backup files', async () => {
    render(<BackupPanel current={CURRENT} defaults={DEFAULTS} onImport={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    const bigFile = new File(['x'], 'big.json', { type: 'application/json' });
    Object.defineProperty(bigFile, 'size', { value: 11 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [bigFile] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/trop volumineux/i);
    });
  });

  it('rejects empty backup files', async () => {
    render(<BackupPanel current={CURRENT} defaults={DEFAULTS} onImport={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    const emptyFile = new File([''], 'empty.json', { type: 'application/json' });
    Object.defineProperty(emptyFile, 'size', { value: 0 });
    fireEvent.change(input, { target: { files: [emptyFile] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/vide/i);
    });
  });

  it('shows error on malformed JSON', async () => {
    render(<BackupPanel current={CURRENT} defaults={DEFAULTS} onImport={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    const badFile = new File(['{not json'], 'bad.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [badFile] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/JSON invalide/i);
    });
  });

  it('shows error when file is from another app', async () => {
    render(<BackupPanel current={CURRENT} defaults={DEFAULTS} onImport={vi.fn()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    const wrongApp = JSON.stringify({ app: 'other-app', version: 1, settings: DEFAULTS });
    const file = new File([wrongApp], 'wrong.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/simulateur/i);
    });
  });

  it('calls onImport and shows success on valid backup (confirmed)', async () => {
    const onImport = vi.fn();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);

    render(<BackupPanel current={CURRENT} defaults={DEFAULTS} onImport={onImport} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    const valid = JSON.stringify({
      app: 'stock-tax-simulator',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: DEFAULTS,
      lots: [],
      soldLots: [],
      savedSimulations: [],
    });
    const file = new File([valid], 'backup.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(onImport).toHaveBeenCalledOnce();
      expect(screen.getByRole('status')).toHaveTextContent(/restaurée/i);
    });
  });

  it('does not call onImport when the user cancels confirmation', async () => {
    const onImport = vi.fn();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(false);

    render(<BackupPanel current={CURRENT} defaults={DEFAULTS} onImport={onImport} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    const valid = JSON.stringify({
      app: 'stock-tax-simulator',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: DEFAULTS,
      lots: [],
      soldLots: [],
    });
    const file = new File([valid], 'backup.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });

    // Wait a tick for async handlers to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(onImport).not.toHaveBeenCalled();
  });
});
