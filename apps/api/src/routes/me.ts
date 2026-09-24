import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { calcularRating } from '@peladafc/domain';
import {
  calendarioQuerySchema,
  calendarioResponseSchema,
  erroResponseSchema,
  minhaProximaPartidaResponseSchema,
  minhaUltimaPartidaResponseSchema,
  minhasCandidaturasResponseSchema,
  minhasEstatisticasSchema,
  minhasPeladasResponseSchema,
  sugestoesPeladasResponseSchema,
} from '@peladafc/contracts';
import { calcularRanking } from '../services/estatisticas.js';
import { montarCalendario } from '../services/calendario.js';

export async function meRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ---- Peladas do usuário ---------------------------------------------------
  //
  // Retorna todas as peladas onde o user é membro (via GroupMember → Jogador
  // → User) com papel e a próxima partida agendada de cada.
  typed.get(
    '/peladas',
    {
      onRequest: [app.authenticate],
      schema: {
        response: {
          200: minhasPeladasResponseSchema,
          401: erroResponseSchema,
        },
      },
    },
    async (req) => {
      const userId = req.usuario!.id;
      const membros = await app.prisma.groupMember.findMany({
        where: { jogador: { userId } },
        include: {
          pelada: {
            include: {
              local: { select: { nome: true, cidadeNome: true, cidadeUf: true } },
              partidas: {
                where: { status: 'agendada', data: { gte: new Date() } },
                orderBy: { data: 'asc' },
                take: 1,
                select: { data: true },
              },
              _count: { select: { membros: true } },
            },
          },
        },
        orderBy: { entrouEm: 'desc' },
      });

      const itens = membros.map((m) => ({
        pelada: {
          id: m.pelada.id,
          slug: m.pelada.slug,
          nome: m.pelada.nome,
          descricao: m.pelada.descricao,
          modalidade: m.pelada.modalidade,
          localId: m.pelada.localId,
          diaSemana: m.pelada.diaSemana,
          horario: m.pelada.horario,
          quantidadeTimes: m.pelada.quantidadeTimes,
          jogadoresPorTime: m.pelada.jogadoresPorTime,
          goleirosPorTime: m.pelada.goleirosPorTime,
          tamanhoReserva: m.pelada.tamanhoReserva,
          goleirosPagam: m.pelada.goleirosPagam,
          totalJogadores: m.pelada.quantidadeTimes * m.pelada.jogadoresPorTime,
          maxGoleiros: m.pelada.quantidadeTimes * m.pelada.goleirosPorTime,
          limiteMembros: m.pelada.limiteMembros,
          abertaParaNovos: m.pelada.abertaParaNovos,
          publica: m.pelada.publica,
          aprovacaoObrigatoria: m.pelada.aprovacaoObrigatoria,
          criadoPorUserId: m.pelada.criadoPorUserId,
          temporadaAtualId: m.pelada.temporadaAtualId,
          tokenConvitePublico: m.pelada.tokenConvitePublico,
          convidadosPagamCustos: m.pelada.convidadosPagamCustos,
          criadoEm: m.pelada.criadoEm,
        },
        local: m.pelada.local,
        papel: m.papel,
        proximaPartida: m.pelada.partidas[0]?.data ?? null,
        totalMembros: m.pelada._count.membros,
      }));

      return { itens, total: itens.length };
    },
  );

  // ---- Próxima partida (agregada) ------------------------------------------
  typed.get(
    '/partidas/proxima',
    {
      onRequest: [app.authenticate],
      schema: {
        response: {
          200: minhaProximaPartidaResponseSchema,
          401: erroResponseSchema,
        },
      },
    },
    async (req) => {
      const userId = req.usuario!.id;
      const partida = await app.prisma.partida.findFirst({
        where: {
          status: 'agendada',
          data: { gte: new Date() },
          pelada: { membros: { some: { jogador: { userId } } } },
        },
        include: {
          pelada: {
            select: {
              id: true,
              slug: true,
              nome: true,
              local: { select: { nome: true, cidadeNome: true, cidadeUf: true } },
            },
          },
        },
        orderBy: { data: 'asc' },
      });
      if (!partida) return { partida: null };
      // O where filtra por pelada.membros — pelada é sempre não-null aqui.
      const pelada = partida.pelada!;
      return {
        partida: {
          ...partida,
          pelada: { id: pelada.id, slug: pelada.slug, nome: pelada.nome },
          local: pelada.local,
        },
      };
    },
  );

  // ---- Última partida (agregada, com placar e destaques) -------------------
  typed.get(
    '/partidas/ultima',
    {
      onRequest: [app.authenticate],
      schema: {
        response: {
          200: minhaUltimaPartidaResponseSchema,
          401: erroResponseSchema,
        },
      },
    },
    async (req) => {
      const userId = req.usuario!.id;
      const partida = await app.prisma.partida.findFirst({
        where: {
          status: 'finalizada',
          pelada: { membros: { some: { jogador: { userId } } } },
        },
        include: {
          pelada: {
            select: {
              id: true,
              slug: true,
              nome: true,
              local: { select: { nome: true, cidadeNome: true, cidadeUf: true } },
            },
          },
          estatisticas: {
            include: { jogador: { select: { id: true, nome: true, avatarInicial: true } } },
            orderBy: [{ foiMvp: 'desc' }, { gols: 'desc' }, { assistencias: 'desc' }],
            take: 4,
          },
        },
        orderBy: { data: 'desc' },
      });
      if (!partida) return { partida: null };
      // O where filtra por pelada.membros — pelada é sempre não-null aqui.
      const pelada = partida.pelada!;
      return {
        partida: {
          ...partida,
          pelada: { id: pelada.id, slug: pelada.slug, nome: pelada.nome },
          local: pelada.local,
          destaques: partida.estatisticas.map((e) => ({
            jogadorId: e.jogadorId,
            nome: e.jogador.nome,
            avatarInicial: e.jogador.avatarInicial,
            gols: e.gols,
            assistencias: e.assistencias,
            foiMvp: e.foiMvp,
          })),
        },
      };
    },
  );

  // ---- Minhas candidaturas pendentes ---------------------------------------
  typed.get(
    '/candidaturas',
    {
      onRequest: [app.authenticate],
      schema: {
        querystring: z.object({
          status: z.enum(['pendente', 'aceito', 'recusado']).optional(),
        }),
        response: {
          200: minhasCandidaturasResponseSchema,
          401: erroResponseSchema,
        },
      },
    },
    async (req) => {
      const userId = req.usuario!.id;
      const itens = await app.prisma.groupApplication.findMany({
        where: { userId, ...(req.query.status && { status: req.query.status }) },
        include: {
          user: { select: { id: true, nome: true, telefone: true, email: true } },
          pelada: { select: { id: true, slug: true, nome: true } },
        },
        orderBy: [{ status: 'asc' }, { criadoEm: 'desc' }],
      });
      return { itens, total: itens.length };
    },
  );

  // ---- Estatísticas agregadas ----------------------------------------------
  //
  // Reusa o calcularRanking (escopo global) e filtra pela linha do próprio
  // jogador. Zeros por padrão se o user ainda não jogou nada.
  typed.get(
    '/estatisticas',
    {
      onRequest: [app.authenticate],
      schema: {
        response: {
          200: minhasEstatisticasSchema,
          401: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const userId = req.usuario!.id;
      const jogador = await app.prisma.jogador.findUnique({ where: { userId } });
      if (!jogador) {
        return reply.code(422).send({ mensagem: 'Perfil sem jogador vinculado' });
      }

      const linhas = await calcularRanking(app.prisma, {});
      const est = linhas.find((l) => l.jogadorId === jogador.id)?.estatisticas ?? {
        partidas: 0,
        gols: 0,
        assistencias: 0,
        vitorias: 0,
        empates: 0,
        derrotas: 0,
        mvps: 0,
      };
      return {
        ...est,
        rating: est.partidas > 0 ? calcularRating(est) : null,
      };
    },
  );

  // ---- Sugestões de peladas ------------------------------------------------
  //
  // Peladas públicas + abertas + na mesma cidade do jogador (se souber), que
  // o user ainda não é membro. Se não tem cidade, retorna as mais recentes.
  typed.get(
    '/sugestoes-peladas',
    {
      onRequest: [app.authenticate],
      schema: {
        querystring: z.object({
          limite: z.coerce.number().int().min(1).max(20).default(6),
        }),
        response: {
          200: sugestoesPeladasResponseSchema,
          401: erroResponseSchema,
        },
      },
    },
    async (req) => {
      const userId = req.usuario!.id;
      const jogador = await app.prisma.jogador.findUnique({
        where: { userId },
        select: { id: true, cidadeAtual: true },
      });
      const jaMembroDe = jogador
        ? await app.prisma.groupMember.findMany({
            where: { jogadorId: jogador.id },
            select: { peladaId: true },
          })
        : [];
      const ignorarIds = jaMembroDe.map((m) => m.peladaId);

      const peladas = await app.prisma.pelada.findMany({
        where: {
          publica: true,
          abertaParaNovos: true,
          id: { notIn: ignorarIds },
          ...(jogador?.cidadeAtual && {
            local: { cidadeNome: { equals: jogador.cidadeAtual, mode: 'insensitive' } },
          }),
        },
        include: {
          local: { select: { nome: true, cidadeNome: true, cidadeUf: true } },
          _count: { select: { membros: true } },
        },
        orderBy: { criadoEm: 'desc' },
        take: req.query.limite,
      });

      const itens = peladas.map((p) => ({
        id: p.id,
        slug: p.slug,
        nome: p.nome,
        descricao: p.descricao,
        modalidade: p.modalidade,
        localId: p.localId,
        diaSemana: p.diaSemana,
        horario: p.horario,
        quantidadeTimes: p.quantidadeTimes,
        jogadoresPorTime: p.jogadoresPorTime,
        goleirosPorTime: p.goleirosPorTime,
        tamanhoReserva: p.tamanhoReserva,
        goleirosPagam: p.goleirosPagam,
        totalJogadores: p.quantidadeTimes * p.jogadoresPorTime,
        maxGoleiros: p.quantidadeTimes * p.goleirosPorTime,
        limiteMembros: p.limiteMembros,
        abertaParaNovos: p.abertaParaNovos,
        publica: p.publica,
        aprovacaoObrigatoria: p.aprovacaoObrigatoria,
        criadoPorUserId: p.criadoPorUserId,
        temporadaAtualId: p.temporadaAtualId,
        tokenConvitePublico: p.tokenConvitePublico,
        convidadosPagamCustos: p.convidadosPagamCustos,
        criadoEm: p.criadoEm,
        local: p.local,
        totalMembros: p._count.membros,
      }));
      return { itens, total: itens.length };
    },
  );

  // ---- Meu calendário ------------------------------------------------------
  typed.get(
    '/calendario',
    {
      onRequest: [app.authenticate],
      schema: {
        querystring: calendarioQuerySchema,
        response: {
          200: calendarioResponseSchema,
          401: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const userId = req.usuario!.id;
      const jogador = await app.prisma.jogador.findUnique({ where: { userId } });
      if (!jogador) return reply.code(404).send({ mensagem: 'Perfil de jogador não encontrado' });
      const itens = await montarCalendario(app.prisma, jogador.id, {
        desde: req.query.desde,
        ate: req.query.ate,
      });
      return { itens };
    },
  );
}
