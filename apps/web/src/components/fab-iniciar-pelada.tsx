'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

// Rotas onde o FAB estorvaria conteúdo fixo (bottom bars, wizard, placar).
const ROTAS_SEM_FAB = [
  /^\/pelada\/iniciar/,
  /^\/partidas\/[^/]+\/ao-vivo/,
  /^\/partidas\/[^/]+\/gols/,
  /^\/partidas\/[^/]+\/desempate/,
  /^\/partidas\/[^/]+\/resumo/,
  /^\/entrar/,
  /^\/cadastrar/,
];

function IconeBola() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l4 4M14 14l4 4M18 6l-4 4M10 14l-4 4" />
    </svg>
  );
}

export function FabIniciarPelada() {
  const { estado } = useAuth();
  const pathname = usePathname();
  if (estado.status !== 'autenticado') return null;
  if (pathname && ROTAS_SEM_FAB.some((r) => r.test(pathname))) return null;
  return (
    <Link
      href="/pelada/iniciar"
      className="fixed bottom-6 right-6 z-40 inline-flex h-14 items-center gap-2 bg-accent px-4 pb-[env(safe-area-inset-bottom)] font-display text-lg uppercase tracking-wider text-[#0B0D10] shadow-lg transition-transform hover:brightness-95 active:translate-y-px sm:gap-3 sm:px-5"
    >
      <IconeBola />
      <span className="hidden xs:inline">Iniciar pelada</span>
    </Link>
  );
}
