'use client';

import { usePathname } from 'next/navigation';
import { BotaoFlutuante } from '@peladafc/ui';
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
  return <BotaoFlutuante href="/pelada/iniciar" rotulo="Iniciar pelada" icone={<IconeBola />} />;
}
