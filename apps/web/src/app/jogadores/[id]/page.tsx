'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PerfilJogadorResponse } from '@peladafc/contracts';
import { ROTULOS_POSICAO_LINHA } from '@peladafc/contracts';
import { api, ApiError } from '@/lib/api';

export default function PerfilJogadorPage() {
  const { id } = useParams<{ id: string }>();
  const [perfil, setPerfil] = useState<PerfilJogadorResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const p = await api.get<PerfilJogadorResponse>(`/jogadores/${id}`, { auth: true });
        if (!cancelado) setPerfil(p);
      } catch (e) {
        if (!cancelado) {
          if (e instanceof ApiError && e.status === 403) setErro('Perfil privado');
          else if (e instanceof ApiError && e.status === 404) setErro('Jogador não encontrado');
          else setErro('Erro ao carregar');
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [id]);

  if (erro) {
    return (
      <main className="mx-auto max-w-container px-16 py-16">
        <h1 className="font-display text-4xl uppercase">{erro}</h1>
      </main>
    );
  }
  if (!perfil) {
    return <main className="mx-auto max-w-container px-16 py-16 text-text-tertiary">Carregando…</main>;
  }

  const { jogador, carreira, peladas, rating } = perfil;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center gap-6">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-[#1C2027] font-display text-3xl">
          {jogador.avatarInicial}
        </div>
        <div className="flex-1">
          <h1 className="font-display text-5xl uppercase leading-none">{jogador.nome}</h1>
          {jogador.apelido && (
            <p className="mt-1 text-sm text-text-secondary">"{jogador.apelido}"</p>
          )}
          <p className="mt-1 text-xs text-text-tertiary">
            {jogador.funcaoPreferida === 'goleiro'
              ? 'Goleiro'
              : jogador.funcaoPreferida === 'linha'
                ? jogador.posicaoLinha
                  ? ROTULOS_POSICAO_LINHA[jogador.posicaoLinha]
                  : 'Linha'
                : '—'}
            {jogador.cidadeAtual && ` · ${jogador.cidadeAtual}`}
          </p>
        </div>
        {rating !== null && (
          <div className="border border-accent bg-accent/10 px-4 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-wider text-accent">Rating</p>
            <p className="font-display text-4xl text-accent">{rating}</p>
          </div>
        )}
      </div>

      {carreira && (
        <section className="mt-10">
          <h2 className="border-b border-dotted border-border-strong pb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            Carreira
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metrica rotulo="Partidas" valor={carreira.partidas} />
            <Metrica rotulo="Vitórias" valor={carreira.vitorias} />
            <Metrica rotulo="Gols" valor={carreira.gols} />
            <Metrica rotulo="Assistências" valor={carreira.assistencias} />
            <Metrica rotulo="Empates" valor={carreira.empates} />
            <Metrica rotulo="Derrotas" valor={carreira.derrotas} />
            <Metrica rotulo="MVPs" valor={carreira.mvps} destaque="dourado" />
          </div>
        </section>
      )}

      {peladas && peladas.length > 0 && (
        <section className="mt-10">
          <h2 className="border-b border-dotted border-border-strong pb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            Peladas
          </h2>
          <ul className="mt-4 flex flex-col divide-y divide-border">
            {peladas.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-3">
                <Link
                  href={{ pathname: `/peladas/${p.slug}` }}
                  className="text-sm hover:text-accent"
                >
                  {p.nome}
                </Link>
                {p.papel === 'admin' && (
                  <span className="text-[10px] font-bold uppercase text-accent">Dono</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Metrica({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: number;
  destaque?: 'dourado';
}) {
  return (
    <div className="border border-border bg-panel-2 p-4">
      <p
        className={[
          'border-b-[3px] pb-1 text-[10px] font-bold uppercase tracking-wider text-text-secondary',
          destaque === 'dourado' ? 'border-dourado' : 'border-accent',
        ].join(' ')}
      >
        {rotulo}
      </p>
      <p className="mt-2 font-display text-4xl leading-none">{valor}</p>
    </div>
  );
}
