import * as React from 'react';
import { cn } from '../../lib/utils';
import { AlertTriangle } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, children, className }: DialogProps) {
  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        className={cn(
          'relative z-50 w-full max-w-md rounded-xl bg-white p-6 shadow-xl',
          className
        )}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}

interface DialogHeaderProps {
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export function DialogHeader({ icon, children }: DialogHeaderProps) {
  return (
    <div className="flex items-start gap-3 mb-4">
      {icon ?? <AlertTriangle className="h-6 w-6 text-amber-500 flex-shrink-0 mt-0.5" />}
      <div className="text-sm text-gray-700">{children}</div>
    </div>
  );
}

interface DialogFooterProps {
  children: React.ReactNode;
}

export function DialogFooter({ children }: DialogFooterProps) {
  return <div className="flex justify-end gap-3 mt-6">{children}</div>;
}
