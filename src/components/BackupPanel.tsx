import React from 'react';
import { Download, Upload, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Dialog, DialogHeader, DialogFooter } from './ui/dialog';
import {
  exportToJsonString,
  buildBackupFilename,
  importFromJsonString,
  type BackupInput,
  type ImportResult,
} from '../lib/backup';
import type { AppSettings } from '../lib/types';

interface BackupPanelProps {
  current: BackupInput;
  defaults: AppSettings;
  onImport: (result: ImportResult) => void;
  /** When true, render bare body without the outer Card (parent provides one). */
  embedded?: boolean;
}

const MAX_BACKUP_SIZE = 10 * 1024 * 1024; // 10 MB — generous; a typical backup is < 100 KB

export function BackupPanel({ current, defaults, onImport, embedded = false }: BackupPanelProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = React.useState<ImportResult | null>(null);
  const [status, setStatus] = React.useState<
    | { kind: 'idle' }
    | { kind: 'success'; message: string }
    | { kind: 'error'; message: string }
    | { kind: 'loading' }
  >({ kind: 'idle' });

  const handleExport = () => {
    try {
      const json = exportToJsonString(current);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = buildBackupFilename();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus({ kind: 'success', message: 'Sauvegarde téléchargée.' });
    } catch (err) {
      setStatus({ kind: 'error', message: 'Erreur lors de l\'export : ' + (err as Error).message });
    }
  };

  const handleFile = async (file: File) => {
    if (file.size > MAX_BACKUP_SIZE) {
      setStatus({ kind: 'error', message: 'Fichier trop volumineux (> 10 Mo).' });
      return;
    }
    if (file.size === 0) {
      setStatus({ kind: 'error', message: 'Le fichier est vide.' });
      return;
    }

    setStatus({ kind: 'loading' });
    try {
      const text = await file.text();
      const result = importFromJsonString(text, defaults);
      // Open the confirmation dialog; actual import is deferred to confirmImport().
      setPendingImport(result);
      setStatus({ kind: 'idle' });
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message });
    }
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    onImport(pendingImport);
    const warningSuffix = pendingImport.warnings.length > 0 ? ` — ${pendingImport.warnings.join(' ')}` : '';
    setStatus({ kind: 'success', message: `Sauvegarde restaurée.${warningSuffix}` });
    setPendingImport(null);
  };

  const cancelImport = () => {
    setPendingImport(null);
    setStatus({ kind: 'idle' });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    // Reset so selecting the same file again re-triggers onChange
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const body = (
    <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="gap-1.5"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Exporter (JSON)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={status.kind === 'loading'}
            className="gap-1.5"
          >
            {status.kind === 'loading' ? (
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="h-4 w-4" aria-hidden="true" />
            )}
            Importer une sauvegarde
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleInputChange}
          />
        </div>

        <p className="text-xs text-gray-500">
          Contenu de la sauvegarde : paramètres fiscaux, positions, ventes, historique de simulations.
          Aucune donnée n'est envoyée sur un serveur.
        </p>

        {status.kind === 'success' && (
          <p
            className="text-sm text-green-700 flex items-start gap-1.5"
            role="status"
            aria-live="polite"
          >
            <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            {status.message}
          </p>
        )}
        {status.kind === 'error' && (
          <p
            className="text-sm text-red-600 flex items-start gap-1.5"
            role="alert"
            aria-live="assertive"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            {status.message}
          </p>
        )}
    </div>
  );

  const dialog = (
    <Dialog open={pendingImport !== null} onClose={cancelImport}>
      <DialogHeader>
        <p className="font-semibold text-gray-900 mb-1">Restaurer cette sauvegarde ?</p>
        <p>
          Vos données actuelles seront <strong>remplacées</strong> par :{' '}
          {pendingImport?.lots.length ?? 0} position{(pendingImport?.lots.length ?? 0) > 1 ? 's' : ''},{' '}
          {pendingImport?.soldLots.length ?? 0} vente{(pendingImport?.soldLots.length ?? 0) > 1 ? 's' : ''}.
        </p>
        <p className="mt-2 text-xs text-gray-500">Cette action ne peut pas être annulée.</p>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={cancelImport}>
          Annuler
        </Button>
        <Button onClick={confirmImport}>
          Remplacer mes données
        </Button>
      </DialogFooter>
    </Dialog>
  );

  if (embedded) {
    return (
      <>
        {body}
        {dialog}
      </>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Sauvegarde &amp; restauration
        </CardTitle>
        <CardDescription>
          Vos données sont stockées localement dans ce navigateur. Exportez une sauvegarde pour les transférer sur un autre appareil ou les conserver en sécurité.
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
      {dialog}
    </Card>
  );
}
