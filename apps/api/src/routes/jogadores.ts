import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  buscarJogadoresQuerySchema,
  buscarJogadoresResponseSchema,
  calendarioQuerySchema,
  calendarioResponseSchema,
  editarJogadorBodySchema,
  editarPrivacidadeBodySchema,
  erroResponseSchema,
  jogadorSchema,
  perfilJogadorResponseSchema,
} from '@peladafc/contracts';
import { calcularRating } from '@peladafc/domain';
import { calcularRanking } from '../services/estatisticas.js';
import { montarCalendario } from '../services/calendario.js';

export async function jogadoresRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ---- Buscar jogadores por nome (para picker de convidados) --------------
  typed.get(
    '/',
    {
      schema: {
        querystring: buscarJogadoresQuerySchema,
        response: { 200: buscarJogadoresResponseSchema },
      },
    },
    async (req) => {
      const termo = req.query.q.trim();
      const excluirIds: string[] = [];
      if (req.query.excluirPeladaId) {
        const membros = await app.prisma.groupMember.findMany({
          where: { peladaId: req.query.excluirPeladaId },
          select: { jogadorId: true },
        });
        for (const m of membros) excluirIds.push(m.jogadorId);
      }
      const itens = await app.prisma.jogador.findMany({
        where: {
          AND: [
            {
              OR: [
                { nome: { contains: termo, mode: 'insensitive' } },
                { apelido: { contains: termo, mode: 'insensitive' } },
              ],
            },
            excluirIds.length > 0 ? { id: { notIn: excluirIds } } : {},
          ],
        },
        take: req.query.limite,
        orderBy: { nome: 'asc' },
        select: {
          id: true,
          nome: true,
          apelido: true,
          avatarInicial: true,
          cidadeAtual: true,
        },
      });
      return { itens };
    },
  );

  // ---- Calendário público (respeita privacidade) --------------------------
  typed.get(
    '/:id/calendario',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        querystring: calendarioQuerySchema,
        response: {
          200: calendarioResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const jogador = await app.prisma.jogador.findUnique({ where: { id: req.params.id } });
      if (!jogador) return reply.code(404).send({ mensagem: 'Jogador não encontrado' });

      let ehDono = false;
      const auth = req.headers.authorization;
      if (auth?.startsWith('Bearer ')) {
        try {
          await app.authenticate(req, reply);
          if (reply.sent) return;
          ehDono = req.usuario?.id === jogador.userId;
        } catch {
          /* segue como visitante */
        }
      }
      if (!ehDono && !jogador.mostrarCalendarioPublico) {
        return reply.code(403).send({ mensagem: 'Calendário privado' });
      }
      const itens = await montarCalendario(app.prisma, jogador.id, {
        desde: req.query.desde,
        ate: req.query.ate,
      });
      return { itens };
    },
  );

  // ---- Perfil (respeita privacidade) ---------------------------------------
  typed.get(
    '/:id',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: perfilJogadorResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const jogador = await app.prisma.jogador.findUnique({
        where: { id: req.params.id },
        include: {
          membros: {
            include: {
              pelada: { select: { id: true, slug: true, nome: true, publica: true } },
            },
          },
        },
      });
      if (!jogador) return reply.code(404).send({ mensagem: 'Jogador não encontrado' });

      // Descobre se quem consulta é o dono
      const auth = req.headers.authorization;
      let ehDono = false;
      if (auth?.startsWith('Bearer ')) {
        try {
          await app.authenticate(req, reply);
          if (reply.sent) return;
          ehDono = req.usuario?.id === jogador.userId;
        } catch {
          /* não autenticado, tudo bem */
        }
      }

      if (!ehDono && !jogador.perfilPublico) {
        return reply.code(403).send({ mensagem: 'Perfil privado' });
      }

      const showEstatisticas = ehDono || jogador.mostrarEstatisticas;
      const showPeladas = ehDono || jogador.mostrarPeladas;

      const linhas = showEstatisticas ? await calcularRanking(app.prisma, {}) : [];
      const carreira = linhas.find((l) => l.jogadorId === jogador.id)?.estatisticas ?? null;

      const peladas =
        showPeladas
          ? jogador.membros
              .filter((m) => (ehDono ? true : m.pelada.publica))
              .map((m) => ({
                id: m.pelada.id,
                slug: m.pelada.slug,
                nome: m.pelada.nome,
                papel: m.papel,
              }))
          : null;

      return {
        jogador: {
          id: jogador.id,
          userId: jogador.userId,
          nome: jogador.nome,
          apelido: jogador.apelido,
          avatarInicial: jogador.avatarInicial,
          cidadeAtual: jogador.cidadeAtual,
          funcaoPreferida: jogador.funcaoPreferida,
          posicaoLinha: jogador.funcaoPreferida === 'linha' ? jogador.posicaoLinha : null,
          telefone: ehDono ? jogador.telefone : null,
          criadoEm: jogador.criadoEm,
        },
        privacidade: ehDono
          ? {
              perfilPublico: jogador.perfilPublico,
              mostrarEstatisticas: jogador.mostrarEstatisticas,
              mostrarPeladas: jogador.mostrarPeladas,
              mostrarHistorico: jogador.mostrarHistorico,
              mostrarCalendarioPublico: jogador.mostrarCalendarioPublico,
            }
          : null,
        carreira: showEstatisticas
          ? carreira ?? {
              partidas: 0,
              gols: 0,
              assistencias: 0,
              vitorias: 0,
              empates: 0,
              derrotas: 0,
              mvps: 0,
            }
          : null,
        rating: showEstatisticas && carreira ? calcularRating(carreira) : null,
        peladas,
      };
    },
  );

  // ---- Editar próprio jogador (auth) --------------------------------------
  typed.put(
    '/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: editarJogadorBodySchema,
        response: {
          200: jogadorSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const userId = req.usuario!.id;
      const jogador = await app.prisma.jogador.findUnique({
        where: { id: req.params.id },
        include: {
          membros: { select: { peladaId: true } },
        },
      });
      if (!jogador) return reply.code(404).send({ mensagem: 'Jogador não encontrado' });

      const ehDono = jogador.userId === userId;

      // Admin de qualquer pelada em que o jogador participa pode mexer só em
      // função/posição (usado pra montar times) — outros campos ficam com dono.
      let ehAdminDeAlgumaPelada = false;
      if (!ehDono && jogador.membros.length > 0) {
        const peladaIds = jogador.membros.map((m) => m.peladaId);
        const adminNessa = await app.prisma.groupMember.findFirst({
          where: {
            peladaId: { in: peladaIds },
            papel: 'admin',
            jogador: { userId },
          },
          select: { id: true },
        });
        ehAdminDeAlgumaPelada = !!adminNessa;
      }

      if (!ehDono && !ehAdminDeAlgumaPelada) {
        return reply.code(403).send({ mensagem: 'Sem permissão para editar este jogador' });
      }

      const camposIdentidade =
        req.body.nome !== undefined ||
        req.body.apelido !== undefined ||
        req.body.cidadeAtual !== undefined;
      if (camposIdentidade && !ehDono) {
        return reply.code(403).send({
          mensagem: 'Só o dono do perfil pode editar nome, apelido ou cidade',
        });
      }

      // Se está mudando pra goleiro, zera posicaoLinha; se está mudando pra linha,
      // preserva o que veio (se veio) ou o que já tinha.
      const trocouParaGoleiro = req.body.funcaoPreferida === 'goleiro';

      const atual = await app.prisma.jogador.update({
        where: { id: req.params.id },
        data: {
          ...(req.body.nome !== undefined && {
            nome: req.body.nome.trim(),
            avatarInicial: req.body.nome.trim()[0]!.toUpperCase(),
          }),
          ...(req.body.apelido !== undefined && { apelido: req.body.apelido }),
          ...(req.body.cidadeAtual !== undefined && { cidadeAtual: req.body.cidadeAtual }),
          ...(req.body.funcaoPreferida !== undefined && {
            funcaoPreferida: req.body.funcaoPreferida,
          }),
          ...(trocouParaGoleiro
            ? { posicaoLinha: null }
            : req.body.posicaoLinha !== undefined && { posicaoLinha: req.body.posicaoLinha }),
        },
      });
      return atual;
    },
  );

  // ---- Editar privacidade -------------------------------------------------
  typed.put(
    '/:id/privacidade',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: editarPrivacidadeBodySchema,
        response: {
          200: jogadorSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const userId = req.usuario!.id;
      const jogador = await app.prisma.jogador.findUnique({ where: { id: req.params.id } });
      if (!jogador) return reply.code(404).send({ mensagem: 'Jogador não encontrado' });
      if (jogador.userId !== userId) {
        return reply.code(403).send({ mensagem: 'Sem permissão' });
      }
      const atual = await app.prisma.jogador.update({
        where: { id: req.params.id },
        data: {
          ...(req.body.perfilPublico !== undefined && { perfilPublico: req.body.perfilPublico }),
          ...(req.body.mostrarEstatisticas !== undefined && {
            mostrarEstatisticas: req.body.mostrarEstatisticas,
          }),
          ...(req.body.mostrarPeladas !== undefined && { mostrarPeladas: req.body.mostrarPeladas }),
          ...(req.body.mostrarHistorico !== undefined && {
            mostrarHistorico: req.body.mostrarHistorico,
          }),
          ...(req.body.mostrarCalendarioPublico !== undefined && {
            mostrarCalendarioPublico: req.body.mostrarCalendarioPublico,
          }),
        },
      });
      return atual;
    },
  );
}
