import type { ButtonHTMLAttributes } from 'react';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ativo?: boolean;
}

export function Chip({ ativo, className, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      {...rest}
      className={[
        'border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors',
        ativo
          ? 'border-accent bg-accent/15 text-accent'
          : 'border-border-strong bg-panel text-text-secondary hover:border-accent',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
