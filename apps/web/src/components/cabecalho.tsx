'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useChrome } from '@/lib/chrome-context';
import { Botao } from './botao';

export function Cabecalho() {
  const { estado, sair } = useAuth();
  const { ocultarMenu } = useChrome();

  if (ocultarMenu) return null;

  return (
    <header className="border-b border-border bg-nav-bg">
      <div className="mx-auto flex h-[76px] max-w-container items-center justify-between gap-3 px-4 md:px-16">
        <div className="flex min-w-0 items-center gap-4 md:gap-8">
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
    </header>
  );
}
