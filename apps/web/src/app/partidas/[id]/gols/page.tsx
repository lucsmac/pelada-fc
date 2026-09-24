'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CriarEventoBody,
  EventoPartidaDTO,
  PartidaAoVivo,
  TimeDTO,
} from '@peladafc/contracts';
import { Botao } from '@/components/botao';
import { api, ApiError } from '@/lib/api';
import { isApiError, useAuth } from '@/lib/auth-context';

// Modo retroativo: partida já rolou, o app só serve pra registrar quem fez os
// gols. Sem cronômetro (minutoJogo=0) e com lista de eventos em destaque pra
// facilitar edição.

export default function GolsRetroativosPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { estado } = useAuth();
  const [partida, setPartida] = useState<PartidaAoVivo | null>(null);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [selecao, setSelecao] = useState<{ time: TimeDTO } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    const p = await api.get<PartidaAoVivo>(`/partidas/${id}`, { auth: true });
    setPartida(p);
    return p;
  }, [id]);

  useEffect(() => {
    if (estado.status === 'anonimo') {
      router.replace(`/entrar?redirect=/partidas/${id}/gols`);
      return;
    }
    if (estado.status !== 'autenticado') return;
    let cancelado = false;
    (async () => {
      try {
        await carregar();
      } catch (err) {
        if (cancelado) return;
        setErroCarregar(
          err instanceof ApiError && err.status === 404 ? 'Partida não encontrada' : 'Erro',
        );
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [carregar, estado.status, id, router]);

  const times = useMemo(() => ordenarTimes(partida?.times ?? []), [partida?.times]);
  const placares = useMemo(
    () => contarGols(partida?.eventos ?? [], times),
    [partida?.eventos, times],
  );

  if (erroCarregar) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <p className="text-sm text-coral">{erroCarregar}</p>
      </main>
    );
  }
  if (!partida || times.length < 2) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <p className="text-sm text-text-secondary">Carregando…</p>
      </main>
    );
  }

  const registrarGol = async (teamId: string, jogadorId: string | null) => {
    setErro(null);
    setEnviando(true);
    try {
      const body: CriarEventoBody = {
        teamId,
        jogadorId,
        assistenteJogadorId: null,
        tipo: 'gol',
        minutoJogo: 0,
      };
      await api.post(`/partidas/${id}/eventos`, body, { auth: true });
      setSelecao(null);
      await carregar();
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro');
    } finally {
      setEnviando(false);
    }
  };

  const apagarEvento = async (eventoId: string) => {
    setErro(null);
    try {
      await api.delete(`/partidas/${id}/eventos/${eventoId}`, { auth: true });
      await carregar();
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro');
    }
  };

  const salvarEFinalizar = async () => {
    setErro(null);
    try {
      await api.post(`/partidas/${id}/finalizar`, {}, { auth: true });
      router.replace(`/partidas/${id}/resumo`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        router.push(`/partidas/${id}/desempate`);
        return;
      }
      setErro(isApiError(err) ? err.mensagem : 'Erro ao finalizar');
    }
  };

  const gols = partida.eventos.filter((e) => e.tipo === 'gol' || e.tipo === 'gol_contra');

  return (
    <main className="mx-auto min-h-[calc(100vh-76px)] max-w-md px-4 pt-6 pb-[calc(96px+env(safe-area-inset-bottom))]">
      <header className="mb-4">
        <h1 className="font-display text-3xl uppercase tracking-wider">Registrar gols</h1>
        <p className="mt-1 text-sm text-text-secondary">Sem cronômetro — só o placar final</p>
      </header>

      <section className="mb-6 flex flex-col divide-y divide-border border-y border-border bg-panel">
        {times.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-3 py-2">
            <span className="h-4 w-4 flex-none" style={{ backgroundColor: t.cor ?? '#5C6470' }} />
            <span className="flex-1 truncate font-display text-sm uppercase tracking-wider">
              {t.nome}
            </span>
            <span
              className="font-display text-3xl leading-none tabular-nums"
              style={{ color: t.cor ?? undefined }}
            >
              {placares.get(t.id) ?? 0}
            </span>
          </div>
        ))}
      </section>

      <div className={times.length > 2 ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-2 gap-2'}>
        {times.map((t) => (
          <Botao
            key={t.id}
            className="h-14"
            onClick={() => setSelecao({ time: t })}
            disabled={enviando}
          >
            + Gol {t.nome}
          </Botao>
        ))}
      </div>

      {gols.length > 0 && (
        <section className="mt-6">
          <p className="mb-2 font-display text-xs uppercase tracking-wider text-text-tertiary">
            Gols registrados
          </p>
          <ul className="flex flex-col divide-y divide-border border-y border-border bg-panel">
            {gols.map((g) => {
              const time = times.find((t) => t.id === g.teamId);
              return (
                <li key={g.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span
                    className="h-3 w-3 flex-none"
                    style={{ backgroundColor: time?.cor ?? '#5C6470' }}
                  />
                  <span className="flex-1 truncate">
                    {g.jogador?.nome ?? 'Sem autor'}
                    {time && (
                      <span className="ml-2 text-xs uppercase text-text-tertiary">
                        {time.nome}
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => apagarEvento(g.id)}
                    className="font-display text-xs uppercase tracking-wider text-text-tertiary hover:text-coral"
                  >
                    Remover
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {erro && <p className="mt-4 text-sm text-coral">{erro}</p>}

      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-nav-bg px-4 pt-3
                   pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto max-w-md">
          <Botao className="h-14 w-full text-base" onClick={salvarEFinalizar}>
            Salvar e finalizar
          </Botao>
        </div>
      </div>

      {selecao && (
        <BottomSheetJogador
          time={selecao.time}
          onSelecionar={(jogadorId) => registrarGol(selecao.time.id, jogadorId)}
          onCancelar={() => setSelecao(null)}
          enviando={enviando}
        />
      )}
    </main>
  );
}

function ordenarTimes(times: TimeDTO[]): TimeDTO[] {
  return [...times].sort((a, b) => a.nome.localeCompare(b.nome));
}

function contarGols(eventos: EventoPartidaDTO[], times: TimeDTO[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const t of times) mapa.set(t.id, 0);
  for (const e of eventos) {
    if (e.tipo === 'penalti_desempate') continue;
    mapa.set(e.teamId, (mapa.get(e.teamId) ?? 0) + 1);
  }
  return mapa;
}

function BottomSheetJogador({
  time,
  onSelecionar,
  onCancelar,
  enviando,
}: {
  time: TimeDTO;
  onSelecionar: (jogadorId: string | null) => void;
  onCancelar: () => void;
  enviando: boolean;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/60" onClick={onCancelar}>
      <div
        className="w-full max-h-[80vh] overflow-y-auto border-t border-border-strong bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex max-w-md flex-col gap-3">
          <p className="text-center font-display text-lg uppercase tracking-wider">
            Quem marcou pelo {time.nome}?
          </p>
          <div className="flex flex-col gap-2">
            {time.jogadores.map((tp) => (
              <button
                key={tp.id}
                disabled={enviando}
                onClick={() => onSelecionar(tp.jogadorId)}
                className="flex h-14 items-center gap-3 border border-border-strong bg-panel-2 px-3 text-left text-sm transition-all active:scale-[0.98] active:bg-accent/20 disabled:opacity-40"
              >
                <span
                  className="grid h-9 w-9 flex-none place-items-center rounded-full font-display text-base"
                  style={{ backgroundColor: time.cor ?? '#262B32', color: '#0B0D10' }}
                >
                  {tp.jogador.avatarInicial}
                </span>
                <span className="truncate">{tp.jogador.nome}</span>
              </button>
            ))}
            <button
              disabled={enviando}
              onClick={() => onSelecionar(null)}
              className="flex h-12 items-center justify-center border border-dashed border-border-strong bg-panel/50 font-display text-xs uppercase tracking-wider text-text-secondary transition-all active:bg-accent/10 disabled:opacity-40"
            >
              Sem autor identificado
            </button>
          </div>
          <Botao variante="secundario" className="h-12" onClick={onCancelar} disabled={enviando}>
            Cancelar
          </Botao>
        </div>
      </div>
    </div>
  );
}
