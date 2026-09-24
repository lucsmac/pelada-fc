import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { gerarId } from '@peladafc/db';
import {
  adicionarJogadorPartidaBodySchema,
  substituirJogadorBodySchema,
  convidarParaPartidaBodySchema,
  convidarParaPartidaResponseSchema,
  convidadoPartidaSchema,
  criarEventoBodySchema,
  criarPartidaBodySchema,
  criarPartidaStandaloneBodySchema,
  declararDesempateBodySchema,
  definirEmCampoBodySchema,
  encerrarRodadaBodySchema,
  erroResponseSchema,
  finalizarPartidaBodySchema,
  iniciarPartidaAoVivoBodySchema,
  listarPartidasResponseSchema,
  partidaAoVivoSchema,
  partidaDetalheSchema,
  partidaSchema,
  registrarPresencaBodySchema,
  registrarResultadoBodySchema,
  resortearJogadoresBodySchema,
  rotacionarTimesBodySchema,
  sortearTimesBodySchema,
  presencaJogadorSchema,
  timeSchema,
  type RankingTime,
} from '@peladafc/contracts';
import type { Prisma } from '@peladafc/db';

// Autoriza operações do modo ao vivo: dono da partida standalone
// (criadoPorUserId) OU admin/criador da Pelada quando a partida está
// vinculada. Retorna a partida (sem includes pesados) ou null se já mandou
// resposta de erro.
async function pegarPartidaSePodeControlar(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  partidaId: string,
) {
  const userId = request.usuario!.id;
  const partida = await app.prisma.partida.findUnique({
    where: { id: partidaId },
    include: {
      pelada: {
        select: {
          criadoPorUserId: true,
          membros: {
            where: { jogador: { userId } },
            select: { papel: true },
          },
        },
      },
    },
  });
  if (!partida) {
    reply.code(404).send({ mensagem: 'Partida não encontrada' });
    return null;
  }
  const ehDono = partida.criadoPorUserId === userId;
  const ehAdminPelada =
    partida.pelada != null &&
    (partida.pelada.criadoPorUserId === userId ||
      partida.pelada.membros.some((m) => m.papel === 'admin'));
  if (!ehDono && !ehAdminPelada) {
    reply.code(403).send({ mensagem: 'Sem permissão para controlar esta partida' });
    return null;
  }
  return partida;
}

// Select consolidado para serializar uma partida no formato partidaAoVivoSchema.
const includePartidaAoVivo = {
  presencas: {
    select: {
      id: true,
      jogadorId: true,
      status: true,
      funcao: true,
      posicaoLinha: true,
      respondidoEm: true,
      jogador: {
        select: { id: true, nome: true, avatarInicial: true, userId: true },
      },
    },
    orderBy: { respondidoEm: 'asc' },
  },
  times: {
    include: {
      jogadores: {
        include: {
          jogador: { select: { id: true, nome: true, avatarInicial: true } },
        },
      },
    },
  },
  convidados: {
    include: {
      jogador: {
        select: { id: true, nome: true, avatarInicial: true, userId: true },
      },
    },
    orderBy: { criadoEm: 'asc' },
  },
  estatisticas: {
    include: { jogador: { select: { id: true, nome: true, avatarInicial: true } } },
  },
  eventos: {
    include: {
      jogador: { select: { id: true, nome: true, avatarInicial: true } },
      assistente: { select: { id: true, nome: true, avatarInicial: true } },
    },
    orderBy: [{ minutoJogo: 'asc' }, { criadoEm: 'asc' }],
  },
} satisfies Prisma.PartidaInclude;

// Ranking derivado: lê `rankingJson` da Partida (fonte de verdade, mutada
// em /encerrar-rodada) e enriquece com streak calculada a partir dos eventos
// `rodada_encerrada` mais recentes. Retorna array na ordem dos times.
function derivarRanking(partida: {
  times: { id: string }[];
  rankingJson: unknown;
  eventos: { tipo: string; teamId: string; criadoEm: Date }[];
}): RankingTime[] {
  const snapshot = Array.isArray(partida.rankingJson)
    ? (partida.rankingJson as Array<{
        teamId: string;
        vitorias: number;
        derrotas: number;
        saldoGols: number;
      }>)
    : [];
  const snapshotPorTime = new Map(snapshot.map((s) => [s.teamId, s]));

  // Streak: percorre os `rodada_encerrada` do mais recente ao mais antigo;
  // conta vitórias consecutivas do time enquanto ele for o vencedor.
  const encerradasDesc = partida.eventos
    .filter((e) => e.tipo === 'rodada_encerrada')
    .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime());

  function streakDe(teamId: string): number {
    let n = 0;
    for (const e of encerradasDesc) {
      if (e.teamId === teamId) n++;
      else break;
    }
    return n;
  }

  return partida.times.map((t) => {
    const s = snapshotPorTime.get(t.id);
    return {
      teamId: t.id,
      vitorias: s?.vitorias ?? 0,
      derrotas: s?.derrotas ?? 0,
      saldoGols: s?.saldoGols ?? 0,
      streakVitorias: streakDe(t.id),
    };
  });
}

async function carregarPartidaAoVivo(app: FastifyInstance, partidaId: string) {
  const partida = await app.prisma.partida.findUnique({
    where: { id: partidaId },
    include: includePartidaAoVivo,
  });
  if (!partida) return null;
  return {
    ...partida,
    ranking: derivarRanking(partida),
  };
}

// Recalcula placar de cada time a partir dos eventos (`gol` e `gol_contra`)
// e — só em partidas de 2 times — se `metaGols` estiver setado e HOUVER um
// único líder que atinge, finaliza a partida gravando `finalizadoEm`. Em
// partidas de 3+ times a auto-finalização é desligada: quando o time em
// campo atinge a meta, o cliente detecta e chama `/encerrar-rodada` (que
// grava o âncora `rodada_encerrada`). Isso mantém a partida viva pra
// próxima rodada.
//
// Placar da rodada atual é escopado por eventos após o último
// `rodada_encerrada` (em 2 times, nunca tem âncora → conta tudo).
async function recalcularPlacarEFinalizarSeAtingiuMeta(
  tx: Prisma.TransactionClient,
  partidaId: string,
) {
  const partida = await tx.partida.findUnique({
    where: { id: partidaId },
    include: { times: { select: { id: true, nome: true } } },
  });
  if (!partida) return null;
  if (partida.times.length < 2) return partida;

  // Corte pra placar da rodada atual (só relevante em partidas 3+).
  const ultimaRodada = await tx.eventoPartida.findFirst({
    where: { partidaId, tipo: 'rodada_encerrada' },
    orderBy: { criadoEm: 'desc' },
    select: { criadoEm: true },
  });
  const filtroRodada = ultimaRodada ? { criadoEm: { gt: ultimaRodada.criadoEm } } : {};

  // Placar por time (escopado à rodada atual).
  const scores = await Promise.all(
    partida.times.map(async (t) => ({
      teamId: t.id,
      nome: t.nome,
      gols: await tx.eventoPartida.count({
        where: {
          partidaId,
          teamId: t.id,
          tipo: { in: ['gol', 'gol_contra'] },
          ...filtroRodada,
        },
      }),
    })),
  );

  // Atualiza colunas legadas (placarTimeA/B) — 2 times: primeiros por ordem
  // alfabética (fluxo legado). 3+ times: usa `emCampoTeamIds` pra manter os
  // campos coerentes com o que o cliente vê no placar principal.
  let idA: string | undefined;
  let idB: string | undefined;
  if (partida.times.length === 2) {
    const timesOrdenados = [...partida.times].sort((a, b) => a.nome.localeCompare(b.nome));
    idA = timesOrdenados[0]?.id;
    idB = timesOrdenados[1]?.id;
  } else if (partida.emCampoTeamIds.length === 2) {
    idA = partida.emCampoTeamIds[0];
    idB = partida.emCampoTeamIds[1];
  }
  const placarA = scores.find((s) => s.teamId === idA)?.gols ?? 0;
  const placarB = scores.find((s) => s.teamId === idB)?.gols ?? 0;

  // Auto-finalização só em partidas de 2 times. Em 3+ times, quando a meta
  // é batida na rodada, o cliente confirma o encerramento via /encerrar-rodada.
  const ehDoisTimes = partida.times.length === 2;
  const maxGols = Math.max(...scores.map((s) => s.gols));
  const lideres = scores.filter((s) => s.gols === maxGols);
  const atingiuMeta = partida.metaGols != null && maxGols >= partida.metaGols;

  let novoStatus = partida.status;
  let novoFinalizadoEm = partida.finalizadoEm;
  if (ehDoisTimes) {
    if (atingiuMeta && lideres.length === 1 && partida.status !== 'finalizada') {
      novoStatus = 'finalizada';
      novoFinalizadoEm = new Date();
    } else if (
      (!atingiuMeta || lideres.length > 1) &&
      partida.status === 'finalizada' &&
      partida.iniciadoEm != null
    ) {
      // Reverte se undo derrubou abaixo da meta ou empatou de novo.
      novoStatus = 'em_andamento';
      novoFinalizadoEm = null;
    }
  }

  return tx.partida.update({
    where: { id: partidaId },
    data: {
      placarTimeA: placarA,
      placarTimeB: placarB,
      status: novoStatus,
      finalizadoEm: novoFinalizadoEm,
    },
  });
}

// Calcula o minuto de jogo (segundos desde iniciadoEm - pausas acumuladas).
// Retorna 0 se a partida ainda não começou.
function minutoJogoAtual(partida: {
  iniciadoEm: Date | null;
  pausadoEm: Date | null;
  duracaoPausadaSegundos: number;
}) {
  if (!partida.iniciadoEm) return 0;
  const fim = partida.pausadoEm ? partida.pausadoEm.getTime() : Date.now();
  const seg = Math.floor((fim - partida.iniciadoEm.getTime()) / 1000) - partida.duracaoPausadaSegundos;
  return Math.max(0, seg);
}

async function pegarPeladaSePodeAdmin(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  partidaId: string,
) {
  const userId = request.usuario!.id;
  const partida = await app.prisma.partida.findUnique({
    where: { id: partidaId },
    include: {
      pelada: {
        include: {
          membros: {
            where: { jogador: { userId } },
            select: { papel: true, jogadorId: true },
          },
        },
      },
    },
  });
  if (!partida) {
    reply.code(404).send({ mensagem: 'Partida não encontrada' });
    return null;
  }
  // Partidas standalone (pelada rápida) não passam por este helper — as
  // operações vinculadas a Pelada exigem grupo. Rejeita explicitamente.
  if (!partida.pelada) {
    reply.code(400).send({ mensagem: 'Esta ação só se aplica a partidas de uma pelada' });
    return null;
  }
  const pelada = partida.pelada;
  const ehCriador = pelada.criadoPorUserId === userId;
  const ehAdmin = ehCriador || pelada.membros.some((m) => m.papel === 'admin');
  if (!ehAdmin) {
    reply.code(403).send({ mensagem: 'Apenas administradores podem realizar esta ação' });
    return null;
  }
  return partida as typeof partida & { pelada: NonNullable<typeof partida.pelada> };
}

/** Fisher–Yates */
function embaralhar<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const LETRAS = ['A', 'B', 'C', 'D', 'E', 'F'];

const DIA_NUMERO: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

const OCORRENCIAS_A_MATERIALIZAR = 4;

interface ConfigCapacidade {
  quantidadeTimes: number;
  jogadoresPorTime: number;
  goleirosPorTime: number;
  tamanhoReserva: number;
}

function capacidades(config: ConfigCapacidade) {
  return {
    goleiro: config.quantidadeTimes * config.goleirosPorTime,
    linha: config.quantidadeTimes * Math.max(0, config.jogadoresPorTime - config.goleirosPorTime),
  };
}

/**
 * Se houver vagas em uma função (goleiro ou linha), promove os primeiros
 * inscritos na lista de espera daquela mesma função, por ordem de resposta.
 * Rodar após qualquer mudança que possa liberar vaga (recusa, troca de função).
 */
async function promoverDaReserva(
  app: FastifyInstance,
  partidaId: string,
  config: ConfigCapacidade,
): Promise<void> {
  const caps = capacidades(config);
  const alvos: Array<{ funcao: 'goleiro' | 'linha'; capacidade: number }> = [
    { funcao: 'goleiro', capacidade: caps.goleiro },
    { funcao: 'linha', capacidade: caps.linha },
  ];
  for (const { funcao, capacidade } of alvos) {
    const confirmados = await app.prisma.attendance.count({
      where: { partidaId, status: 'confirmado', funcao },
    });
    const vagas = capacidade - confirmados;
    if (vagas <= 0) continue;
    const proximos = await app.prisma.attendance.findMany({
      where: { partidaId, status: 'lista_espera', funcao },
      orderBy: { respondidoEm: 'asc' },
      take: vagas,
      select: { id: true },
    });
    if (proximos.length === 0) continue;
    await app.prisma.attendance.updateMany({
      where: { id: { in: proximos.map((p) => p.id) } },
      data: { status: 'confirmado' },
    });
  }
}

/**
 * Calcula as próximas N ocorrências semanais (diaSemana + horário local) a partir de agora.
 * As duas datas sempre respeitam o timezone do servidor.
 */
function proximasOcorrencias(
  diaSemana: string,
  horario: string,
  quantidade: number,
  agora: Date = new Date(),
): Date[] {
  const alvo = DIA_NUMERO[diaSemana];
  if (alvo === undefined) return [];
  const partes = horario.split(':').map((s) => Number(s));
  const h = partes[0];
  const m = partes[1];
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return [];

  const base = new Date(agora);
  base.setHours(h, m, 0, 0);
  let diff = (alvo - base.getDay() + 7) % 7;
  if (diff === 0 && base.getTime() < agora.getTime()) diff = 7;
  base.setDate(base.getDate() + diff);

  const datas: Date[] = [];
  for (let i = 0; i < quantidade; i++) {
    datas.push(new Date(base));
    base.setDate(base.getDate() + 7);
  }
  return datas;
}

/**
 * Materialização preguiçosa: garante que as próximas ocorrências da rotina semanal existem
 * como Partida no banco. Não recria datas que já foram cadastradas (mesmo canceladas).
 */
async function materializarProximas(
  app: FastifyInstance,
  pelada: {
    id: string;
    diaSemana: string;
    horario: string;
    temporadaAtualId: string | null;
  },
): Promise<void> {
  if (!pelada.temporadaAtualId) return;
  const candidatas = proximasOcorrencias(
    pelada.diaSemana,
    pelada.horario,
    OCORRENCIAS_A_MATERIALIZAR,
  );
  if (candidatas.length === 0) return;

  const existentes = await app.prisma.partida.findMany({
    where: {
      peladaId: pelada.id,
      data: { in: candidatas },
    },
    select: { data: true },
  });
  const jaExiste = new Set(existentes.map((p) => p.data.getTime()));
  const faltando = candidatas.filter((d) => !jaExiste.has(d.getTime()));
  if (faltando.length === 0) return;

  await app.prisma.partida.createMany({
    data: faltando.map((data) => ({
      id: gerarId(),
      peladaId: pelada.id,
      temporadaId: pelada.temporadaAtualId!,
      data,
    })),
  });
}

export async function partidasRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ---- Listar partidas de uma pelada --------------------------------------
  typed.get(
    '/peladas/:peladaId/partidas',
    {
      schema: {
        params: z.object({ peladaId: z.string().uuid() }),
        response: {
          200: listarPartidasResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const pelada = await app.prisma.pelada.findUnique({ where: { id: req.params.peladaId } });
      if (!pelada) return reply.code(404).send({ mensagem: 'Pelada não encontrada' });
      await materializarProximas(app, pelada);
      const itens = await app.prisma.partida.findMany({
        where: { peladaId: pelada.id },
        orderBy: { data: 'desc' },
      });
      return { itens, total: itens.length };
    },
  );

  // ---- Criar partida (admin) ----------------------------------------------
  typed.post(
    '/peladas/:peladaId/partidas',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ peladaId: z.string().uuid() }),
        body: criarPartidaBodySchema,
        response: {
          201: partidaSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const userId = req.usuario!.id;
      const pelada = await app.prisma.pelada.findUnique({
        where: { id: req.params.peladaId },
        include: {
          membros: {
            where: { jogador: { userId } },
            select: { papel: true },
          },
        },
      });
      if (!pelada) return reply.code(404).send({ mensagem: 'Pelada não encontrada' });
      const ehAdmin =
        pelada.criadoPorUserId === userId || pelada.membros.some((m) => m.papel === 'admin');
      if (!ehAdmin) return reply.code(403).send({ mensagem: 'Apenas admins criam partidas' });

      const temporadaId = req.body.temporadaId ?? pelada.temporadaAtualId;
      if (!temporadaId) {
        return reply.code(422).send({
          mensagem: 'A pelada não tem temporada ativa. Crie uma antes de agendar partidas.',
        });
      }

      const partida = await app.prisma.partida.create({
        data: {
          id: gerarId(),
          peladaId: pelada.id,
          temporadaId,
          data: req.body.data,
        },
      });
      return reply.code(201).send(partida);
    },
  );

  // ---- Detalhe da partida --------------------------------------------------
  typed.get(
    '/partidas/:id',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: partidaAoVivoSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const partida = await carregarPartidaAoVivo(app, req.params.id);
      if (!partida) return reply.code(404).send({ mensagem: 'Partida não encontrada' });
      return partida;
    },
  );

  // ---- Registrar presença --------------------------------------------------
  typed.post(
    '/partidas/:id/presenca',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: registrarPresencaBodySchema,
        response: {
          200: presencaJogadorSchema,
          400: erroResponseSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          409: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const userId = req.usuario!.id;
      const partida = await app.prisma.partida.findUnique({
        where: { id: req.params.id },
        include: { pelada: { include: { membros: { where: { jogador: { userId } } } } } },
      });
      if (!partida) return reply.code(404).send({ mensagem: 'Partida não encontrada' });
      if (!partida.pelada) {
        return reply.code(400).send({ mensagem: 'Esta ação só se aplica a partidas de uma pelada' });
      }
      const pelada = partida.pelada;

      const meuMembro = pelada.membros[0];
      const ehAdmin =
        pelada.criadoPorUserId === userId || meuMembro?.papel === 'admin';

      // Determina jogadorId alvo:
      let jogadorId: string;
      if (req.body.jogadorId) {
        // Só admin pode registrar presença de outro
        if (!ehAdmin) {
          return reply.code(403).send({ mensagem: 'Sem permissão' });
        }
        jogadorId = req.body.jogadorId;
      } else {
        if (!meuMembro) {
          return reply.code(422).send({ mensagem: 'Você não é membro desta pelada' });
        }
        jogadorId = meuMembro.jogadorId;
      }

      const funcao = req.body.funcao;
      const posicaoLinha = funcao === 'goleiro' ? null : req.body.posicaoLinha ?? null;

      const config = pelada;
      const caps = capacidades(config);

      // Se está confirmando, checa capacidade da função. Se lotou, tenta ir pra
      // lista de espera; se a reserva também estourou o tamanho, rejeita.
      let statusFinal = req.body.status;
      if (statusFinal === 'confirmado') {
        const capacidadeFuncao = caps[funcao];
        const outrosConfirmados = await app.prisma.attendance.count({
          where: {
            partidaId: partida.id,
            status: 'confirmado',
            funcao,
            NOT: { jogadorId },
          },
        });
        if (outrosConfirmados >= capacidadeFuncao) {
          const outrosReserva = await app.prisma.attendance.count({
            where: {
              partidaId: partida.id,
              status: 'lista_espera',
              NOT: { jogadorId },
            },
          });
          if (outrosReserva >= config.tamanhoReserva) {
            return reply.code(409).send({
              mensagem: `Vagas e lista de espera estão lotadas (reserva máxima: ${config.tamanhoReserva}).`,
            });
          }
          statusFinal = 'lista_espera';
        }
      }

      await app.prisma.attendance.upsert({
        where: { partidaId_jogadorId: { partidaId: partida.id, jogadorId } },
        create: {
          id: gerarId(),
          partidaId: partida.id,
          jogadorId,
          status: statusFinal,
          funcao,
          posicaoLinha,
        },
        update: {
          status: statusFinal,
          funcao,
          posicaoLinha,
          respondidoEm: new Date(),
        },
      });

      // Se algo saiu de "confirmado" (recusa, virou lista_espera, trocou função),
      // pode haver vaga pra promover reservas.
      await promoverDaReserva(app, partida.id, config);

      // Refetch — a própria linha pode ter sido promovida na passada acima.
      const presenca = await app.prisma.attendance.findUnique({
        where: { partidaId_jogadorId: { partidaId: partida.id, jogadorId } },
        select: {
          id: true,
          jogadorId: true,
          status: true,
          funcao: true,
          posicaoLinha: true,
          respondidoEm: true,
          jogador: { select: { id: true, nome: true, avatarInicial: true, userId: true } },
        },
      });
      return presenca!;
    },
  );

  // ---- Sortear times (admin) ----------------------------------------------
  typed.post(
    '/partidas/:id/sorteio',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: sortearTimesBodySchema,
        response: {
          200: z.object({ times: z.array(timeSchema) }),
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const partida = await pegarPeladaSePodeAdmin(app, req, reply, req.params.id);
      if (!partida) return;

      const confirmados = await app.prisma.attendance.findMany({
        where: { partidaId: partida.id, status: 'confirmado' },
        include: { jogador: { select: { id: true, nome: true, avatarInicial: true } } },
      });

      const qtd = req.body.quantidadeTimes ?? partida.pelada.quantidadeTimes;
      const goleirosPorTime = partida.pelada.goleirosPorTime;

      if (confirmados.length < qtd) {
        return reply
          .code(422)
          .send({ mensagem: 'Confirmados insuficientes para o número de times' });
      }

      // Reset: remove times antigos (cascade em TeamPlayer)
      await app.prisma.team.deleteMany({ where: { partidaId: partida.id } });

      // Regra: cada time deve ter até `goleirosPorTime` goleiros. Se faltar
      // goleiro pra todos os times, os disponíveis ficam distribuídos (fixos)
      // e os demais times não têm goleiro (não convertem linha em goleiro).
      const goleiros = embaralhar(confirmados.filter((c) => c.funcao === 'goleiro'));
      const linha = embaralhar(confirmados.filter((c) => c.funcao === 'linha'));
      const grupos: (typeof confirmados)[] = Array.from({ length: qtd }, () => []);

      // Distribui goleiros round-robin, respeitando o teto por time.
      goleiros.forEach((g, i) => {
        const time = i % qtd;
        if (grupos[time]!.filter((x) => x.funcao === 'goleiro').length < goleirosPorTime) {
          grupos[time]!.push(g);
        } else {
          // Excedente vai pro time com menos goleiros (não deveria acontecer
          // por causa da cap; guard-rail).
          const alvo = grupos
            .map((g, idx) => ({ idx, n: g.filter((x) => x.funcao === 'goleiro').length }))
            .sort((a, b) => a.n - b.n)[0]!.idx;
          grupos[alvo]!.push(g);
        }
      });

      // Distribui linha round-robin — começa pelo time com menos gente pra
      // equilibrar tamanho quando faltam goleiros em alguns times.
      linha.forEach((l) => {
        const alvo = grupos
          .map((g, idx) => ({ idx, n: g.length }))
          .sort((a, b) => a.n - b.n)[0]!.idx;
        grupos[alvo]!.push(l);
      });

      const timesCriados = await Promise.all(
        grupos.map((grupo, i) => {
          const nome = req.body.nomes?.[i] ?? `Time ${LETRAS[i] ?? i + 1}`;
          return app.prisma.team.create({
            data: {
              id: gerarId(),
              partidaId: partida.id,
              nome,
              jogadores: {
                create: grupo.map((a) => ({
                  id: gerarId(),
                  jogadorId: a.jogadorId,
                })),
              },
            },
            include: {
              jogadores: {
                include: {
                  jogador: { select: { id: true, nome: true, avatarInicial: true } },
                },
              },
            },
          });
        }),
      );

      return { times: timesCriados };
    },
  );

  // ---- Registrar resultado (admin) ----------------------------------------
  typed.post(
    '/partidas/:id/resultado',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: registrarResultadoBodySchema,
        response: {
          200: partidaSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const partida = await pegarPeladaSePodeAdmin(app, req, reply, req.params.id);
      if (!partida) return;

      // Substitui estatísticas
      await app.prisma.$transaction([
        app.prisma.estatisticaPartida.deleteMany({ where: { partidaId: partida.id } }),
        ...req.body.eventos.map((e) =>
          app.prisma.estatisticaPartida.create({
            data: {
              id: gerarId(),
              partidaId: partida.id,
              jogadorId: e.jogadorId,
              gols: e.gols,
              assistencias: e.assistencias,
              foiMvp: e.foiMvp,
            },
          }),
        ),
        app.prisma.partida.update({
          where: { id: partida.id },
          data: {
            placarTimeA: req.body.placarTimeA,
            placarTimeB: req.body.placarTimeB,
            status: 'finalizada',
          },
        }),
      ]);

      const atualizada = await app.prisma.partida.findUnique({ where: { id: partida.id } });
      return atualizada!;
    },
  );

  // ---- Cancelar partida (admin) -------------------------------------------
  typed.post(
    '/partidas/:id/cancelar',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: partidaSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const partida = await pegarPeladaSePodeAdmin(app, req, reply, req.params.id);
      if (!partida) return;
      if (partida.status === 'finalizada') {
        return reply.code(422).send({ mensagem: 'Partida já finalizada não pode ser cancelada' });
      }
      const atualizada = await app.prisma.partida.update({
        where: { id: partida.id },
        data: { status: 'cancelada' },
      });
      return atualizada;
    },
  );

  // ---- Convidar jogador para partida (admin) ------------------------------
  // O jogador entra como confirmado automaticamente. `proximasPartidas` > 1
  // replica o convite nas próximas ocorrências agendadas da mesma pelada
  // (útil pra reforço fixo em 3-4 rodadas seguidas, por exemplo).
  typed.post(
    '/partidas/:id/convidados',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: convidarParaPartidaBodySchema,
        response: {
          201: convidarParaPartidaResponseSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          409: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const partida = await pegarPeladaSePodeAdmin(app, req, reply, req.params.id);
      if (!partida) return;

      const jogador = await app.prisma.jogador.findUnique({
        where: { id: req.body.jogadorId },
      });
      if (!jogador) return reply.code(404).send({ mensagem: 'Jogador não encontrado' });

      // Jogadores que já são membros fixos não precisam ser convidados
      // peladaId é garantido não-null pelo pegarPeladaSePodeAdmin acima.
      const peladaId = partida.peladaId!;
      const jaMembro = await app.prisma.groupMember.findFirst({
        where: { peladaId, jogadorId: jogador.id },
      });
      if (jaMembro) {
        return reply.code(409).send({
          mensagem: 'Esse jogador já é membro fixo da pelada',
        });
      }

      const alvosPartidas: { id: string }[] = [{ id: partida.id }];
      if (req.body.proximasPartidas > 1) {
        const seguintes = await app.prisma.partida.findMany({
          where: {
            peladaId,
            status: 'agendada',
            data: { gt: partida.data },
          },
          orderBy: { data: 'asc' },
          take: req.body.proximasPartidas - 1,
          select: { id: true },
        });
        alvosPartidas.push(...seguintes);
      }

      const userId = req.usuario!.id;
      const criados = [] as Array<{
        id: string;
        jogadorId: string;
        criadoEm: Date;
        jogador: { id: string; nome: string; avatarInicial: string; userId: string | null };
      }>;
      for (const alvo of alvosPartidas) {
        const existente = await app.prisma.partidaConvidado.findUnique({
          where: { partidaId_jogadorId: { partidaId: alvo.id, jogadorId: jogador.id } },
          include: {
            jogador: { select: { id: true, nome: true, avatarInicial: true, userId: true } },
          },
        });
        if (existente) {
          criados.push(existente);
          continue;
        }
        const novo = await app.prisma.partidaConvidado.create({
          data: {
            id: gerarId(),
            partidaId: alvo.id,
            jogadorId: jogador.id,
            convidadoPorUserId: userId,
          },
          include: {
            jogador: { select: { id: true, nome: true, avatarInicial: true, userId: true } },
          },
        });
        // Convidado sempre entra como linha; se lotou, cai pra lista de espera.
        const alvoPelada = await app.prisma.pelada.findUnique({
          where: { id: peladaId },
          select: {
            quantidadeTimes: true,
            jogadoresPorTime: true,
            goleirosPorTime: true,
            tamanhoReserva: true,
          },
        });
        const capsConvidado = alvoPelada
          ? capacidades(alvoPelada)
          : { goleiro: 0, linha: 0 };
        const outrosLinha = await app.prisma.attendance.count({
          where: {
            partidaId: alvo.id,
            status: 'confirmado',
            funcao: 'linha',
            NOT: { jogadorId: jogador.id },
          },
        });
        const statusConvidado =
          outrosLinha >= capsConvidado.linha ? 'lista_espera' : 'confirmado';
        await app.prisma.attendance.upsert({
          where: { partidaId_jogadorId: { partidaId: alvo.id, jogadorId: jogador.id } },
          create: {
            id: gerarId(),
            partidaId: alvo.id,
            jogadorId: jogador.id,
            status: statusConvidado,
            funcao: 'linha',
          },
          update: { status: statusConvidado, funcao: 'linha', respondidoEm: new Date() },
        });
        criados.push(novo);
      }
      return reply.code(201).send({ criados });
    },
  );

  // ---- Remover convidado (admin) ------------------------------------------
  typed.delete(
    '/partidas/:id/convidados/:jogadorId',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({
          id: z.string().uuid(),
          jogadorId: z.string().uuid(),
        }),
        response: {
          200: convidadoPartidaSchema,
          204: z.null(),
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const partida = await pegarPeladaSePodeAdmin(app, req, reply, req.params.id);
      if (!partida) return;
      const removido = await app.prisma.partidaConvidado
        .delete({
          where: {
            partidaId_jogadorId: {
              partidaId: partida.id,
              jogadorId: req.params.jogadorId,
            },
          },
          include: {
            jogador: { select: { id: true, nome: true, avatarInicial: true, userId: true } },
          },
        })
        .catch(() => null);
      if (!removido) return reply.code(404).send({ mensagem: 'Convidado não encontrado' });
      // Remove presença registrada
      await app.prisma.attendance
        .delete({
          where: {
            partidaId_jogadorId: {
              partidaId: partida.id,
              jogadorId: req.params.jogadorId,
            },
          },
        })
        .catch(() => null);
      return removido;
    },
  );

  // ---- Reabrir partida cancelada (admin) ----------------------------------
  typed.post(
    '/partidas/:id/reabrir',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: partidaSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const partida = await pegarPeladaSePodeAdmin(app, req, reply, req.params.id);
      if (!partida) return;
      if (partida.status !== 'cancelada') {
        return reply.code(422).send({ mensagem: 'Só partidas canceladas podem ser reabertas' });
      }
      const atualizada = await app.prisma.partida.update({
        where: { id: partida.id },
        data: { status: 'agendada' },
      });
      return atualizada;
    },
  );

  // ==========================================================================
  // Modo ao vivo — pelada rápida (standalone) e controle da partida em campo.
  // ==========================================================================

  // ---- Criar partida standalone (sem Pelada) ------------------------------
  typed.post(
    '/partidas',
    {
      onRequest: [app.authenticate],
      schema: {
        body: criarPartidaStandaloneBodySchema,
        response: {
          201: partidaAoVivoSchema,
          401: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const userId = req.usuario!.id;
      const { nome, metaGols, duracaoMinutos, modoDesempate, times } = req.body;

      const partidaId = gerarId();

      // Cria tudo numa transação para não deixar Partida órfã se algum time falhar.
      // Racha 3+ times: `emCampoTeamIds` já entra com os 2 primeiros times na
      // criação (usuário pode trocar antes de iniciar via /em-campo).
      const idsGerados: string[] = times.map(() => gerarId());
      const emCampoInicial = times.length >= 2 ? [idsGerados[0]!, idsGerados[1]!] : [];

      await app.prisma.$transaction(async (tx) => {
        await tx.partida.create({
          data: {
            id: partidaId,
            peladaId: null,
            temporadaId: null,
            criadoPorUserId: userId,
            nome,
            data: new Date(),
            status: 'agendada',
            metaGols,
            duracaoMinutos,
            modoDesempate,
            emCampoTeamIds: emCampoInicial,
          },
        });

        for (const [i, entrada] of times.entries()) {
          const teamId = idsGerados[i]!;
          await tx.team.create({
            data: {
              id: teamId,
              partidaId,
              nome: entrada.nome,
              cor: entrada.cor,
            },
          });
          for (const jogadorEntrada of entrada.jogadores) {
            const jogadorId = gerarId();
            const nomeLimpo = jogadorEntrada.nome.trim();
            await tx.jogador.create({
              data: {
                id: jogadorId,
                nome: nomeLimpo,
                avatarInicial: nomeLimpo.charAt(0).toUpperCase() || 'J',
              },
            });
            await tx.teamPlayer.create({
              data: { id: gerarId(), teamId, jogadorId },
            });
            await tx.attendance.create({
              data: {
                id: gerarId(),
                partidaId,
                jogadorId,
                status: 'confirmado',
                funcao: jogadorEntrada.funcao,
              },
            });
          }
        }

        // Reservas gerais — Jogador + Attendance sem TeamPlayer. Entram em
        // qualquer time depois via /substituir.
        for (const reservaEntrada of req.body.reservas) {
          const jogadorId = gerarId();
          const nomeLimpo = reservaEntrada.nome.trim();
          await tx.jogador.create({
            data: {
              id: jogadorId,
              nome: nomeLimpo,
              avatarInicial: nomeLimpo.charAt(0).toUpperCase() || 'J',
            },
          });
          await tx.attendance.create({
            data: {
              id: gerarId(),
              partidaId,
              jogadorId,
              status: 'lista_espera',
              funcao: reservaEntrada.funcao,
            },
          });
        }
      });

      const partida = await carregarPartidaAoVivo(app, partidaId);
      if (!partida) return reply.code(422).send({ mensagem: 'Falha ao criar partida' });
      return reply.code(201).send(partida);
    },
  );

  // ---- Iniciar (dispara cronômetro; aceita config live opcional) ----------
  typed.post(
    '/partidas/:id/iniciar',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: iniciarPartidaAoVivoBodySchema,
        response: {
          200: partidaAoVivoSchema,
          400: erroResponseSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const partida = await pegarPartidaSePodeControlar(app, req, reply, req.params.id);
      if (!partida) return;
      if (partida.status === 'finalizada' || partida.status === 'cancelada') {
        return reply.code(422).send({ mensagem: 'Partida já foi encerrada' });
      }

      // Preenche config live que ainda não estava setada (útil quando um admin
      // dispara ao vivo em uma partida agendada tradicional).
      const patch: Prisma.PartidaUpdateInput = {};
      if (partida.metaGols == null && req.body.metaGols != null) patch.metaGols = req.body.metaGols;
      if (partida.duracaoMinutos == null && req.body.duracaoMinutos !== undefined) {
        patch.duracaoMinutos = req.body.duracaoMinutos;
      }
      if (partida.modoDesempate == null && req.body.modoDesempate != null) {
        patch.modoDesempate = req.body.modoDesempate;
      }
      if (partida.status !== 'em_andamento') patch.status = 'em_andamento';
      if (partida.iniciadoEm == null) patch.iniciadoEm = new Date();

      if (Object.keys(patch).length > 0) {
        await app.prisma.partida.update({ where: { id: partida.id }, data: patch });
      }

      const atualizada = await carregarPartidaAoVivo(app, partida.id);
      return atualizada!;
    },
  );

  // ---- Pausar --------------------------------------------------------------
  typed.post(
    '/partidas/:id/pausar',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: partidaAoVivoSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const partida = await pegarPartidaSePodeControlar(app, req, reply, req.params.id);
      if (!partida) return;
      if (partida.status !== 'em_andamento') {
        return reply.code(422).send({ mensagem: 'Só é possível pausar uma partida em andamento' });
      }
      if (partida.pausadoEm == null) {
        await app.prisma.partida.update({
          where: { id: partida.id },
          data: { pausadoEm: new Date() },
        });
      }
      return (await carregarPartidaAoVivo(app, partida.id))!;
    },
  );

  // ---- Retomar -------------------------------------------------------------
  typed.post(
    '/partidas/:id/retomar',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: partidaAoVivoSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const partida = await pegarPartidaSePodeControlar(app, req, reply, req.params.id);
      if (!partida) return;
      if (partida.pausadoEm == null) {
        return reply.code(422).send({ mensagem: 'Partida não está pausada' });
      }
      const segundosPausada = Math.floor((Date.now() - partida.pausadoEm.getTime()) / 1000);
      await app.prisma.partida.update({
        where: { id: partida.id },
        data: {
          pausadoEm: null,
          duracaoPausadaSegundos: partida.duracaoPausadaSegundos + Math.max(0, segundosPausada),
        },
      });
      return (await carregarPartidaAoVivo(app, partida.id))!;
    },
  );

  // ---- Registrar evento (gol) ---------------------------------------------
  typed.post(
    '/partidas/:id/eventos',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: criarEventoBodySchema,
        response: {
          200: partidaAoVivoSchema,
          400: erroResponseSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const userId = req.usuario!.id;
      const partida = await pegarPartidaSePodeControlar(app, req, reply, req.params.id);
      if (!partida) return;
      if (partida.status === 'cancelada' || partida.status === 'finalizada') {
        return reply.code(422).send({ mensagem: 'Partida já foi encerrada' });
      }

      // Valida que o time pertence à partida.
      const time = await app.prisma.team.findFirst({
        where: { id: req.body.teamId, partidaId: partida.id },
      });
      if (!time) return reply.code(400).send({ mensagem: 'Time não pertence a esta partida' });

      // Valida jogador (se informado).
      if (req.body.jogadorId) {
        const jogador = await app.prisma.jogador.findUnique({ where: { id: req.body.jogadorId } });
        if (!jogador) return reply.code(400).send({ mensagem: 'Jogador não encontrado' });
      }
      // Assistente só faz sentido pra gols; se veio, precisa existir e não
      // pode ser o próprio autor do gol.
      let assistenteJogadorId = req.body.assistenteJogadorId;
      if (req.body.tipo !== 'gol') assistenteJogadorId = null;
      if (assistenteJogadorId) {
        if (assistenteJogadorId === req.body.jogadorId) {
          return reply
            .code(400)
            .send({ mensagem: 'Assistente não pode ser o mesmo jogador do gol' });
        }
        const assist = await app.prisma.jogador.findUnique({
          where: { id: assistenteJogadorId },
        });
        if (!assist) return reply.code(400).send({ mensagem: 'Assistente não encontrado' });
      }

      const minuto =
        req.body.minutoJogo != null ? req.body.minutoJogo : minutoJogoAtual(partida);

      await app.prisma.$transaction(async (tx) => {
        await tx.eventoPartida.create({
          data: {
            id: gerarId(),
            partidaId: partida.id,
            teamId: req.body.teamId,
            jogadorId: req.body.jogadorId,
            assistenteJogadorId,
            tipo: req.body.tipo,
            minutoJogo: minuto,
            criadoPorUserId: userId,
          },
        });
        // penalti_desempate e expulsao não contam pro placar principal.
        if (req.body.tipo === 'gol' || req.body.tipo === 'gol_contra') {
          await recalcularPlacarEFinalizarSeAtingiuMeta(tx, partida.id);
        }
      });

      return (await carregarPartidaAoVivo(app, partida.id))!;
    },
  );

  // ---- Desfazer evento -----------------------------------------------------
  typed.delete(
    '/partidas/:id/eventos/:eventoId',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid(), eventoId: z.string().uuid() }),
        response: {
          200: partidaAoVivoSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const partida = await pegarPartidaSePodeControlar(app, req, reply, req.params.id);
      if (!partida) return;

      const evento = await app.prisma.eventoPartida.findFirst({
        where: { id: req.params.eventoId, partidaId: partida.id },
      });
      if (!evento) return reply.code(404).send({ mensagem: 'Evento não encontrado' });

      await app.prisma.$transaction(async (tx) => {
        // Substituição: precisa reverter TeamPlayer/Attendance antes de apagar
        // o evento. Assume que a substituição é a mais recente daquele par de
        // jogadores — cliente só permite Desfazer o último evento reversível.
        if (evento.tipo === 'substituicao' && evento.jogadorId) {
          const entraId = evento.jogadorId;
          const saiId = evento.assistenteJogadorId;
          const teamIdDestino = evento.teamId;

          // Remove o entra do time destino e volta pra lista de espera.
          const entraTp = await tx.teamPlayer.findFirst({
            where: { jogadorId: entraId, teamId: teamIdDestino },
          });
          if (entraTp) await tx.teamPlayer.delete({ where: { id: entraTp.id } });
          await tx.attendance.update({
            where: { partidaId_jogadorId: { partidaId: partida.id, jogadorId: entraId } },
            data: { status: 'lista_espera' },
          });

          // Se tinha "sai", devolve pro time destino como titular.
          if (saiId) {
            await tx.teamPlayer.create({
              data: { id: gerarId(), teamId: teamIdDestino, jogadorId: saiId },
            });
            await tx.attendance.update({
              where: { partidaId_jogadorId: { partidaId: partida.id, jogadorId: saiId } },
              data: { status: 'confirmado' },
            });
          }
        }

        await tx.eventoPartida.delete({ where: { id: evento.id } });
        if (evento.tipo === 'gol' || evento.tipo === 'gol_contra') {
          await recalcularPlacarEFinalizarSeAtingiuMeta(tx, partida.id);
        }
      });

      return (await carregarPartidaAoVivo(app, partida.id))!;
    },
  );

  // ---- Finalizar manualmente ----------------------------------------------
  typed.post(
    '/partidas/:id/finalizar',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: finalizarPartidaBodySchema,
        response: {
          200: partidaAoVivoSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const partida = await pegarPartidaSePodeControlar(app, req, reply, req.params.id);
      if (!partida) return;
      if (partida.status === 'finalizada') {
        return (await carregarPartidaAoVivo(app, partida.id))!;
      }
      if (partida.status === 'cancelada') {
        return reply.code(422).send({ mensagem: 'Partida cancelada não pode ser finalizada' });
      }
      if (partida.placarTimeA === partida.placarTimeB) {
        return reply.code(422).send({
          mensagem: 'Empate — declare o desempate antes de finalizar',
        });
      }

      await app.prisma.$transaction(async (tx) => {
        await tx.partida.update({
          where: { id: partida.id },
          data: { status: 'finalizada', finalizadoEm: new Date() },
        });

        // Agrega EstatisticaPartida (gols + assistências) a partir dos
        // eventos, mantendo compatibilidade com ranking existente. Gol contra
        // NÃO conta pro artilheiro do jogador; só gol normal.
        const eventos = await tx.eventoPartida.findMany({
          where: { partidaId: partida.id, tipo: { in: ['gol', 'gol_contra'] } },
          select: { jogadorId: true, assistenteJogadorId: true, tipo: true },
        });
        interface Contagem {
          gols: number;
          assistencias: number;
        }
        const porJogador = new Map<string, Contagem>();
        const acumular = (id: string, patch: Partial<Contagem>) => {
          const atual = porJogador.get(id) ?? { gols: 0, assistencias: 0 };
          porJogador.set(id, {
            gols: atual.gols + (patch.gols ?? 0),
            assistencias: atual.assistencias + (patch.assistencias ?? 0),
          });
        };
        for (const e of eventos) {
          if (e.tipo === 'gol' && e.jogadorId) acumular(e.jogadorId, { gols: 1 });
          if (e.tipo === 'gol' && e.assistenteJogadorId) {
            acumular(e.assistenteJogadorId, { assistencias: 1 });
          }
        }
        for (const [jogadorId, c] of porJogador) {
          await tx.estatisticaPartida.upsert({
            where: { partidaId_jogadorId: { partidaId: partida.id, jogadorId } },
            create: {
              id: gerarId(),
              partidaId: partida.id,
              jogadorId,
              gols: c.gols,
              assistencias: c.assistencias,
              foiMvp: false,
            },
            update: { gols: c.gols, assistencias: c.assistencias },
          });
        }
      });

      return (await carregarPartidaAoVivo(app, partida.id))!;
    },
  );

  // ---- Declarar vencedor no desempate -------------------------------------
  typed.post(
    '/partidas/:id/desempate',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: declararDesempateBodySchema,
        response: {
          200: partidaAoVivoSchema,
          400: erroResponseSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const userId = req.usuario!.id;
      const partida = await pegarPartidaSePodeControlar(app, req, reply, req.params.id);
      if (!partida) return;
      if (partida.status === 'finalizada') {
        return reply.code(422).send({ mensagem: 'Partida já foi finalizada' });
      }
      if (partida.placarTimeA !== partida.placarTimeB) {
        return reply.code(422).send({ mensagem: 'Desempate só se aplica em placar empatado' });
      }

      // Valida vencedor e localiza os dois times para eventualmente logar
      // gols de pênaltis (`penalti_desempate`).
      const times = await app.prisma.team.findMany({
        where: { partidaId: partida.id },
        orderBy: { nome: 'asc' },
      });
      const [timeA, timeB] = times;
      if (!timeA || !timeB) return reply.code(400).send({ mensagem: 'Partida sem times' });
      if (req.body.vencedorTeamId !== timeA.id && req.body.vencedorTeamId !== timeB.id) {
        return reply.code(400).send({ mensagem: 'Time vencedor não pertence a esta partida' });
      }

      const modo = partida.modoDesempate;
      const registraLog = modo === 'penaltis' || modo === 'shootout';

      await app.prisma.$transaction(async (tx) => {
        if (registraLog) {
          const eventos: Prisma.EventoPartidaCreateManyInput[] = [];
          for (let i = 0; i < req.body.golsPenaltisTimeA; i++) {
            eventos.push({
              id: gerarId(),
              partidaId: partida.id,
              teamId: timeA.id,
              jogadorId: null,
              tipo: 'penalti_desempate',
              minutoJogo: 0,
              criadoPorUserId: userId,
            });
          }
          for (let i = 0; i < req.body.golsPenaltisTimeB; i++) {
            eventos.push({
              id: gerarId(),
              partidaId: partida.id,
              teamId: timeB.id,
              jogadorId: null,
              tipo: 'penalti_desempate',
              minutoJogo: 0,
              criadoPorUserId: userId,
            });
          }
          if (eventos.length > 0) {
            await tx.eventoPartida.createMany({ data: eventos });
          }
        }
        await tx.partida.update({
          where: { id: partida.id },
          data: {
            status: 'finalizada',
            finalizadoEm: new Date(),
            desempateVencedorTeamId: req.body.vencedorTeamId,
          },
        });
      });

      return (await carregarPartidaAoVivo(app, partida.id))!;
    },
  );

  // ---- Rotacionar jogadores entre os times --------------------------------
  typed.post(
    '/partidas/:id/rotacionar',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: rotacionarTimesBodySchema,
        response: {
          200: partidaAoVivoSchema,
          400: erroResponseSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const partida = await pegarPartidaSePodeControlar(app, req, reply, req.params.id);
      if (!partida) return;

      const timesDb = await app.prisma.team.findMany({
        where: { partidaId: partida.id },
        select: { id: true },
      });
      const idsTimesValidos = new Set(timesDb.map((t) => t.id));

      // Todos os teamIds no body precisam pertencer à partida.
      for (const t of req.body.times) {
        if (!idsTimesValidos.has(t.teamId)) {
          return reply.code(400).send({ mensagem: 'Time não pertence a esta partida' });
        }
      }

      // Cada jogador pode aparecer no máximo uma vez no total (não em times
      // diferentes ao mesmo tempo). Todos os jogadores precisam existir.
      const vistos = new Set<string>();
      for (const t of req.body.times) {
        for (const jid of t.jogadores) {
          if (vistos.has(jid)) {
            return reply
              .code(400)
              .send({ mensagem: 'Um jogador não pode estar em dois times' });
          }
          vistos.add(jid);
        }
      }
      if (vistos.size > 0) {
        const existentes = await app.prisma.jogador.count({
          where: { id: { in: [...vistos] } },
        });
        if (existentes !== vistos.size) {
          return reply.code(400).send({ mensagem: 'Algum jogador informado não existe' });
        }
      }

      await app.prisma.$transaction(async (tx) => {
        const idsAfetados = req.body.times.map((t) => t.teamId);
        await tx.teamPlayer.deleteMany({
          where: { teamId: { in: idsAfetados } },
        });
        const rows: Prisma.TeamPlayerCreateManyInput[] = req.body.times.flatMap((t) =>
          t.jogadores.map((jogadorId) => ({ id: gerarId(), teamId: t.teamId, jogadorId })),
        );
        if (rows.length > 0) {
          await tx.teamPlayer.createMany({ data: rows });
        }
      });

      return (await carregarPartidaAoVivo(app, partida.id))!;
    },
  );

  // ---- Racha 3+ times: definir quais dois times estão em campo ------------
  // Permitido em `agendada` (antes de iniciar cronômetro) OU entre rodadas
  // (frontend chama entre um /encerrar-rodada e o próximo gol). Rejeita se a
  // partida só tem 2 times (nada pra escolher) ou se a partida já finalizou.
  typed.post(
    '/partidas/:id/em-campo',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: definirEmCampoBodySchema,
        response: {
          200: partidaAoVivoSchema,
          400: erroResponseSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const partida = await pegarPartidaSePodeControlar(app, req, reply, req.params.id);
      if (!partida) return;
      if (partida.status === 'finalizada' || partida.status === 'cancelada') {
        return reply.code(422).send({ mensagem: 'Partida já foi encerrada' });
      }

      const times = await app.prisma.team.findMany({
        where: { partidaId: partida.id },
        select: { id: true },
      });
      if (times.length < 3) {
        return reply.code(422).send({ mensagem: 'Só faz sentido com 3+ times' });
      }

      const validos = new Set(times.map((t) => t.id));
      const a = req.body.emCampoTeamIds[0]!;
      const b = req.body.emCampoTeamIds[1]!;
      if (a === b) {
        return reply.code(400).send({ mensagem: 'Os dois times em campo devem ser diferentes' });
      }
      if (!validos.has(a) || !validos.has(b)) {
        return reply.code(400).send({ mensagem: 'Time não pertence a esta partida' });
      }

      await app.prisma.partida.update({
        where: { id: partida.id },
        data: { emCampoTeamIds: [a, b] },
      });
      return (await carregarPartidaAoVivo(app, partida.id))!;
    },
  );

  // ---- Racha 3+ times: re-sortear jogadores entre os times existentes -----
  // Preserva os times (nomes/cores) e redistribui todos os Attendance da
  // partida — 1 goleiro por time como titular, `jogadoresLinha` de linha por
  // time como titular, resto vira reserva (lista_espera). Só em `agendada`.
  typed.post(
    '/partidas/:id/resortear',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: resortearJogadoresBodySchema,
        response: {
          200: partidaAoVivoSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const partida = await pegarPartidaSePodeControlar(app, req, reply, req.params.id);
      if (!partida) return;
      if (partida.status !== 'agendada') {
        return reply.code(422).send({ mensagem: 'Só é possível resortear antes de iniciar' });
      }

      const times = await app.prisma.team.findMany({
        where: { partidaId: partida.id },
        orderBy: { nome: 'asc' },
        select: { id: true },
      });
      if (times.length < 2) {
        return reply.code(422).send({ mensagem: 'Partida sem times o bastante' });
      }

      const presencas = await app.prisma.attendance.findMany({
        where: { partidaId: partida.id, status: { in: ['confirmado', 'lista_espera'] } },
        select: { id: true, jogadorId: true, funcao: true },
      });
      const goleiros = embaralhar(presencas.filter((p) => p.funcao === 'goleiro'));
      const linhas = embaralhar(presencas.filter((p) => p.funcao === 'linha'));

      // Distribui: 1 goleiro titular por time, resto vira reserva no mesmo
      // time (round-robin); `jogadoresLinha` de linha titulares por time,
      // sobras viram reserva no time round-robin.
      const nTimes = times.length;
      const buckets: Array<{
        teamId: string;
        titulares: Array<{ jogadorId: string; attendanceId: string }>;
        reservas: Array<{ jogadorId: string; attendanceId: string }>;
      }> = times.map((t) => ({ teamId: t.id, titulares: [], reservas: [] }));

      goleiros.forEach((g, i) => {
        const time = i % nTimes;
        const alvo = Math.floor(i / nTimes) >= 1 ? 'reservas' : 'titulares';
        buckets[time]![alvo].push({ jogadorId: g.jogadorId, attendanceId: g.id });
      });
      linhas.forEach((l, i) => {
        const time = i % nTimes;
        const alvo =
          Math.floor(i / nTimes) >= req.body.jogadoresLinha ? 'reservas' : 'titulares';
        buckets[time]![alvo].push({ jogadorId: l.jogadorId, attendanceId: l.id });
      });

      await app.prisma.$transaction(async (tx) => {
        // Zera composição atual dos times.
        await tx.teamPlayer.deleteMany({
          where: { teamId: { in: times.map((t) => t.id) } },
        });
        // Recria TeamPlayer pra todo mundo (titular ou reserva — o "onde
        // aparece" na UI é ditado pelo Attendance.status).
        const rows: Prisma.TeamPlayerCreateManyInput[] = buckets.flatMap((b) =>
          [...b.titulares, ...b.reservas].map((p) => ({
            id: gerarId(),
            teamId: b.teamId,
            jogadorId: p.jogadorId,
          })),
        );
        if (rows.length > 0) await tx.teamPlayer.createMany({ data: rows });
        // Atualiza status dos Attendance conforme o bucket (titular/reserva).
        for (const b of buckets) {
          if (b.titulares.length > 0) {
            await tx.attendance.updateMany({
              where: { id: { in: b.titulares.map((p) => p.attendanceId) } },
              data: { status: 'confirmado' },
            });
          }
          if (b.reservas.length > 0) {
            await tx.attendance.updateMany({
              where: { id: { in: b.reservas.map((p) => p.attendanceId) } },
              data: { status: 'lista_espera' },
            });
          }
        }
      });

      return (await carregarPartidaAoVivo(app, partida.id))!;
    },
  );

  // ---- Racha 3+ times: encerrar rodada atual ------------------------------
  // Grava evento âncora `rodada_encerrada` (teamId = vencedor), atualiza o
  // ranking snapshot, rotaciona `emCampoTeamIds` (perdedor sai, `entraTeamId`
  // entra — se omitido, próximo da fila entra) e incrementa `rodadaAtual`.
  // Placar da próxima rodada é derivado pelo frontend/backend a partir dos
  // eventos após o novo âncora.
  typed.post(
    '/partidas/:id/encerrar-rodada',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: encerrarRodadaBodySchema,
        response: {
          200: partidaAoVivoSchema,
          400: erroResponseSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const partida = await pegarPartidaSePodeControlar(app, req, reply, req.params.id);
      if (!partida) return;
      if (partida.status !== 'em_andamento') {
        return reply
          .code(422)
          .send({ mensagem: 'Rodada só encerra com partida em andamento' });
      }
      const times = await app.prisma.team.findMany({
        where: { partidaId: partida.id },
        orderBy: { nome: 'asc' },
        select: { id: true },
      });
      if (times.length < 3) {
        return reply
          .code(422)
          .send({ mensagem: 'Rotação de rodada só se aplica a 3+ times' });
      }
      const emCampo = partida.emCampoTeamIds;
      if (emCampo.length !== 2) {
        return reply.code(422).send({ mensagem: 'Times em campo não definidos' });
      }
      const { vencedorTeamId, entraTeamId } = req.body;
      if (!emCampo.includes(vencedorTeamId)) {
        return reply
          .code(400)
          .send({ mensagem: 'Vencedor precisa ser um dos times em campo' });
      }
      const perdedorTeamId = emCampo.find((id) => id !== vencedorTeamId)!;

      // Determina quem entra: prioridade pro `entraTeamId` do body; senão,
      // primeiro time da fila (times não-em-campo por ordem alfabética).
      const forasDeCampo = times.map((t) => t.id).filter((id) => !emCampo.includes(id));
      let proximoTeamId: string | null = entraTeamId ?? forasDeCampo[0] ?? null;
      if (entraTeamId != null) {
        if (!forasDeCampo.includes(entraTeamId)) {
          return reply
            .code(400)
            .send({ mensagem: 'Time que entra precisa estar fora de campo' });
        }
        proximoTeamId = entraTeamId;
      }
      if (!proximoTeamId) {
        return reply.code(422).send({ mensagem: 'Nenhum time disponível pra entrar' });
      }

      // Calcula placar da rodada pra atualizar saldoGols do ranking snapshot.
      const eventosDaRodada = await app.prisma.eventoPartida.findMany({
        where: {
          partidaId: partida.id,
          tipo: { in: ['gol', 'gol_contra'] },
        },
        orderBy: { criadoEm: 'asc' },
      });
      const ultimaRodada = await app.prisma.eventoPartida.findFirst({
        where: { partidaId: partida.id, tipo: 'rodada_encerrada' },
        orderBy: { criadoEm: 'desc' },
        select: { criadoEm: true },
      });
      const golsRodada = eventosDaRodada.filter(
        (e) => !ultimaRodada || e.criadoEm > ultimaRodada.criadoEm,
      );
      const golsVencedor = golsRodada.filter((e) => e.teamId === vencedorTeamId).length;
      const golsPerdedor = golsRodada.filter((e) => e.teamId === perdedorTeamId).length;
      const saldoDaRodada = golsVencedor - golsPerdedor;

      // Atualiza ranking snapshot.
      type RankingSnap = {
        teamId: string;
        vitorias: number;
        derrotas: number;
        saldoGols: number;
      };
      const snapshotAtual = Array.isArray(partida.rankingJson)
        ? (partida.rankingJson as unknown as RankingSnap[])
        : [];
      const porTime = new Map<string, RankingSnap>(
        snapshotAtual.map((s) => [s.teamId, { ...s }]),
      );
      function garantir(teamId: string): RankingSnap {
        let s = porTime.get(teamId);
        if (!s) {
          s = { teamId, vitorias: 0, derrotas: 0, saldoGols: 0 };
          porTime.set(teamId, s);
        }
        return s;
      }
      const vencedorSnap = garantir(vencedorTeamId);
      const perdedorSnap = garantir(perdedorTeamId);
      vencedorSnap.vitorias += 1;
      vencedorSnap.saldoGols += saldoDaRodada;
      perdedorSnap.derrotas += 1;
      perdedorSnap.saldoGols -= saldoDaRodada;
      const novoSnapshot = times.map((t) => porTime.get(t.id) ?? {
        teamId: t.id,
        vitorias: 0,
        derrotas: 0,
        saldoGols: 0,
      });

      const userId = req.usuario!.id;
      await app.prisma.$transaction(async (tx) => {
        await tx.eventoPartida.create({
          data: {
            id: gerarId(),
            partidaId: partida.id,
            teamId: vencedorTeamId,
            tipo: 'rodada_encerrada',
            minutoJogo: minutoJogoAtual(partida),
            criadoPorUserId: userId,
          },
        });
        await tx.partida.update({
          where: { id: partida.id },
          data: {
            emCampoTeamIds: [vencedorTeamId, proximoTeamId!],
            rodadaAtual: partida.rodadaAtual + 1,
            rankingJson: novoSnapshot as unknown as Prisma.InputJsonValue,
            // Cronômetro reinicia por rodada — cada duelo começa em 0:00.
            // O tempo total da pelada é derivável pelo timestamp de criação.
            iniciadoEm: new Date(),
            duracaoPausadaSegundos: 0,
            pausadoEm: null,
            // Zera colunas legadas de placar (o placar da rodada nova começa
            // em 0×0; contadores são recalculados no próximo evento).
            placarTimeA: 0,
            placarTimeB: 0,
          },
        });
      });

      return (await carregarPartidaAoVivo(app, partida.id))!;
    },
  );

  // ---- Adicionar jogador solto durante a partida --------------------------
  // Cria um Jogador (userId=null) e o vincula ao time informado. Útil pra
  // atleta que chega atrasado ou substituição de última hora.
  typed.post(
    '/partidas/:id/jogadores',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: adicionarJogadorPartidaBodySchema,
        response: {
          200: partidaAoVivoSchema,
          400: erroResponseSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const partida = await pegarPartidaSePodeControlar(app, req, reply, req.params.id);
      if (!partida) return;
      if (partida.status === 'finalizada' || partida.status === 'cancelada') {
        return reply.code(422).send({ mensagem: 'Partida já foi encerrada' });
      }
      // teamId opcional: null = reserva geral (sem time), string = titular do time.
      let time = null;
      if (req.body.teamId) {
        time = await app.prisma.team.findFirst({
          where: { id: req.body.teamId, partidaId: partida.id },
        });
        if (!time) return reply.code(400).send({ mensagem: 'Time não pertence a esta partida' });
      }

      const nomeLimpo = req.body.nome.trim();
      if (!nomeLimpo) return reply.code(400).send({ mensagem: 'Nome vazio' });

      await app.prisma.$transaction(async (tx) => {
        const jogadorId = gerarId();
        await tx.jogador.create({
          data: {
            id: jogadorId,
            nome: nomeLimpo,
            avatarInicial: nomeLimpo.charAt(0).toUpperCase() || 'J',
          },
        });
        // Só cria TeamPlayer se tem time — reservas gerais ficam sem team.
        if (time) {
          await tx.teamPlayer.create({
            data: { id: gerarId(), teamId: time.id, jogadorId },
          });
        }
        await tx.attendance.create({
          data: {
            id: gerarId(),
            partidaId: partida.id,
            jogadorId,
            status: time ? 'confirmado' : 'lista_espera',
            funcao: req.body.funcao,
          },
        });
      });

      return (await carregarPartidaAoVivo(app, partida.id))!;
    },
  );

  // ---- Substituição: promove reserva a titular (opcional: tira alguém) -----
  typed.post(
    '/partidas/:id/substituir',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: substituirJogadorBodySchema,
        response: {
          200: partidaAoVivoSchema,
          400: erroResponseSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const userId = req.usuario!.id;
      const partida = await pegarPartidaSePodeControlar(app, req, reply, req.params.id);
      if (!partida) return;

      // Attendance do entra deve existir (reserva registrado na partida).
      const entra = await app.prisma.attendance.findUnique({
        where: { partidaId_jogadorId: { partidaId: partida.id, jogadorId: req.body.entraId } },
      });
      if (!entra) return reply.code(400).send({ mensagem: 'Jogador que entra não pertence à partida' });

      // Sai é opcional. Se existir, precisa ter TeamPlayer atual — o teamId
      // do destino é herdado dele. Se saiId=null, precisa vir teamId no body.
      let sai: Awaited<ReturnType<typeof app.prisma.attendance.findUnique>> = null;
      let saiTeamPlayer: Awaited<ReturnType<typeof app.prisma.teamPlayer.findFirst>> = null;
      if (req.body.saiId) {
        sai = await app.prisma.attendance.findUnique({
          where: { partidaId_jogadorId: { partidaId: partida.id, jogadorId: req.body.saiId } },
        });
        if (!sai) return reply.code(400).send({ mensagem: 'Jogador que sai não pertence à partida' });
        saiTeamPlayer = await app.prisma.teamPlayer.findFirst({
          where: { jogadorId: req.body.saiId, team: { partidaId: partida.id } },
        });
      }

      // Determina o time de destino do entra.
      let teamIdDestino: string | null = null;
      if (saiTeamPlayer) {
        teamIdDestino = saiTeamPlayer.teamId;
      } else if (req.body.teamId) {
        const timeDest = await app.prisma.team.findFirst({
          where: { id: req.body.teamId, partidaId: partida.id },
        });
        if (!timeDest) return reply.code(400).send({ mensagem: 'Time não pertence à partida' });
        teamIdDestino = timeDest.id;
      } else {
        return reply
          .code(400)
          .send({ mensagem: 'teamId obrigatório quando não há jogador saindo' });
      }

      // Se o entra já tem um TeamPlayer (raro em reserva geral, mas possível
      // se foi titular e virou reserva), remove antes de re-criar no destino.
      const entraTeamPlayerExistente = await app.prisma.teamPlayer.findFirst({
        where: { jogadorId: req.body.entraId, team: { partidaId: partida.id } },
      });

      await app.prisma.$transaction(async (tx) => {
        // Sai vira reserva: perde TeamPlayer e status muda pra lista_espera.
        if (sai && saiTeamPlayer) {
          await tx.teamPlayer.delete({ where: { id: saiTeamPlayer.id } });
          await tx.attendance.update({
            where: { id: sai.id },
            data: { status: 'lista_espera' },
          });
        }
        // Entra vai a campo: garante TeamPlayer no teamIdDestino + confirmado.
        if (entraTeamPlayerExistente) {
          await tx.teamPlayer.delete({ where: { id: entraTeamPlayerExistente.id } });
        }
        await tx.teamPlayer.create({
          data: { id: gerarId(), teamId: teamIdDestino!, jogadorId: req.body.entraId },
        });
        await tx.attendance.update({
          where: { id: entra.id },
          data: { status: 'confirmado' },
        });
        // Grava o evento pra permitir Desfazer. `assistenteJogadorId` é
        // reaproveitado como "quem saiu" (nullable quando entrou sem tirar).
        await tx.eventoPartida.create({
          data: {
            id: gerarId(),
            partidaId: partida.id,
            teamId: teamIdDestino!,
            jogadorId: req.body.entraId,
            assistenteJogadorId: req.body.saiId ?? null,
            tipo: 'substituicao',
            minutoJogo: minutoJogoAtual(partida),
            criadoPorUserId: userId,
          },
        });
      });

      return (await carregarPartidaAoVivo(app, partida.id))!;
    },
  );

  // ---- Duplicar partida (nova rodada com os mesmos times/jogadores) --------
  // Cria nova Partida standalone reaproveitando os Jogador rows (não cria
  // duplicatas). Nova composição de Team + TeamPlayer + Attendance. Placar,
  // eventos e cronômetro começam do zero.
  typed.post(
    '/partidas/:id/duplicar',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          201: partidaAoVivoSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const userId = req.usuario!.id;
      const original = await pegarPartidaSePodeControlar(app, req, reply, req.params.id);
      if (!original) return;

      // Reidrata a original com times + presenças (funções) — precisamos das
      // duas coisas pra copiar a composição inteira.
      const detalhe = await app.prisma.partida.findUnique({
        where: { id: original.id },
        include: {
          times: { include: { jogadores: { select: { jogadorId: true } } } },
          presencas: { select: { jogadorId: true, funcao: true, status: true } },
        },
      });
      if (!detalhe) return reply.code(404).send({ mensagem: 'Partida não encontrada' });

      const funcaoPorJogador = new Map<string, 'goleiro' | 'linha'>();
      const statusPorJogador = new Map<string, 'confirmado' | 'lista_espera' | 'recusado'>();
      for (const p of detalhe.presencas) {
        funcaoPorJogador.set(p.jogadorId, p.funcao);
        statusPorJogador.set(p.jogadorId, p.status);
      }

      // Pré-mapeia novo teamId por time original — precisamos dos IDs antes
      // da criação pra montar `emCampoTeamIds` da nova partida em racha 3+.
      const mapaTimes = new Map<string, string>();
      for (const t of detalhe.times) mapaTimes.set(t.id, gerarId());

      // Racha 3+ times: preserva o vencedor da última rodada em campo — sai
      // o perdedor, entra o próximo da fila (alfabético entre os que estavam
      // fora). Sem isso, a nova partida cai no default `[times[0], times[1]]`
      // e o vencedor perde o lugar em campo.
      let emCampoInicial: string[] = [];
      if (detalhe.times.length >= 3 && detalhe.emCampoTeamIds.length === 2) {
        const [a, b] = detalhe.emCampoTeamIds as [string, string];
        const ultimaRodada = await app.prisma.eventoPartida.findFirst({
          where: { partidaId: detalhe.id, tipo: 'rodada_encerrada' },
          orderBy: { criadoEm: 'desc' },
          select: { criadoEm: true },
        });
        const eventosGol = await app.prisma.eventoPartida.findMany({
          where: {
            partidaId: detalhe.id,
            tipo: { in: ['gol', 'gol_contra'] },
            ...(ultimaRodada ? { criadoEm: { gt: ultimaRodada.criadoEm } } : {}),
          },
          select: { teamId: true },
        });
        const gA = eventosGol.filter((e) => e.teamId === a).length;
        const gB = eventosGol.filter((e) => e.teamId === b).length;
        const vencedorOriginal = gA > gB ? a : gB > gA ? b : a;
        const perdedorOriginal = vencedorOriginal === a ? b : a;
        const foraDeCampoOrdenado = [...detalhe.times]
          .filter((t) => !detalhe.emCampoTeamIds.includes(t.id))
          .sort((x, y) => x.nome.localeCompare(y.nome));
        const proximoOriginal = foraDeCampoOrdenado[0]?.id ?? perdedorOriginal;
        emCampoInicial = [
          mapaTimes.get(vencedorOriginal)!,
          mapaTimes.get(proximoOriginal)!,
        ];
      } else if (detalhe.times.length >= 2) {
        // 2 times: mantém a ordem original (o frontend define lado A/B).
        const timesOrdenados = [...detalhe.times].sort((x, y) => x.nome.localeCompare(y.nome));
        emCampoInicial = [
          mapaTimes.get(timesOrdenados[0]!.id)!,
          mapaTimes.get(timesOrdenados[1]!.id)!,
        ];
      }

      const novaId = gerarId();
      await app.prisma.$transaction(async (tx) => {
        await tx.partida.create({
          data: {
            id: novaId,
            peladaId: null,
            temporadaId: null,
            criadoPorUserId: userId,
            nome: detalhe.nome,
            data: new Date(),
            status: 'agendada',
            metaGols: detalhe.metaGols,
            duracaoMinutos: detalhe.duracaoMinutos,
            modoDesempate: detalhe.modoDesempate,
            emCampoTeamIds: emCampoInicial,
          },
        });
        const jogadoresJaCriados = new Set<string>();
        for (const timeOriginal of detalhe.times) {
          const novoTimeId = mapaTimes.get(timeOriginal.id)!;
          await tx.team.create({
            data: {
              id: novoTimeId,
              partidaId: novaId,
              nome: timeOriginal.nome,
              cor: timeOriginal.cor,
            },
          });
          for (const tp of timeOriginal.jogadores) {
            await tx.teamPlayer.create({
              data: { id: gerarId(), teamId: novoTimeId, jogadorId: tp.jogadorId },
            });
            await tx.attendance.create({
              data: {
                id: gerarId(),
                partidaId: novaId,
                jogadorId: tp.jogadorId,
                // Reserva se mantém reserva na próxima rodada.
                status:
                  statusPorJogador.get(tp.jogadorId) === 'lista_espera'
                    ? 'lista_espera'
                    : 'confirmado',
                funcao: funcaoPorJogador.get(tp.jogadorId) ?? 'linha',
              },
            });
            jogadoresJaCriados.add(tp.jogadorId);
          }
        }
        // Reservas gerais (sem TeamPlayer na original): copia Attendance
        // sem criar TeamPlayer. Detectados por: presenca existe mas jogadorId
        // não apareceu em nenhum time.jogadores.
        for (const p of detalhe.presencas) {
          if (jogadoresJaCriados.has(p.jogadorId)) continue;
          await tx.attendance.create({
            data: {
              id: gerarId(),
              partidaId: novaId,
              jogadorId: p.jogadorId,
              status: 'lista_espera',
              funcao: p.funcao,
            },
          });
        }
      });

      const nova = await carregarPartidaAoVivo(app, novaId);
      if (!nova) return reply.code(404).send({ mensagem: 'Erro ao duplicar' });
      return reply.code(201).send(nova);
    },
  );
}
