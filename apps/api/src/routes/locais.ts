import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Prisma } from '@peladafc/db';
import { gerarId } from '@peladafc/db';
import {
  criarLocalBodySchema,
  erroResponseSchema,
  listarLocaisQuerySchema,
  listarLocaisResponseSchema,
  localSchema,
} from '@peladafc/contracts';

export async function locaisRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ---- Listar --------------------------------------------------------------
  typed.get(
    '/',
    {
      schema: {
        querystring: listarLocaisQuerySchema,
        response: { 200: listarLocaisResponseSchema },
      },
    },
    async (req) => {
      const { cidade, uf, bairro, tipo, modalidade, busca, pagina, porPagina } = req.query;

      const where: Prisma.LocalWhereInput = {
        ...(cidade && { cidadeNome: { contains: cidade, mode: 'insensitive' } }),
        ...(uf && { cidadeUf: uf }),
        ...(bairro && { bairro: { contains: bairro, mode: 'insensitive' } }),
        ...(tipo && { tipo }),
        ...(modalidade && { modalidadesSuportadas: { has: modalidade } }),
        ...(busca && {
          OR: [
            { nome: { contains: busca, mode: 'insensitive' } },
            { bairro: { contains: busca, mode: 'insensitive' } },
          ],
        }),
      };

      const [total, itens] = await Promise.all([
        app.prisma.local.count({ where }),
        app.prisma.local.findMany({
          where,
          orderBy: [{ verificado: 'desc' }, { criadoEm: 'desc' }],
          skip: (pagina - 1) * porPagina,
          take: porPagina,
        }),
      ]);

      return { itens, total, pagina, porPagina };
    },
  );

  // ---- Detalhe -------------------------------------------------------------
  typed.get(
    '/:id',
    {
      schema: {
        params: localSchema.pick({ id: true }),
        response: {
          200: localSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const local = await app.prisma.local.findUnique({ where: { id: req.params.id } });
      if (!local) return reply.code(404).send({ mensagem: 'Local não encontrado' });
      return local;
    },
  );

  // ---- Criar (autenticado) -------------------------------------------------
  typed.post(
    '/',
    {
      onRequest: [app.authenticate],
      schema: {
        body: criarLocalBodySchema,
        response: {
          201: localSchema,
          401: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const userId = req.usuario!.id;
      const body = req.body;

      const criado = await app.prisma.local.create({
        data: {
          id: gerarId(),
          nome: body.nome.trim(),
          tipo: body.tipo,
          cidadeNome: body.cidadeNome.trim(),
          cidadeUf: body.cidadeUf.toUpperCase(),
          bairro: body.bairro?.trim() || null,
          endereco: body.endereco?.trim() || null,
          latitude: body.latitude ?? null,
          longitude: body.longitude ?? null,
          superficies: body.superficies,
          modalidadesSuportadas: body.modalidadesSuportadas,
          criadoPorUserId: userId,
        },
      });

      return reply.code(201).send(criado);
    },
  );
}
