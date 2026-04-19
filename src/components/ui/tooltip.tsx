import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { cn } from '../../lib/utils';
import { Info } from 'lucide-react';

interface TooltipProps {
  content: string;
  children?: React.ReactNode;
  className?: string;
}

export function Tooltip({ content, children, className }: TooltipProps) {
  const [show, setShow] = React.useState(false);
  const triggerRef = React.useRef<HTMLSpanElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const id = React.useId();

  React.useEffect(() => {
    if (show && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({
        top: rect.top + window.scrollY,
        left: rect.left + rect.width / 2 + window.scrollX,
      });
    }
  }, [show]);

  return (
    <span
      ref={triggerRef}
      className={cn('relative inline-flex items-center', className)}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      tabIndex={0}
      aria-describedby={show ? id : undefined}
    >
      {children || <Info className="h-4 w-4 text-gray-400 cursor-help" />}
      {show && pos && ReactDOM.createPortal(
        <span
          id={id}
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
          className="fixed -translate-x-1/2 -translate-y-full -mt-2 z-50 w-64 p-2 text-xs bg-gray-900 text-white rounded shadow-lg pointer-events-none"
        >
          {content}
        </span>,
        document.body
      )}
    </span>
  );
}
