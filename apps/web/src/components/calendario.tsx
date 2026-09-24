'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { CalendarioItemDTO, CalendarioResponse } from '@peladafc/contracts';
import { api } from '@/lib/api';
import { isApiError } from '@/lib/auth-context';

export function Calendario() {
  const [mesRef, setMesRef] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [itens, setItens] = useState<CalendarioItemDTO[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);

  const inicioMes = useMemo(() => new Date(mesRef), [mesRef]);
  const fimMes = useMemo(() => {
    const d = new Date(mesRef);
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [mesRef]);

  useEffect(() => {
    let cancelado = false;
    setItens(null);
    setErro(null);
    (async () => {
      try {
        const r = await api.get<CalendarioResponse>(
          `/me/calendario?desde=${inicioMes.toISOString()}&ate=${fimMes.toISOString()}`,
          { auth: true },
        );
        if (!cancelado) setItens(r.itens);
      } catch (e) {
        if (!cancelado) setErro(isApiError(e) ? e.mensagem : 'Erro ao carregar calendário');
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [inicioMes, fimMes]);

  const porDia = useMemo(() => {
    const mapa = new Map<string, CalendarioItemDTO[]>();
    for (const i of itens ?? []) {
      const chave = new Date(i.data).toISOString().slice(0, 10);
      const arr = mapa.get(chave) ?? [];
      arr.push(i);
      mapa.set(chave, arr);
    }
    return mapa;
  }, [itens]);

  const dias = useMemo(() => {
    const inicio = new Date(inicioMes);
    inicio.setDate(inicio.getDate() - inicio.getDay());
    const fim = new Date(fimMes);
    fim.setDate(fim.getDate() + (6 - fim.getDay()));
    const grid: Date[] = [];
    for (let d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
      grid.push(new Date(d));
    }
    return grid;
  }, [inicioMes, fimMes]);

  const irMes = (delta: number) => {
    setMesRef((atual) => {
      const d = new Date(atual);
      d.setMonth(d.getMonth() + delta);
      return d;
    });
    setDiaSelecionado(null);
  };

  const nomeMes = inicioMes.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
  const itensDoDia = diaSelecionado ? porDia.get(diaSelecionado) ?? [] : [];

  return (
    <section className="border border-border bg-panel p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">
          Calendário
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => irMes(-1)}
            className="grid h-6 w-6 place-items-center border border-border-strong bg-panel-2 text-xs hover:border-accent"
            aria-label="Mês anterior"
          >
            ‹
          </button>
          <span className="min-w-[4.5rem] text-center font-display text-xs uppercase">
            {nomeMes}
          </span>
          <button
            onClick={() => irMes(1)}
            className="grid h-6 w-6 place-items-center border border-border-strong bg-panel-2 text-xs hover:border-accent"
            aria-label="Próximo mês"
          >
            ›
          </button>
        </div>
      </div>

      {erro && <p className="mt-2 text-xs text-coral">{erro}</p>}

      <div className="mt-3 grid grid-cols-7 gap-px text-center text-[9px] font-bold uppercase tracking-wider text-text-tertiary">
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
          <div key={i} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {dias.map((d) => {
          const chave = d.toISOString().slice(0, 10);
          const list = porDia.get(chave) ?? [];
          const noMes = d.getMonth() === inicioMes.getMonth();
          const hoje = new Date();
          hoje.setHours(0, 0, 0, 0);
          const ehHoje = d.getTime() === hoje.getTime();
          const selecionado = chave === diaSelecionado;
          const temItem = list.length > 0;
          const corPrimaria = list[0]?.status === 'cancelada'
            ? 'bg-coral'
            : list[0]?.status === 'finalizada'
              ? 'bg-text-tertiary'
              : list[0]?.papel === 'convidado'
                ? 'bg-dourado'
                : 'bg-accent';
          return (
            <button
              key={chave}
              type="button"
              disabled={!temItem}
              onClick={() => setDiaSelecionado(selecionado ? null : chave)}
              className={[
                'relative flex aspect-square items-center justify-center text-xs transition-colors',
                noMes ? 'text-text-tertiary/60' : ehHoje ? 'text-accent' : 'text-text',
                selecionado ? 'bg-accent/20 outline outline-1 outline-accent' : '',
                temItem ? 'cursor-pointer hover:bg-panel-2' : 'cursor-default',
              ].join(' ')}
            >
              <span className={ehHoje ? 'font-display' : ''}>{d.getDate()}</span>
              {temItem && (
                <span
                  className={[
                    'absolute bottom-1 h-1 w-1 rounded-full',
                    corPrimaria,
                  ].join(' ')}
                />
              )}
            </button>
          );
        })}
      </div>

      {diaSelecionado && itensDoDia.length > 0 && (
        <div className="mt-3 border-t border-dotted border-border-strong pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
            {new Date(diaSelecionado + 'T00:00:00').toLocaleDateString('pt-BR', {
              weekday: 'short',
              day: '2-digit',
              month: 'short',
            })}
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {itensDoDia.map((i) => (
              <li key={i.partidaId}>
                <Link
                  href={{ pathname: `/partidas/${i.partidaId}` }}
                  className="flex items-center justify-between gap-2 border border-border bg-panel-2 px-2 py-1.5 text-xs hover:border-accent"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-text">
                      {new Date(i.data).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>{' '}
                    <span className="text-text-secondary">· {i.pelada.nome}</span>
                  </span>
                  <span
                    className={[
                      'text-[9px] font-bold uppercase',
                      i.papel === 'convidado' ? 'text-dourado' : 'text-accent',
                    ].join(' ')}
                  >
                    {i.papel === 'convidado' ? 'conv' : i.papel === 'membro' ? 'mem' : 'pres'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
