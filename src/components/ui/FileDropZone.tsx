import * as React from 'react';
import { Upload, RefreshCw, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface FileDropZoneProps {
  /** File type filter (mirrors <input accept>). */
  accept: string;
  /** Called once a file has been picked or dropped. */
  onFile: (file: File) => void;
  /** Loading flag — disables interactions and shows the spinner. */
  loading?: boolean;
  /** Sentence shown inside the drop zone when no file is loaded yet. */
  prompt: string;
  /** Optional file name to surface as the "loaded" state. */
  fileName?: string | null;
  /** Compact variant: single-line, smaller padding. Used for secondary slots. */
  compact?: boolean;
  /** Optional aria-label override. */
  ariaLabel?: string;
}

/**
 * Reusable drop zone for single-file imports. Shares the visual contract with
 * the CsvImporter drop zone (dashed border, primary highlight while dragging,
 * keyboard-accessible) so all "Mes données" cards feel consistent.
 *
 * Compact variant keeps the same affordance with a tighter footprint —
 * suitable for secondary uploads (e.g. dividends inside the Fidelity card).
 */
export function FileDropZone({
  accept,
  onFile,
  loading = false,
  prompt,
  fileName,
  compact = false,
  ariaLabel,
}: FileDropZoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (loading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!loading) setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleClick = () => {
    if (!loading) inputRef.current?.click();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && !loading) {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    // Reset so picking the same file again re-fires onChange.
    if (inputRef.current) inputRef.current.value = '';
  };

  const labelText = ariaLabel ?? `Zone d'import. ${prompt}`;

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 border-2 border-dashed rounded-lg px-4 py-3 transition-colors cursor-pointer text-sm',
          isDragging
            ? 'border-primary bg-blue-50'
            : 'border-gray-300 hover:border-gray-400',
          loading && 'opacity-60 cursor-wait',
        )}
        role="button"
        tabIndex={0}
        aria-label={labelText}
        aria-busy={loading || undefined}
        onClick={handleClick}
        onKeyDown={handleKey}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {loading ? (
          <RefreshCw className="h-5 w-5 text-gray-400 shrink-0 animate-spin" aria-hidden="true" />
        ) : fileName ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" aria-hidden="true" />
        ) : (
          <Upload className="h-5 w-5 text-gray-400 shrink-0" aria-hidden="true" />
        )}
        <span className="flex-1 text-gray-600 truncate">
          {fileName ? <strong className="text-gray-800">{fileName}</strong> : prompt}
        </span>
        <span className="text-xs font-medium text-primary shrink-0">Parcourir</span>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleInputChange}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
        isDragging
          ? 'border-primary bg-blue-50'
          : 'border-gray-300 hover:border-gray-400',
        loading && 'opacity-60 cursor-wait',
      )}
      role="button"
      tabIndex={0}
      aria-label={labelText}
      aria-busy={loading || undefined}
      onClick={handleClick}
      onKeyDown={handleKey}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {loading ? (
        <RefreshCw className="h-10 w-10 mx-auto mb-3 text-gray-400 animate-spin" aria-hidden="true" />
      ) : fileName ? (
        <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-600" aria-hidden="true" />
      ) : (
        <Upload className="h-10 w-10 mx-auto mb-3 text-gray-400" aria-hidden="true" />
      )}
      <p className="text-sm text-gray-600 mb-2">
        {fileName ? <strong className="text-gray-800">{fileName}</strong> : prompt}
      </p>
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
        Choisir un fichier
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  );
}
