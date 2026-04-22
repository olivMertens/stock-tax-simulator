import React from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import type { BrokerGuide } from './types';
import { fidelityGuide } from './fidelity-steps';

const DEFAULT_GUIDES: BrokerGuide[] = [fidelityGuide];
const DEFAULT_TITLE = 'Comment exporter depuis votre courtier';

interface BrokerExportGuideProps {
  open: boolean;
  onClose: () => void;
  /** Guides to display. Defaults to the Fidelity guide. */
  guides?: BrokerGuide[];
  /** Dialog title. Defaults to "Comment exporter depuis votre courtier". */
  title?: string;
}

export function BrokerExportGuide({ open, onClose, guides = DEFAULT_GUIDES, title = DEFAULT_TITLE }: BrokerExportGuideProps) {
  const [activeBroker, setActiveBroker] = React.useState(0);
  const [activeStep, setActiveStep] = React.useState(0);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const previouslyFocused = React.useRef<HTMLElement | null>(null);

  // Reset step when dialog opens or broker changes
  React.useEffect(() => {
    if (open) setActiveStep(0);
  }, [open, activeBroker]);

  // Close on Escape + focus trap + restore focus on close
  React.useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // Focus first focusable element inside the dialog
    const focusFirst = () => {
      const el = dialogRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      el?.focus();
    };
    // Defer to allow DOM paint
    const raf = requestAnimationFrame(focusFirst);

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', handler);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const guide = guides[activeBroker] ?? guides[0];
  const step = guide.steps[activeStep];
  const isFirst = activeStep === 0;
  const isLast = activeStep === guide.steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="broker-export-guide-title"
        className="relative z-50 w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl bg-white shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-3">
            <h2 id="broker-export-guide-title" className="text-sm font-semibold text-gray-900">
              {title}
            </h2>
            {/* Broker tabs — ready for multi-broker */}
            {guides.length > 1 && (
              <div className="flex gap-1 ml-2">
                {guides.map((g, i) => (
                  <button
                    key={g.brokerId}
                    onClick={() => setActiveBroker(i)}
                    className={cn(
                      'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                      i === activeBroker
                        ? 'bg-primary text-white'
                        : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                    )}
                  >
                    {g.brokerName}
                  </button>
                ))}
              </div>
            )}
            {guides.length === 1 && (
              <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                {guide.brokerName}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1 px-5 py-3 border-b overflow-x-auto">
          {guide.steps.map((s, i) => (
            <button
              key={i}
              onClick={() => setActiveStep(i)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
                i === activeStep
                  ? 'bg-primary/10 text-primary'
                  : i < activeStep
                    ? 'text-green-700 bg-green-50'
                    : 'text-gray-500 hover:bg-gray-100'
              )}
            >
              <span
                className={cn(
                  'flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold shrink-0',
                  i === activeStep
                    ? 'bg-primary text-white'
                    : i < activeStep
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-500'
                )}
              >
                {i < activeStep ? '✓' : i + 1}
              </span>
              <span className="hidden sm:inline">{s.title}</span>
            </button>
          ))}
        </div>

        {/* Step content — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Step description */}
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-gray-900">
              Étape {activeStep + 1} — {step.title}
            </h3>
            <p className="text-sm text-gray-700 leading-relaxed">{step.description}</p>
            {step.importModeHint && (
              <div className="space-y-1.5">
                {Object.entries(step.importModeHint).map(([mode, hint]) => (
                  <p
                    key={mode}
                    className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2"
                  >
                    {hint}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Screenshot */}
          <div className="rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
            <img
              src={step.image}
              alt={step.imageAlt}
              className="w-full h-auto"
              loading="lazy"
            />
          </div>
        </div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveStep((s) => s - 1)}
            disabled={isFirst}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Précédent
          </Button>
          <span className="text-xs text-gray-400">
            {activeStep + 1} / {guide.steps.length}
          </span>
          {isLast ? (
            <Button size="sm" onClick={onClose} className="gap-1">
              Terminé
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => setActiveStep((s) => s + 1)}
              className="gap-1"
            >
              Suivant
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
