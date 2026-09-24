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
      <div className="mx-auto flex h-[76px] max-w-container items-center justify-between px-16">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center bg-accent font-display text-lg text-[#0B0D10]">
              P
            </span>
            <span className="font-display text-2xl uppercase leading-none">
              Pelada<span className="text-accent">FC</span>
            </span>
          </Link>
          <nav className="flex items-center gap-6 text-sm font-semibold">
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

        <div className="flex items-center gap-4">
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
            <div className="flex items-center gap-3">
              <Link
                href="/convites"
                className="text-xs font-semibold uppercase tracking-wider text-text-secondary hover:text-text"
              >
                Convites
              </Link>
              <Link
                href="/perfil"
                className="grid h-9 w-9 place-items-center rounded-full bg-[#1C2027] font-display text-base hover:brightness-110"
              >
                {estado.usuario.nome[0]?.toUpperCase()}
              </Link>
              <Link href="/perfil" className="text-sm text-text-secondary hover:text-text">
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
