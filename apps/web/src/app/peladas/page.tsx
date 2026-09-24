'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  DIAS_SEMANA,
  MODALIDADES,
  MODALIDADE_LABEL,
  type ListarPeladasResponse,
  type Modalidade,
  type PeladaDTO,
} from '@peladafc/contracts';
import { Botao } from '@/components/botao';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const DIA_LABEL: Record<string, string> = {
  domingo: 'Domingos',
  segunda: 'Segundas',
  terca: 'Terças',
  quarta: 'Quartas',
  quinta: 'Quintas',
  sexta: 'Sextas',
  sabado: 'Sábados',
};

type Cidade = { nome: string; uf: string; totalLocais: number };

export default function PeladasPage() {
  const { estado } = useAuth();
  const [peladas, setPeladas] = useState<PeladaDTO[] | null>(null);
  const [cidades, setCidades] = useState<Cidade[]>([]);
  const [busca, setBusca] = useState('');
  const [cidade, setCidade] = useState('');
  const [modalidade, setModalidade] = useState<Modalidade | ''>('');
  const [diaSemana, setDiaSemana] = useState<string>('');
  const [abertas, setAbertas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ itens: Cidade[] }>('/cidades')
      .then((r) => setCidades(r.itens))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelado = false;
    setErro(null);
    (async () => {
      try {
        const params = new URLSearchParams();
        if (busca.trim()) params.set('busca', busca.trim());
        if (cidade) params.set('cidade', cidade);
        if (modalidade) params.set('modalidade', modalidade);
        if (diaSemana) params.set('diaSemana', diaSemana);
        if (abertas) params.set('abertaParaNovos', 'true');
        const qs = params.toString();
        const resp = await api.get<ListarPeladasResponse>(
          `/peladas${qs ? `?${qs}` : ''}`,
        );
        if (!cancelado) setPeladas(resp.itens);
      } catch (e) {
        if (!cancelado) setErro(e instanceof Error ? e.message : 'Erro');
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [busca, cidade, modalidade, diaSemana, abertas]);

  return (
    <main className="mx-auto max-w-container px-4 py-8 md:px-16 md:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <h1 className="font-display text-4xl uppercase leading-none sm:text-5xl">Peladas</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Descubra peladas públicas na sua região.
          </p>
        </div>
        {estado.status === 'autenticado' && (
          <Link href="/peladas/nova" className="sm:self-end">
            <Botao>Criar pelada</Botao>
          </Link>
        )}
      </div>

      <section className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_180px_180px] md:items-end">
        <input
          type="search"
          placeholder="Buscar por nome"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="h-11 border border-border-strong bg-panel px-4 text-sm outline-none placeholder:text-text-tertiary focus:border-accent"
        />
        <select
          value={cidade}
          onChange={(e) => setCidade(e.target.value)}
          className="h-11 border border-border-strong bg-panel px-3 text-sm outline-none focus:border-accent"
        >
          <option value="">Todas as cidades</option>
          {cidades.map((c) => (
            <option key={`${c.nome}-${c.uf}`} value={c.nome}>
              {c.nome}/{c.uf}
            </option>
          ))}
        </select>
        <select
          value={modalidade}
          onChange={(e) => setModalidade(e.target.value as Modalidade | '')}
          className="h-11 border border-border-strong bg-panel px-3 text-sm outline-none focus:border-accent"
        >
          <option value="">Toda modalidade</option>
          {MODALIDADES.map((m) => (
            <option key={m} value={m}>
              {MODALIDADE_LABEL[m]}
            </option>
          ))}
        </select>
        <select
          value={diaSemana}
          onChange={(e) => setDiaSemana(e.target.value)}
          className="h-11 border border-border-strong bg-panel px-3 text-sm outline-none focus:border-accent"
        >
          <option value="">Qualquer dia</option>
          {DIAS_SEMANA.map((d) => (
            <option key={d} value={d}>
              {DIA_LABEL[d]}
            </option>
          ))}
        </select>
      </section>

      <div className="mt-3">
        <button
          onClick={() => setAbertas((v) => !v)}
          className={[
            'border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors',
            abertas
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-border-strong bg-panel text-text-secondary hover:border-accent',
          ].join(' ')}
        >
          Abertas para novos jogadores
        </button>
      </div>

      {erro && <p className="mt-6 text-sm text-coral">{erro}</p>}

      <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {peladas === null && (
          <li className="col-span-full text-sm text-text-tertiary">Carregando…</li>
        )}
        {peladas?.length === 0 && (
          <li className="col-span-full text-sm text-text-tertiary">
            Nenhuma pelada com esses filtros.
          </li>
        )}
        {peladas?.map((p) => (
          <li key={p.id} className="border border-border bg-panel p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
              {MODALIDADE_LABEL[p.modalidade]}
            </p>
            <h2 className="mt-1 font-display text-xl uppercase leading-tight">
              <Link href={`/peladas/${p.slug}`} className="hover:text-accent">
                {p.nome}
              </Link>
            </h2>
            <p className="mt-3 text-sm text-text-secondary">
              {DIA_LABEL[p.diaSemana] ?? p.diaSemana} — {p.horario}
            </p>
            <p className="mt-1 text-xs text-text-tertiary">
              {p.totalJogadores} jogadores por partida
            </p>
            {p.precoEstimadoCentavos !== undefined && (
              <p className="mt-1 text-xs text-text-tertiary">
                {p.precoEstimadoCentavos === 0
                  ? 'Grátis'
                  : `${p.precoTemRateado ? '~' : ''}${(p.precoEstimadoCentavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por jogador`}
              </p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
