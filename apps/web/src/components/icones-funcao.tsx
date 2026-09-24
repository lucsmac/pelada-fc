// Ícones das funções em partida (goleiro, linha, reserva) e estados auxiliares.
// Compartilhados entre /partidas/[id] e /peladas/[slug]/gerenciar.

export function IconeGoleiro({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M6 21V10a2 2 0 0 1 2-2h1V5a2 2 0 1 1 4 0v3h1V6a2 2 0 1 1 4 0v6" />
      <path d="M6 15h12" />
      <path d="M18 12v7a2 2 0 0 1-2 2H8" />
    </svg>
  );
}

export function IconeLinha({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3l3 4-1 5-4 0-1-5z" />
      <path d="M15 7l4 2" />
      <path d="M9 7l-4 2" />
      <path d="M10 12l-2 4 3 3" />
      <path d="M14 12l2 4-3 3" />
    </svg>
  );
}

export function IconeReserva({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M6 3h12" />
      <path d="M6 21h12" />
      <path d="M6 3v3a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3" />
      <path d="M6 21v-3a6 6 0 0 1 6-6 6 6 0 0 1 6 6v3" />
    </svg>
  );
}

export function IconeRecusado({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </svg>
  );
}

export function IconeInterrogacao({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7v.5" />
      <path d="M12 17h.01" />
    </svg>
  );
}
