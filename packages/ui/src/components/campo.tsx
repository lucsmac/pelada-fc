import type { InputHTMLAttributes } from 'react';

export interface CampoProps extends InputHTMLAttributes<HTMLInputElement> {
  rotulo: string;
  erro?: string;
  auxiliar?: string;
}

export function Campo({ rotulo, erro, auxiliar, id, className, ...rest }: CampoProps) {
  const inputId = id ?? rest.name;
  return (
    <label htmlFor={inputId} className="flex flex-col gap-2">
      <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
        {rotulo}
      </span>
      <input
        id={inputId}
        {...rest}
        className={[
          'h-11 border bg-panel px-4 text-sm text-text outline-none transition-colors',
          'placeholder:text-text-tertiary focus:border-accent',
          erro ? 'border-coral' : 'border-border-strong',
          className ?? '',
        ].join(' ')}
      />
      {erro ? (
        <span className="text-xs text-coral">{erro}</span>
      ) : auxiliar ? (
        <span className="text-xs text-text-tertiary">{auxiliar}</span>
      ) : null}
    </label>
  );
}
