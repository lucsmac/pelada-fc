import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variante?: 'panel' | 'panel-2';
}

export function Card({ variante = 'panel', className, children, ...rest }: CardProps) {
  const bg = variante === 'panel' ? 'bg-panel' : 'bg-panel-2';
  return (
    <div {...rest} className={['border border-border p-5', bg, className ?? ''].join(' ')}>
      {children}
    </div>
  );
}

export function CardHeader({ children }: { children: ReactNode }) {
  return (
    <p className="border-b border-dotted border-border-strong pb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
      {children}
    </p>
  );
}
