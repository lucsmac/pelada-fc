'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useChrome } from '@/lib/chrome-context';
import { Botao } from './botao';

export function Cabecalho() {
  const { estado, sair } = useAuth();
  const { ocultarMenu } = useChrome();
  const pathname = usePathname();
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    setMenuAberto(false);
  }, [pathname]);

  if (ocultarMenu) return null;

  const linksNav = [
    ...(estado.status === 'autenticado'
      ? [{ href: '/vestiario' as const, rotulo: 'Vestiário' }]
      : []),
    { href: '/peladas' as const, rotulo: 'Peladas' },
    { href: '/locais' as const, rotulo: 'Locais' },
    ...(estado.status === 'autenticado'
      ? [
          { href: '/convites' as const, rotulo: 'Convites' },
          { href: '/perfil' as const, rotulo: 'Meu perfil' },
        ]
      : []),
  ];

  return (
    <header className="relative border-b border-border bg-nav-bg">
      <div className="mx-auto flex h-[76px] max-w-container items-center justify-between gap-3 px-4 md:px-16">
        <div className="flex min-w-0 items-center gap-4 md:gap-8">
          <button
            type="button"
            onClick={() => setMenuAberto((v) => !v)}
            aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuAberto}
            className="grid h-10 w-10 shrink-0 place-items-center border border-border-strong bg-panel md:hidden"
          >
            {menuAberto ? <IconeX /> : <IconeMenu />}
          </button>
          <Link href="/" className="flex shrink-0 items-center gap-2 md:gap-3">
            <span className="grid h-8 w-8 place-items-center bg-accent font-display text-lg text-[#0B0D10]">
              P
            </span>
            <span className="font-display text-xl uppercase leading-none md:text-2xl">
              Pelada<span className="text-accent">FC</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold md:flex">
            {estado.status === 'autenticado' && (
              <Link href="/vestiario" className="text-text-secondary hover:text-text">
                Vestiário
              </Link>
            )}
            <Link href="/peladas" className="text-text-secondary hover:text-text">
              Peladas
            </Link>
            <Link href="/locais" className="text-text-secondary hover:text-text">
              Locais
            </Link>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2 md:gap-4">
          {estado.status === 'carregando' && (
            <span className="text-xs text-text-tertiary">carregando…</span>
          )}
          {estado.status === 'anonimo' && (
            <>
              <Link
                href="/entrar"
                className="text-sm font-semibold text-text-secondary hover:text-text"
              >
                Entrar
              </Link>
              <Link href="/cadastrar">
                <Botao variante="primario">Cadastrar</Botao>
              </Link>
            </>
          )}
          {estado.status === 'autenticado' && (
            <div className="flex items-center gap-2 md:gap-3">
              <Link
                href="/pelada/iniciar"
                aria-label="Iniciar pelada"
                className="inline-flex h-9 shrink-0 items-center gap-2 bg-accent px-2 font-display text-xs uppercase tracking-wider text-[#0B0D10] hover:brightness-95 md:px-3 md:text-sm"
              >
                <IconeBola />
                <span className="hidden md:inline">Iniciar pelada</span>
              </Link>
              <Link
                href="/convites"
                className="hidden text-xs font-semibold uppercase tracking-wider text-text-secondary hover:text-text md:inline"
              >
                Convites
              </Link>
              <Link
                href="/perfil"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#1C2027] font-display text-base hover:brightness-110"
              >
                {estado.usuario.nome[0]?.toUpperCase()}
              </Link>
              <Link
                href="/perfil"
                className="hidden text-sm text-text-secondary hover:text-text md:inline"
              >
                {estado.usuario.nome}
              </Link>
              <button
                onClick={() => sair()}
                className="text-xs font-semibold uppercase tracking-wider text-text-tertiary hover:text-text"
              >
                Sair
              </button>
            </div>
          )}
        </div>
      </div>

      {menuAberto && (
        <>
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setMenuAberto(false)}
            className="fixed inset-0 top-[76px] z-30 bg-black/40 md:hidden"
          />
          <nav className="absolute inset-x-0 top-[76px] z-40 flex flex-col border-b border-border bg-nav-bg md:hidden">
            {linksNav.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="border-b border-border px-4 py-4 text-sm font-semibold uppercase tracking-wider text-text-secondary hover:bg-panel hover:text-text"
              >
                {l.rotulo}
              </Link>
            ))}
          </nav>
        </>
      )}
    </header>
  );
}

function IconeBola() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
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

function IconeMenu() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
    </svg>
  );
}

function IconeX() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}
