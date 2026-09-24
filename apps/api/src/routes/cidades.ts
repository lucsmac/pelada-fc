import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

const cidadeItemSchema = z.object({
  nome: z.string(),
  uf: z.string(),
  totalLocais: z.number().int().nonnegative(),
});

const cidadesResponseSchema = z.object({
  itens: z.array(cidadeItemSchema),
});

const cidadesQuerySchema = z.object({
  busca: z.string().max(80).optional(),
});

export async function cidadesRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // Deriva cidades a partir dos Locais cadastrados.
  typed.get(
    '/',
    {
      schema: {
        querystring: cidadesQuerySchema,
        response: { 200: cidadesResponseSchema },
      },
    },
    async (req) => {
      const busca = req.query.busca?.trim();
      const grouped = await app.prisma.local.groupBy({
        by: ['cidadeNome', 'cidadeUf'],
        _count: { _all: true },
        ...(busca && {
          where: { cidadeNome: { contains: busca, mode: 'insensitive' } },
        }),
        orderBy: { _count: { cidadeNome: 'desc' } },
        take: 30,
      });
      return {
        itens: grouped.map((g) => ({
          nome: g.cidadeNome,
          uf: g.cidadeUf,
          totalLocais: g._count._all,
        })),
      };
    },
  );
}
