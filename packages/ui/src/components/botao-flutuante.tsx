import type { AnchorHTMLAttributes, ReactNode } from 'react';

export interface BotaoFlutuanteProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  rotulo: string;
  icone?: ReactNode;
}

// FAB (Floating Action Button) fixado no canto inferior direito. Respeita
// safe-area do iOS. Rótulo some abaixo de 380px pra não estorvar em cabines
// estreitas de celular.
export function BotaoFlutuante({ rotulo, icone, className, ...rest }: BotaoFlutuanteProps) {
  const base =
    'fixed z-40 bottom-6 right-6 inline-flex h-14 items-center gap-3 bg-accent px-5 ' +
    'font-display text-lg uppercase tracking-wider text-[#0B0D10] shadow-lg ' +
    'transition-transform active:translate-y-px hover:brightness-95 ' +
    'pb-[env(safe-area-inset-bottom)]';
  return (
    <a {...rest} className={[base, className ?? ''].join(' ')}>
      {icone}
      <span>{rotulo}</span>
    </a>
  );
}
