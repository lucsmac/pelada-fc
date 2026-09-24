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
  const placares = useMemo(
    () => contarGolsPorTime(partida?.eventos ?? [], times),
    [partida?.eventos, times],
  );

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

  const vencedor = deduzirVencedor(partida, times, placares);
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
        className="mt-4 text-center font-display text-6xl uppercase leading-none tracking-wider"
        style={{ color: vencedor ? corLegivel(vencedor.cor) : undefined }}
      >
        {vencedor ? `${vencedor.nome} venceu!` : 'Empate'}
      </h1>

      <section className="mt-8 flex flex-col divide-y divide-border border-y border-border bg-panel">
        {times.map((t) => (
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
): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const t of times) mapa.set(t.id, 0);
  for (const e of eventos) {
    if (e.tipo !== 'gol' && e.tipo !== 'gol_contra') continue;
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
