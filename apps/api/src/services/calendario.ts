import type { PrismaClient } from '@peladafc/db';
import type { CalendarioItemDTO } from '@peladafc/contracts';

/**
 * Monta o calendário de um jogador: dias com partidas onde ele está envolvido.
 *
 * Um jogador aparece na partida por três caminhos, em ordem de precedência:
 *  1. `membro` — é membro fixo da pelada;
 *  2. `convidado` — foi convidado especificamente pra aquela partida;
 *  3. `presenca` — nenhum dos dois, mas tem presença registrada (edge case).
 *
 * A precedência garante uma linha por partida (não duplica se for membro
 * também convidado, por exemplo).
 */
export async function montarCalendario(
  prisma: PrismaClient,
  jogadorId: string,
  filtro: { desde?: Date; ate?: Date },
): Promise<CalendarioItemDTO[]> {
  const dataFiltro =
    filtro.desde || filtro.ate
      ? {
          ...(filtro.desde && { gte: filtro.desde }),
          ...(filtro.ate && { lte: filtro.ate }),
        }
      : undefined;

  const partidaSelect = {
    id: true,
    data: true,
    status: true,
    pelada: {
      select: {
        id: true,
        slug: true,
        nome: true,
        modalidade: true,
      },
    },
  };

  // 1. Partidas de peladas onde o jogador é membro fixo
  const membrosDe = await prisma.groupMember.findMany({
    where: { jogadorId },
    select: { peladaId: true },
  });
  const peladaIds = membrosDe.map((m) => m.peladaId);
  const partidasComoMembro = peladaIds.length
    ? await prisma.partida.findMany({
        where: {
          peladaId: { in: peladaIds },
          ...(dataFiltro && { data: dataFiltro }),
        },
        select: partidaSelect,
      })
    : [];

  // 2. Partidas em que o jogador foi convidado
  const convites = await prisma.partidaConvidado.findMany({
    where: {
      jogadorId,
      ...(dataFiltro && { partida: { data: dataFiltro } }),
    },
    select: { partida: { select: partidaSelect } },
  });

  // 3. Presenças em partidas fora das duas categorias anteriores (raro)
  const presencas = await prisma.attendance.findMany({
    where: {
      jogadorId,
      status: 'confirmado',
      ...(dataFiltro && { partida: { data: dataFiltro } }),
    },
    select: { partida: { select: partidaSelect } },
  });

  const mapa = new Map<string, CalendarioItemDTO>();

  const monta = (
    partida: {
      id: string;
      data: Date;
      status: string;
      pelada: { id: string; slug: string; nome: string; modalidade: string };
    },
    papel: 'membro' | 'convidado' | 'presenca',
  ): CalendarioItemDTO => ({
    partidaId: partida.id,
    data: partida.data,
    status: partida.status as CalendarioItemDTO['status'],
    papel,
    pelada: partida.pelada,
  });

  // Calendário só lista partidas de peladas — partidas standalone (pelada
  // rápida) não têm grupo e não aparecem no calendário do jogador.
  for (const p of partidasComoMembro) {
    if (p.pelada) mapa.set(p.id, monta({ ...p, pelada: p.pelada }, 'membro'));
  }
  for (const c of convites) {
    if (c.partida.pelada && !mapa.has(c.partida.id)) {
      mapa.set(c.partida.id, monta({ ...c.partida, pelada: c.partida.pelada }, 'convidado'));
    }
  }
  for (const pr of presencas) {
    if (pr.partida.pelada && !mapa.has(pr.partida.id)) {
      mapa.set(pr.partida.id, monta({ ...pr.partida, pelada: pr.partida.pelada }, 'presenca'));
    }
  }

  return Array.from(mapa.values()).sort((a, b) => a.data.getTime() - b.data.getTime());
}
