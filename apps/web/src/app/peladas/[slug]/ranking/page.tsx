'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PeladaDTO, RankingResponse } from '@peladafc/contracts';
import { CATEGORIA_LABEL, CATEGORIAS_RANKING, type CategoriaRanking } from '@peladafc/domain';
import { api } from '@/lib/api';

const HEADERS: Record<CategoriaRanking, { valor: string }> = {
  geral: { valor: 'J' },
  artilharia: { valor: 'G' },
  vitorias: { valor: 'V' },
  assistencias: { valor: 'A' },
  mvp: { valor: 'MVP' },
  aproveitamento: { valor: '%' },
};

export default function RankingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [pelada, setPelada] = useState<PeladaDTO | null>(null);
  const [ranking, setRanking] = useState<RankingResponse | null>(null);
  const [categoria, setCategoria] = useState<CategoriaRanking>('geral');

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const p = await api.get<PeladaDTO>(`/peladas/${slug}`);
        if (cancelado) return;
        setPelada(p);
        const r = await api.get<RankingResponse>(
          `/peladas/${p.id}/rankings?categoria=${categoria}`,
        );
        if (!cancelado) setRanking(r);
      } catch {
        /* noop */
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [slug, categoria]);

  if (!pelada) {
    return <main className="mx-auto max-w-container px-4 py-10 md:px-16 md:py-16 text-text-tertiary">Carregando…</main>;
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link
        href={{ pathname: `/peladas/${pelada.slug}` }}
        className="text-xs text-text-tertiary hover:text-text"
      >
        ← {pelada.nome}
      </Link>
      <h1 className="mt-2 font-display text-4xl uppercase leading-none sm:text-5xl">Ranking</h1>

      <nav className="mt-8 flex flex-wrap gap-2 border-b border-border">
        {CATEGORIAS_RANKING.map((c) => {
          const ativo = c === categoria;
          return (
            <button
              key={c}
              onClick={() => setCategoria(c)}
              className={[
                'px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors',
                ativo
                  ? 'border-b-2 border-accent text-accent'
                  : 'border-b-2 border-transparent text-text-secondary hover:text-text',
              ].join(' ')}
            >
              {CATEGORIA_LABEL[c]}
            </button>
          );
        })}
      </nav>

      {ranking === null ? (
        <p className="mt-8 text-sm text-text-tertiary">Carregando…</p>
      ) : ranking.linhas.length === 0 ? (
        <p className="mt-8 text-sm text-text-tertiary">
          Nenhuma partida finalizada ainda. O ranking aparece após registrar resultados.
        </p>
      ) : (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-strong text-left text-[11px] font-bold uppercase tracking-wider text-text-secondary">
              <th className="py-2 pr-2">#</th>
              <th className="py-2">Jogador</th>
              <th className="py-2 text-right">J</th>
              <th className="py-2 text-right">V</th>
              <th className="py-2 text-right">G</th>
              <th className="py-2 text-right">A</th>
              <th className="py-2 text-right">MVP</th>
              <th className="py-2 text-right">{HEADERS[categoria].valor}</th>
            </tr>
          </thead>
          <tbody>
            {ranking.linhas.map((l) => (
              <tr
                key={l.jogadorId}
                className={[
                  'border-b border-border',
                  l.posicao === 1 && categoria !== 'geral' ? 'text-dourado' : 'text-text',
                ].join(' ')}
              >
                <td className="py-2 pr-2 font-display text-lg">{l.posicao}</td>
                <td className="py-2">
                  <span className="mr-2 inline-grid h-7 w-7 place-items-center rounded-full bg-[#1C2027] font-display text-xs">
                    {l.avatarInicial}
                  </span>
                  {l.nome}
                </td>
                <td className="py-2 text-right">{l.estatisticas.partidas}</td>
                <td className="py-2 text-right">{l.estatisticas.vitorias}</td>
                <td className="py-2 text-right">{l.estatisticas.gols}</td>
                <td className="py-2 text-right">{l.estatisticas.assistencias}</td>
                <td className="py-2 text-right">{l.estatisticas.mvps}</td>
                <td className="py-2 text-right font-display">
                  {categoria === 'aproveitamento' ? `${l.valor}%` : l.valor}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
