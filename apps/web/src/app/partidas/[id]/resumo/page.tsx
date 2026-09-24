'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EventoPartidaDTO, PartidaAoVivo, TimeDTO } from '@peladafc/contracts';
import { ROTULOS_MODO_DESEMPATE } from '@peladafc/contracts';
import { Botao } from '@/components/botao';
import { api, ApiError } from '@/lib/api';
import { isApiError, useAuth } from '@/lib/auth-context';
import { corLegivel } from '@/lib/cor';

// Resumo é a única tela do fluxo live acessível sem login — a URL é
// compartilhável (UUID v7 dificulta guessing). Convidados que abrem o link
// veem placar, log de gols e artilheiros; usuários logados também veem
// o botão "Nova pelada".

export default function ResumoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { estado } = useAuth();
  const [partida, setPartida] = useState<PartidaAoVivo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [duplicando, setDuplicando] = useState(false);
  const autenticado = estado.status === 'autenticado';

  // Fluxo "próxima rodada": duplica a partida (mesmos times/jogadores) e
  // manda pra ao-vivo direto — timer zerado, botão "Iniciar" visível. Se o
  // usuário precisa mexer no time, usa Substituição na própria tela ao-vivo.
  const duplicar = async () => {
    setErro(null);
    setDuplicando(true);
    try {
      const nova = await api.post<PartidaAoVivo>(
        `/partidas/${id}/duplicar`,
        undefined,
        { auth: true },
      );
      router.push(`/partidas/${nova.id}/ao-vivo`);
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro ao criar nova partida');
      setDuplicando(false);
    }
  };

  const carregar = useCallback(async () => {
    // Endpoint público — não requer auth. `auth: true` só envia o Bearer se
    // houver token (não força login).
    const p = await api.get<PartidaAoVivo>(`/partidas/${id}`, { auth: true });
    setPartida(p);
  }, [id]);

  useEffect(() => {
    // Aguarda a auth terminar de carregar pra evitar refetches desnecessários.
    if (estado.status === 'carregando') return;
    let cancelado = false;
    (async () => {
      try {
        await carregar();
      } catch (err) {
        if (cancelado) return;
        setErro(err instanceof ApiError && err.status === 404 ? 'Partida não encontrada' : 'Erro');
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [carregar, estado.status]);

  const times = useMemo(() => ordenarTimes(partida?.times ?? []), [partida?.times]);
  // Racha 3+ times: rodadas são disjuntas (winner stays). O placar aqui é
  // o da última rodada (após o último `rodada_encerrada`) — somar gols da
  // partida inteira misturaria rodadas de duelos diferentes. Times fora de
  // campo na última rodada não aparecem no placar principal.
  const rodada3Mais = (partida?.times.length ?? 0) >= 3;
  const emCampoUltimaRodada = useMemo<string[]>(() => {
    if (!partida) return [];
    if (!rodada3Mais) return times.map((t) => t.id);
    if (partida.emCampoTeamIds.length === 2) return [...partida.emCampoTeamIds];
    return times.slice(0, 2).map((t) => t.id);
  }, [partida, rodada3Mais, times]);
  const placares = useMemo(
    () => contarGolsPorTime(partida?.eventos ?? [], times, rodada3Mais),
    [partida?.eventos, times, rodada3Mais],
  );
  const timesEmCampo = useMemo(
    () => times.filter((t) => emCampoUltimaRodada.includes(t.id)),
    [times, emCampoUltimaRodada],
  );
  const timesForaDeCampo = useMemo(
    () => times.filter((t) => !emCampoUltimaRodada.includes(t.id)),
    [times, emCampoUltimaRodada],
  );
  const rankingPorTime = useMemo(() => {
    const mapa = new Map<string, { vitorias: number; derrotas: number; saldoGols: number }>();
    for (const r of partida?.ranking ?? []) mapa.set(r.teamId, r);
    return mapa;
  }, [partida?.ranking]);

  if (erro) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <p className="text-sm text-coral">{erro}</p>
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

  const vencedor = deduzirVencedor(partida, timesEmCampo, placares);
  const gols = partida.eventos.filter((e) => e.tipo === 'gol' || e.tipo === 'gol_contra');

  const compartilhar = async () => {
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}/partidas/${id}/resumo`
        : `/partidas/${id}/resumo`;
    const texto = montarTextoShare(partida, times, placares, vencedor, url);
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ text: texto });
        return;
      } catch {
        // usuário cancelou; segue pro fallback de clipboard
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(texto);
    }
  };

  return (
    <main className="mx-auto min-h-[calc(100vh-76px)] max-w-md px-4 pt-6 pb-[calc(140px+env(safe-area-inset-bottom))]">
      <p className="text-center font-display text-xs uppercase tracking-wider text-text-tertiary">
        {partida.status === 'finalizada' ? 'Partida encerrada' : 'Em andamento'}
      </p>
      <h1
        className="mt-4 text-center font-display text-4xl uppercase leading-none tracking-wider sm:text-5xl md:text-6xl"
        style={{ color: vencedor ? corLegivel(vencedor.cor) : undefined }}
      >
        {vencedor ? `${vencedor.nome} venceu!` : 'Empate'}
      </h1>

      <section className="mt-8 flex flex-col divide-y divide-border border-y border-border bg-panel">
        {timesEmCampo.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-3 py-3">
            <span className="h-5 w-5 flex-none" style={{ backgroundColor: t.cor ?? '#5C6470' }} />
            <span className="flex-1 truncate font-display text-base uppercase tracking-wider">
              {t.nome}
            </span>
            <span
              className="font-display text-4xl leading-none tabular-nums"
              style={{ color: corLegivel(t.cor, '#F4F5F6') }}
            >
              {placares.get(t.id) ?? 0}
            </span>
          </div>
        ))}
      </section>

      {rodada3Mais && timesForaDeCampo.length > 0 && (
        <section className="mt-4">
          <p className="mb-2 font-display text-[10px] uppercase tracking-wider text-text-tertiary">
            Fora de campo
          </p>
          <div className="flex flex-col divide-y divide-border border-y border-border bg-panel">
            {timesForaDeCampo.map((t) => {
              const r = rankingPorTime.get(t.id);
              const jogou = r != null && (r.vitorias > 0 || r.derrotas > 0);
              return (
                <div key={t.id} className="flex items-center gap-3 px-3 py-2">
                  <span
                    className="h-4 w-4 flex-none"
                    style={{ backgroundColor: t.cor ?? '#5C6470' }}
                  />
                  <span className="flex-1 truncate font-display text-sm uppercase tracking-wider text-text-secondary">
                    {t.nome}
                  </span>
                  {jogou ? (
                    <span className="font-display text-[10px] uppercase tracking-wider text-text-tertiary tabular-nums">
                      {r!.vitorias}V · {r!.derrotas}D
                    </span>
                  ) : (
                    <span className="font-display text-[10px] uppercase tracking-wider text-text-tertiary">
                      Não jogou
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {partida.desempateVencedorTeamId && partida.modoDesempate && (
        <p className="mt-6 text-center text-sm text-text-secondary">
          Decidida por {ROTULOS_MODO_DESEMPATE[partida.modoDesempate].toLowerCase()}
        </p>
      )}

      {gols.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 font-display text-sm uppercase tracking-wider text-text-secondary">
            Gols
          </h2>
          <ul className="flex flex-col divide-y divide-border border-y border-border bg-panel">
            {gols.map((g) => (
              <LinhaGol key={g.id} evento={g} times={times} />
            ))}
          </ul>
        </section>
      )}

      {erro && (
        <p className="mt-4 text-center text-sm text-coral">{erro}</p>
      )}

      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-nav-bg px-4 pt-3
                   pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto flex max-w-md flex-col gap-2">
          {autenticado && (
            <Botao
              onClick={duplicar}
              carregando={duplicando}
              className="h-14 w-full text-base"
            >
              Próxima rodada
            </Botao>
          )}
          <Botao
            variante="secundario"
            onClick={compartilhar}
            className="h-12 w-full text-sm"
          >
            Compartilhar
          </Botao>
          {autenticado ? (
            <Link href="/pelada/iniciar" className="w-full">
              <Botao variante="secundario" className="h-12 w-full text-sm">
                Iniciar novo racha
              </Botao>
            </Link>
          ) : (
            <Link href="/entrar" className="w-full">
              <Botao variante="secundario" className="h-12 w-full text-sm">
                Entrar no PeladaFC
              </Botao>
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

function ordenarTimes(times: TimeDTO[]): TimeDTO[] {
  return [...times].sort((a, b) => a.nome.localeCompare(b.nome));
}

function contarGolsPorTime(
  eventos: EventoPartidaDTO[],
  times: TimeDTO[],
  escoparPorRodada = false,
): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const t of times) mapa.set(t.id, 0);
  let cutoff: Date | null = null;
  if (escoparPorRodada) {
    for (const e of eventos) {
      if (e.tipo !== 'rodada_encerrada') continue;
      if (!cutoff || e.criadoEm > cutoff) cutoff = e.criadoEm;
    }
  }
  for (const e of eventos) {
    if (e.tipo !== 'gol' && e.tipo !== 'gol_contra') continue;
    if (cutoff && e.criadoEm <= cutoff) continue;
    mapa.set(e.teamId, (mapa.get(e.teamId) ?? 0) + 1);
  }
  return mapa;
}

function deduzirVencedor(
  partida: PartidaAoVivo,
  times: TimeDTO[],
  placares: Map<string, number>,
): TimeDTO | null {
  if (partida.desempateVencedorTeamId) {
    return times.find((t) => t.id === partida.desempateVencedorTeamId) ?? null;
  }
  const scores = times.map((t) => ({ time: t, gols: placares.get(t.id) ?? 0 }));
  const max = Math.max(...scores.map((s) => s.gols));
  const lideres = scores.filter((s) => s.gols === max);
  if (lideres.length === 1) return lideres[0]!.time;
  return null;
}

function LinhaGol({ evento, times }: { evento: EventoPartidaDTO; times: TimeDTO[] }) {
  const time = times.find((t) => t.id === evento.teamId);
  const minutos = Math.floor(evento.minutoJogo / 60);
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm">
      <span className="w-10 text-xs tabular-nums text-text-tertiary">{minutos}&apos;</span>
      <span className="h-3 w-3 flex-none" style={{ backgroundColor: time?.cor ?? '#5C6470' }} />
      <span className="flex-1 truncate">
        {evento.jogador?.nome ?? 'Gol sem autor'}
        {evento.tipo === 'gol_contra' && (
          <span className="ml-2 text-xs uppercase text-text-tertiary">(contra)</span>
        )}
        {evento.assistente && (
          <span className="ml-2 text-xs text-text-tertiary">assist: {evento.assistente.nome}</span>
        )}
      </span>
      <span className="font-display text-xs uppercase tracking-wider text-text-tertiary">
        {time?.nome ?? '—'}
      </span>
    </li>
  );
}

function montarTextoShare(
  partida: PartidaAoVivo,
  times: TimeDTO[],
  placares: Map<string, number>,
  vencedor: TimeDTO | null,
  url: string,
): string {
  const linhas: string[] = [];
  linhas.push(partida.nome ? `⚽ ${partida.nome}` : '⚽ Pelada');
  // Placar de todos os times em ordem alfabética; formato adaptativo para 2 vs N.
  if (times.length === 2 && times[0] && times[1]) {
    linhas.push(
      `${times[0].nome} ${placares.get(times[0].id) ?? 0} x ${placares.get(times[1].id) ?? 0} ${times[1].nome}`,
    );
  } else {
    for (const t of times) {
      linhas.push(`${t.nome}: ${placares.get(t.id) ?? 0}`);
    }
  }
  if (vencedor) {
    if (partida.desempateVencedorTeamId && partida.modoDesempate) {
      linhas.push(`🏆 ${vencedor.nome} (${ROTULOS_MODO_DESEMPATE[partida.modoDesempate]})`);
    } else {
      linhas.push(`🏆 ${vencedor.nome}`);
    }
  } else if (partida.status === 'finalizada') {
    linhas.push('Empate');
  }

  const artilheiros = new Map<string, { nome: string; gols: number }>();
  for (const e of partida.eventos) {
    if (e.tipo !== 'gol' || !e.jogador) continue;
    const linha = artilheiros.get(e.jogador.id) ?? { nome: e.jogador.nome, gols: 0 };
    linha.gols += 1;
    artilheiros.set(e.jogador.id, linha);
  }
  const top = [...artilheiros.values()].sort((a, b) => b.gols - a.gols).slice(0, 3);
  if (top.length > 0) {
    linhas.push('');
    linhas.push('Gols:');
    for (const a of top) linhas.push(`• ${a.nome} (${a.gols})`);
  }

  linhas.push('');
  linhas.push(url);
  return linhas.join('\n');
}
