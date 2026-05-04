import { brokerLabel } from '../lib/utils';
import type { Broker } from '../lib/types';

const LOGOS: Record<Broker, string> = {
  fidelity: '/Fidelity-Logo.png',
  morgan_stanley: '/Morgan-Stanley-Logo.png',
};

interface BrokerLogoProps {
  broker: Broker;
  /** Tailwind height utility, e.g. "h-5". Width auto for natural ratio. */
  className?: string;
  /** When true, render the broker name next to the logo. */
  withLabel?: boolean;
}

/**
 * Display the broker's official logo. Falls back to a text label if the
 * image fails to load (e.g. offline / asset removed). Brand names are used
 * for nominative identification only — see README.
 */
export function BrokerLogo({ broker, className = 'h-5', withLabel = false }: BrokerLogoProps) {
  const label = brokerLabel(broker);
  return (
    <span className="inline-flex items-center gap-1.5">
      <img
        src={LOGOS[broker]}
        alt={label}
        title={label}
        className={`${className} w-auto object-contain`}
        loading="lazy"
        onError={(e) => {
          // Replace with the textual label so the row never breaks visually
          // when the asset is missing.
          const span = document.createElement('span');
          span.textContent = label;
          span.className = 'text-xs font-medium text-gray-700';
          e.currentTarget.replaceWith(span);
        }}
      />
      {withLabel && <span className="text-xs font-medium text-gray-700">{label}</span>}
    </span>
  );
}
