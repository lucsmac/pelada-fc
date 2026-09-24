import type { PrismaClient } from '@peladafc/db';
import type { EstatisticasJogador, LinhaRanking } from '@peladafc/domain';

/**
 * Agrega estatísticas de todos os jogadores dentro de um escopo (opcionalmente
 * uma pelada e/ou temporada), varrendo partidas finalizadas.
 *
 * - Gols / assistências / MVPs: soma de EstatisticaPartida por jogador.
 * - Vitórias / empates / derrotas: derivadas do placar da partida cruzada com
 *   o time em que o jogador estava.
 * - Partidas: presença "confirmado" em partida com status "finalizada".
 */
export async function calcularRanking(
  prisma: PrismaClient,
  scope: { peladaId?: string; temporadaId?: string },
): Promise<LinhaRanking[]> {
  const partidaWhere = {
    status: 'finalizada' as const,
    ...(scope.peladaId && { peladaId: scope.peladaId }),
    ...(scope.temporadaId && { temporadaId: scope.temporadaId }),
  };

  const partidas = await prisma.partida.findMany({
    where: partidaWhere,
    include: {
      times: { include: { jogadores: true } },
      estatisticas: true,
      presencas: { where: { status: 'confirmado' } },
    },
  });

  // Map: jogadorId → estatísticas + info de exibição
  const acc = new Map<
    string,
    { est: EstatisticasJogador; nome: string; avatarInicial: string }
  >();

  const bump = (jogadorId: string, patch: Partial<EstatisticasJogador>) => {
    const atual =
      acc.get(jogadorId)?.est ??
      ({
        partidas: 0,
        gols: 0,
        assistencias: 0,
        vitorias: 0,
        empates: 0,
        derrotas: 0,
        mvps: 0,
      } as EstatisticasJogador);
    for (const [k, v] of Object.entries(patch) as [keyof EstatisticasJogador, number][]) {
      atual[k] = (atual[k] ?? 0) + v;
    }
    const anterior = acc.get(jogadorId);
    acc.set(jogadorId, {
      est: atual,
      nome: anterior?.nome ?? '',
      avatarInicial: anterior?.avatarInicial ?? '?',
    });
  };

  // Coleta identidade dos jogadores relevantes
  const jogadorIds = new Set<string>();
  for (const p of partidas) {
    p.presencas.forEach((a) => jogadorIds.add(a.jogadorId));
    p.estatisticas.forEach((e) => jogadorIds.add(e.jogadorId));
    p.times.forEach((t) => t.jogadores.forEach((tp) => jogadorIds.add(tp.jogadorId)));
  }
  const jogadores = await prisma.jogador.findMany({
    where: { id: { in: Array.from(jogadorIds) } },
    select: { id: true, nome: true, avatarInicial: true },
  });
  for (const j of jogadores) {
    acc.set(j.id, {
      est: {
        partidas: 0,
        gols: 0,
        assistencias: 0,
        vitorias: 0,
        empates: 0,
        derrotas: 0,
        mvps: 0,
      },
      nome: j.nome,
      avatarInicial: j.avatarInicial,
    });
  }

  // Percorre partidas
  for (const p of partidas) {
    const timeA = p.times[0];
    const timeB = p.times[1];
    const jogadoresTimeA = new Set(timeA?.jogadores.map((tp) => tp.jogadorId) ?? []);
    const jogadoresTimeB = new Set(timeB?.jogadores.map((tp) => tp.jogadorId) ?? []);

    const empatou = p.placarTimeA === p.placarTimeB;
    const venceuA = p.placarTimeA > p.placarTimeB;

    for (const pres of p.presencas) {
      bump(pres.jogadorId, { partidas: 1 });
      if (jogadoresTimeA.has(pres.jogadorId)) {
        if (empatou) bump(pres.jogadorId, { empates: 1 });
        else if (venceuA) bump(pres.jogadorId, { vitorias: 1 });
        else bump(pres.jogadorId, { derrotas: 1 });
      } else if (jogadoresTimeB.has(pres.jogadorId)) {
        if (empatou) bump(pres.jogadorId, { empates: 1 });
        else if (!venceuA) bump(pres.jogadorId, { vitorias: 1 });
        else bump(pres.jogadorId, { derrotas: 1 });
      }
    }

    for (const e of p.estatisticas) {
      bump(e.jogadorId, {
        gols: e.gols,
        assistencias: e.assistencias,
        mvps: e.foiMvp ? 1 : 0,
      });
    }
  }

  return Array.from(acc.entries()).map(([jogadorId, v]) => ({
    jogadorId,
    nome: v.nome,
    avatarInicial: v.avatarInicial,
    estatisticas: v.est,
  }));
}
