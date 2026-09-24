import type { ButtonHTMLAttributes } from 'react';

export interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: 'primario' | 'secundario';
  carregando?: boolean;
}

export function Botao({
  variante = 'primario',
  carregando,
  disabled,
  children,
  className,
  ...rest
}: BotaoProps) {
  const base =
    'inline-flex h-11 items-center justify-center px-6 text-sm font-bold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const cor =
    variante === 'primario'
      ? 'bg-accent text-[#0B0D10] hover:brightness-95'
      : 'border border-border-strong bg-panel text-text hover:border-accent';
  return (
    <button
      {...rest}
      disabled={disabled || carregando}
      className={[base, cor, className ?? ''].join(' ')}
    >
      {carregando ? '...' : children}
    </button>
  );
}
