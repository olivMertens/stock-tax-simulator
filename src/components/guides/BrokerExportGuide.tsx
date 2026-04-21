import React from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import type { BrokerGuide, ImportMode } from './types';
import { fidelityGuide } from './fidelity-steps';

const ALL_GUIDES: BrokerGuide[] = [fidelityGuide];

interface BrokerExportGuideProps {
  open: boolean;
  onClose: () => void;
  importMode: ImportMode;
}

export function BrokerExportGuide({ open, onClose, importMode }: BrokerExportGuideProps) {
  const [activeBroker, setActiveBroker] = React.useState(0);
  const [activeStep, setActiveStep] = React.useState(0);

  // Reset step when dialog opens or broker changes
  React.useEffect(() => {
    if (open) setActiveStep(0);
  }, [open, activeBroker]);

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

  const guide = ALL_GUIDES[activeBroker];
  const step = guide.steps[activeStep];
  const isFirst = activeStep === 0;
  const isLast = activeStep === guide.steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-50 w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl bg-white shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-900">
              Comment exporter depuis votre courtier
            </h2>
            {/* Broker tabs — ready for multi-broker */}
            {ALL_GUIDES.length > 1 && (
              <div className="flex gap-1 ml-2">
                {ALL_GUIDES.map((g, i) => (
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
            {ALL_GUIDES.length === 1 && (
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
            <p
              className="text-sm text-gray-700 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: step.description }}
            />
            {step.importModeHint?.[importMode] && (
              <p
                className="text-sm text-primary bg-primary/5 border border-primary/20 rounded-lg px-3 py-2"
                dangerouslySetInnerHTML={{ __html: step.importModeHint[importMode]! }}
              />
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
