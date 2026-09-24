import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { gerarId } from '@peladafc/db';
import {
  criarTemporadaBodySchema,
  editarTemporadaBodySchema,
  erroResponseSchema,
  listarTemporadasResponseSchema,
  temporadaSchema,
} from '@peladafc/contracts';
import { ordenarRanking } from '@peladafc/domain';
import { calcularRanking } from '../services/estatisticas.js';

async function verificarAdmin(
  app: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply,
  peladaId: string,
) {
  const userId = req.usuario!.id;
  const pelada = await app.prisma.pelada.findUnique({
    where: { id: peladaId },
    include: { membros: { where: { jogador: { userId } }, select: { papel: true } } },
  });
  if (!pelada) {
    reply.code(404).send({ mensagem: 'Pelada não encontrada' });
    return null;
  }
  const ehAdmin =
    pelada.criadoPorUserId === userId || pelada.membros.some((m) => m.papel === 'admin');
  if (!ehAdmin) {
    reply.code(403).send({ mensagem: 'Apenas admins' });
    return null;
  }
  return pelada;
}

export async function temporadasRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ---- Listar temporadas de uma pelada ------------------------------------
  typed.get(
    '/peladas/:peladaId/temporadas',
    {
      schema: {
        params: z.object({ peladaId: z.string().uuid() }),
        response: {
          200: listarTemporadasResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const pelada = await app.prisma.pelada.findUnique({ where: { id: req.params.peladaId } });
      if (!pelada) return reply.code(404).send({ mensagem: 'Pelada não encontrada' });
      const itens = await app.prisma.temporada.findMany({
        where: { peladaId: pelada.id },
        orderBy: [{ ano: 'desc' }, { numero: 'desc' }],
      });
      return { itens, total: itens.length };
    },
  );

  // ---- Criar temporada (admin) --------------------------------------------
  typed.post(
    '/peladas/:peladaId/temporadas',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ peladaId: z.string().uuid() }),
        body: criarTemporadaBodySchema,
        response: {
          201: temporadaSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          409: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const pelada = await verificarAdmin(app, req, reply, req.params.peladaId);
      if (!pelada) return;

      const duplicada = await app.prisma.temporada.findUnique({
        where: {
          peladaId_ano_numero: {
            peladaId: pelada.id,
            ano: req.body.ano,
            numero: req.body.numero,
          },
        },
      });
      if (duplicada) {
        return reply.code(409).send({ mensagem: 'Já existe uma temporada com esse ano/número' });
      }

      const temporadaId = gerarId();
      const nova = await app.prisma.temporada.create({
        data: {
          id: temporadaId,
          peladaId: pelada.id,
          ano: req.body.ano,
          numero: req.body.numero,
          nome: req.body.nome ?? null,
          inicioEm: req.body.inicioEm,
          fimEm: req.body.fimEm ?? null,
        },
      });

      if (req.body.ativarComoAtual) {
        await app.prisma.pelada.update({
          where: { id: pelada.id },
          data: { temporadaAtualId: temporadaId },
        });
      }
      return reply.code(201).send(nova);
    },
  );

  // ---- Editar temporada (admin) -------------------------------------------
  typed.put(
    '/temporadas/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: editarTemporadaBodySchema,
        response: {
          200: temporadaSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const temporada = await app.prisma.temporada.findUnique({ where: { id: req.params.id } });
      if (!temporada) return reply.code(404).send({ mensagem: 'Temporada não encontrada' });
      const admin = await verificarAdmin(app, req, reply, temporada.peladaId);
      if (!admin) return;
      if (temporada.encerradaEm) {
        return reply.code(403).send({ mensagem: 'Temporada encerrada não pode ser editada' });
      }

      const atual = await app.prisma.temporada.update({
        where: { id: req.params.id },
        data: {
          ...(req.body.ano !== undefined && { ano: req.body.ano }),
          ...(req.body.numero !== undefined && { numero: req.body.numero }),
          ...(req.body.nome !== undefined && { nome: req.body.nome ?? null }),
          ...(req.body.inicioEm !== undefined && { inicioEm: req.body.inicioEm }),
          ...(req.body.fimEm !== undefined && { fimEm: req.body.fimEm ?? null }),
        },
      });
      return atual;
    },
  );

  // ---- Encerrar temporada — congela snapshot ------------------------------
  typed.post(
    '/temporadas/:id/encerrar',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: temporadaSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          409: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const temporada = await app.prisma.temporada.findUnique({ where: { id: req.params.id } });
      if (!temporada) return reply.code(404).send({ mensagem: 'Temporada não encontrada' });
      const admin = await verificarAdmin(app, req, reply, temporada.peladaId);
      if (!admin) return;
      if (temporada.encerradaEm) {
        return reply.code(409).send({ mensagem: 'Temporada já encerrada' });
      }

      const linhas = await calcularRanking(app.prisma, {
        peladaId: temporada.peladaId,
        temporadaId: temporada.id,
      });
      const ordenadas = ordenarRanking(linhas, 'geral');
      const linhasJson = ordenadas as unknown as import('@peladafc/db').Prisma.InputJsonValue;

      await app.prisma.$transaction([
        app.prisma.seasonRanking.upsert({
          where: { temporadaId: temporada.id },
          create: {
            id: gerarId(),
            temporadaId: temporada.id,
            linhas: linhasJson,
          },
          update: { linhas: linhasJson },
        }),
        app.prisma.temporada.update({
          where: { id: temporada.id },
          data: { encerradaEm: new Date(), fimEm: temporada.fimEm ?? new Date() },
        }),
        // Se era a atual, desvincula da pelada
        app.prisma.pelada.updateMany({
          where: { temporadaAtualId: temporada.id },
          data: { temporadaAtualId: null },
        }),
      ]);

      const atualizada = await app.prisma.temporada.findUnique({ where: { id: temporada.id } });
      return atualizada!;
    },
  );

  // ---- Ativar temporada como atual (admin) --------------------------------
  typed.post(
    '/temporadas/:id/ativar',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: temporadaSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          409: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const temporada = await app.prisma.temporada.findUnique({ where: { id: req.params.id } });
      if (!temporada) return reply.code(404).send({ mensagem: 'Temporada não encontrada' });
      const admin = await verificarAdmin(app, req, reply, temporada.peladaId);
      if (!admin) return;
      if (temporada.encerradaEm) {
        return reply.code(409).send({ mensagem: 'Não é possível ativar temporada encerrada' });
      }
      await app.prisma.pelada.update({
        where: { id: temporada.peladaId },
        data: { temporadaAtualId: temporada.id },
      });
      return temporada;
    },
  );
}
