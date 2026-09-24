import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Prisma, gerarId } from '@peladafc/db';
import { calcularTesourariaPartida } from '@peladafc/domain';
import {
  adicionarMembroBodySchema,
  criarPeladaBodySchema,
  editarPeladaBodySchema,
  erroResponseSchema,
  listarMembrosResponseSchema,
  listarPeladasQuerySchema,
  listarPeladasResponseSchema,
  membroSchema,
  peladaSchema,
} from '@peladafc/contracts';

// Derivados de config de times: expõe totalJogadores e maxGoleiros pra evitar
// duplicar essa conta em todo consumer.
export function derivarCapacidade(p: {
  quantidadeTimes: number;
  jogadoresPorTime: number;
  goleirosPorTime: number;
}) {
  return {
    totalJogadores: p.quantidadeTimes * p.jogadoresPorTime,
    maxGoleiros: p.quantidadeTimes * p.goleirosPorTime,
  };
}

// Preço estimado por jogador com base nos custos recorrentes ativos.
// Divisor da parte rateada = totalJogadores derivado da pelada (proxy pra
// "quantos vão pagar por partida"). Útil pra listar e comparar peladas.
function estimarPreco(
  custos: readonly { tipo: 'por_jogador' | 'rateado'; valorCentavos: number }[],
  totalJogadores: number,
) {
  const resumo = calcularTesourariaPartida(custos, totalJogadores);
  return {
    precoEstimadoCentavos: resumo.valorPorJogadorCentavos,
    precoTemRateado: resumo.totalRateadoCentavos > 0,
  };
}

// ---------------------------------------------------------------------------
// Helpers de autorização

/**
 * Verifica se o usuário logado é admin da pelada (via GroupMember) OU criador.
 * Retorna a pelada ou envia 403/404. Nunca retorna null com sucesso.
 */
async function checarAdmin(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  peladaId: string,
) {
  const userId = request.usuario!.id;
  const pelada = await app.prisma.pelada.findUnique({
    where: { id: peladaId },
    include: {
      membros: {
        where: { jogador: { userId } },
        select: { papel: true },
      },
    },
  });
  if (!pelada) {
    reply.code(404).send({ mensagem: 'Pelada não encontrada' });
    return null;
  }
  const ehCriador = pelada.criadoPorUserId === userId;
  const ehAdmin = pelada.membros.some((m) => m.papel === 'admin');
  if (!ehCriador && !ehAdmin) {
    reply.code(403).send({ mensagem: 'Apenas administradores podem realizar esta ação' });
    return null;
  }
  return pelada;
}

// ---------------------------------------------------------------------------

export async function peladasRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ---- Listar (público) ----------------------------------------------------
  typed.get(
    '/',
    {
      schema: {
        querystring: listarPeladasQuerySchema,
        response: { 200: listarPeladasResponseSchema },
      },
    },
    async (req) => {
      const { cidade, uf, modalidade, diaSemana, abertaParaNovos, busca, pagina, porPagina } =
        req.query;

      const where: Prisma.PeladaWhereInput = {
        publica: true,
        ...(modalidade && { modalidade }),
        ...(diaSemana && { diaSemana }),
        ...(abertaParaNovos !== undefined && { abertaParaNovos }),
        ...(cidade && {
          local: {
            cidadeNome: { equals: cidade, mode: 'insensitive' },
            ...(uf && { cidadeUf: uf }),
          },
        }),
        ...(!cidade && uf && { local: { cidadeUf: uf } }),
        ...(busca && {
          OR: [
            { nome: { contains: busca, mode: 'insensitive' } },
            { slug: { contains: busca, mode: 'insensitive' } },
          ],
        }),
      };

      const [total, brutas] = await Promise.all([
        app.prisma.pelada.count({ where }),
        app.prisma.pelada.findMany({
          where,
          orderBy: { criadoEm: 'desc' },
          skip: (pagina - 1) * porPagina,
          take: porPagina,
          include: {
            custosRecorrentes: {
              where: { ativo: true },
              select: { tipo: true, valorCentavos: true },
            },
          },
        }),
      ]);

      const itens = brutas.map(({ custosRecorrentes, ...p }) => {
        const cap = derivarCapacidade(p);
        return {
          ...p,
          ...cap,
          ...estimarPreco(custosRecorrentes, cap.totalJogadores),
        };
      });

      return { itens, total, pagina, porPagina };
    },
  );

  // ---- Detalhe por slug ou id (público se pelada.publica) ------------------
  typed.get(
    '/:idOrSlug',
    {
      schema: {
        params: z.object({ idOrSlug: z.string() }),
        response: {
          200: peladaSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const { idOrSlug } = req.params;
      const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
      const bruta = await app.prisma.pelada.findFirst({
        where: isUuid ? { id: idOrSlug } : { slug: idOrSlug },
        include: {
          custosRecorrentes: {
            where: { ativo: true },
            select: { tipo: true, valorCentavos: true },
          },
        },
      });
      if (!bruta) return reply.code(404).send({ mensagem: 'Pelada não encontrada' });
      const { custosRecorrentes, ...restoPelada } = bruta;
      const cap = derivarCapacidade(restoPelada);
      const pelada = {
        ...restoPelada,
        ...cap,
        ...estimarPreco(custosRecorrentes, cap.totalJogadores),
      };
      // Pelada privada só aparece para membros — por ora bloqueamos anônimos.
      if (!pelada.publica) {
        // Se não autenticado ou não membro, 404 (não vazar existência).
        try {
          await app.authenticate(req, reply);
        } catch {
          return reply.code(404).send({ mensagem: 'Pelada não encontrada' });
        }
        if (reply.sent) return;
        const userId = req.usuario?.id;
        const membro = userId
          ? await app.prisma.groupMember.findFirst({
              where: { peladaId: pelada.id, jogador: { userId } },
            })
          : null;
        const ehCriador = userId === pelada.criadoPorUserId;
        if (!membro && !ehCriador) {
          return reply.code(404).send({ mensagem: 'Pelada não encontrada' });
        }
      }
      return pelada;
    },
  );

  // ---- Criar (autenticado) -------------------------------------------------
  typed.post(
    '/',
    {
      onRequest: [app.authenticate],
      schema: {
        body: criarPeladaBodySchema,
        response: {
          201: peladaSchema,
          401: erroResponseSchema,
          409: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const userId = req.usuario!.id;
      const body = req.body;

      // O criador precisa ter Jogador para virar admin membro.
      const user = await app.prisma.user.findUnique({
        where: { id: userId },
        include: { jogador: { select: { id: true } } },
      });
      if (!user?.jogador) {
        return reply.code(422).send({ mensagem: 'Seu perfil ainda não tem jogador vinculado' });
      }

      // Local precisa existir
      const local = await app.prisma.local.findUnique({ where: { id: body.localId } });
      if (!local) {
        return reply.code(422).send({ mensagem: 'Local não encontrado' });
      }

      // Slug único
      const slugExiste = await app.prisma.pelada.findUnique({ where: { slug: body.slug } });
      if (slugExiste) {
        return reply.code(409).send({ mensagem: 'Já existe uma pelada com esse slug' });
      }

      const peladaId = gerarId();
      const pelada = await app.prisma.pelada.create({
        data: {
          id: peladaId,
          slug: body.slug,
          nome: body.nome.trim(),
          descricao: body.descricao?.trim() || null,
          modalidade: body.modalidade,
          localId: body.localId,
          diaSemana: body.diaSemana,
          horario: body.horario,
          quantidadeTimes: body.quantidadeTimes,
          jogadoresPorTime: body.jogadoresPorTime,
          goleirosPorTime: body.goleirosPorTime,
          tamanhoReserva: body.tamanhoReserva,
          goleirosPagam: body.goleirosPagam,
          limiteMembros: body.limiteMembros ?? null,
          publica: body.publica,
          abertaParaNovos: body.abertaParaNovos,
          aprovacaoObrigatoria: body.aprovacaoObrigatoria,
          criadoPorUserId: userId,
          membros: {
            create: {
              id: gerarId(),
              jogadorId: user.jogador.id,
              papel: 'admin',
            },
          },
        },
      });

      return reply.code(201).send({ ...pelada, ...derivarCapacidade(pelada) });
    },
  );

  // ---- Editar (admin) ------------------------------------------------------
  typed.put(
    '/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: editarPeladaBodySchema,
        response: {
          200: peladaSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const admin = await checarAdmin(app, req, reply, req.params.id);
      if (!admin) return;

      const body = req.body;
      const atualizado = await app.prisma.pelada.update({
        where: { id: req.params.id },
        data: {
          ...(body.nome !== undefined && { nome: body.nome.trim() }),
          ...(body.descricao !== undefined && { descricao: body.descricao?.trim() || null }),
          ...(body.modalidade !== undefined && { modalidade: body.modalidade }),
          ...(body.localId !== undefined && { localId: body.localId }),
          ...(body.diaSemana !== undefined && { diaSemana: body.diaSemana }),
          ...(body.horario !== undefined && { horario: body.horario }),
          ...(body.quantidadeTimes !== undefined && { quantidadeTimes: body.quantidadeTimes }),
          ...(body.jogadoresPorTime !== undefined && { jogadoresPorTime: body.jogadoresPorTime }),
          ...(body.goleirosPorTime !== undefined && { goleirosPorTime: body.goleirosPorTime }),
          ...(body.tamanhoReserva !== undefined && { tamanhoReserva: body.tamanhoReserva }),
          ...(body.goleirosPagam !== undefined && { goleirosPagam: body.goleirosPagam }),
          ...(body.limiteMembros !== undefined && { limiteMembros: body.limiteMembros }),
          ...(body.publica !== undefined && { publica: body.publica }),
          ...(body.abertaParaNovos !== undefined && { abertaParaNovos: body.abertaParaNovos }),
          ...(body.aprovacaoObrigatoria !== undefined && {
            aprovacaoObrigatoria: body.aprovacaoObrigatoria,
          }),
          ...(body.convidadosPagamCustos !== undefined && {
            convidadosPagamCustos: body.convidadosPagamCustos,
          }),
        },
      });
      return { ...atualizado, ...derivarCapacidade(atualizado) };
    },
  );

  // ---- Deletar (só criador) ------------------------------------------------
  typed.delete(
    '/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          204: z.null(),
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const userId = req.usuario!.id;
      const pelada = await app.prisma.pelada.findUnique({ where: { id: req.params.id } });
      if (!pelada) return reply.code(404).send({ mensagem: 'Pelada não encontrada' });
      if (pelada.criadoPorUserId !== userId) {
        return reply.code(403).send({ mensagem: 'Apenas o criador pode deletar a pelada' });
      }
      await app.prisma.pelada.delete({ where: { id: req.params.id } });
      return reply.code(204).send(null);
    },
  );

  // ---- Listar membros ------------------------------------------------------
  typed.get(
    '/:id/membros',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: listarMembrosResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const pelada = await app.prisma.pelada.findUnique({ where: { id: req.params.id } });
      if (!pelada) return reply.code(404).send({ mensagem: 'Pelada não encontrada' });

      const membros = await app.prisma.groupMember.findMany({
        where: { peladaId: pelada.id },
        include: {
          jogador: {
            select: {
              id: true,
              nome: true,
              apelido: true,
              avatarInicial: true,
              telefone: true,
              userId: true,
              funcaoPreferida: true,
              posicaoLinha: true,
            },
          },
        },
        orderBy: [{ papel: 'asc' }, { entrouEm: 'asc' }],
      });
      return { itens: membros, total: membros.length };
    },
  );

  // ---- Adicionar membro (admin) --------------------------------------------
  //
  // Dois modos:
  //  - modo=existente: linka um Jogador que já existe (jogadorId)
  //  - modo=novo:      cria um Jogador simples (nome + telefone opcional) sem User
  //                    → suporta o requisito do admin cadastrar jogadores menos
  //                       engajados sem forçá-los a criar conta
  //
  // Se `telefone` já pertencer a um Jogador com dono → 409.
  // Se `telefone` já pertencer a um Jogador órfão   → linka esse Jogador (evita duplicata).
  typed.post(
    '/:id/membros',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: adicionarMembroBodySchema,
        response: {
          201: membroSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          409: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const admin = await checarAdmin(app, req, reply, req.params.id);
      if (!admin) return;
      const peladaId = admin.id;
      const body = req.body;

      let jogadorId: string;

      if (body.modo === 'existente') {
        const jogador = await app.prisma.jogador.findUnique({ where: { id: body.jogadorId } });
        if (!jogador) return reply.code(422).send({ mensagem: 'Jogador não encontrado' });
        jogadorId = jogador.id;
      } else {
        // Modo "novo" — cadastro simples de jogador
        if (body.telefone) {
          const existente = await app.prisma.jogador.findUnique({
            where: { telefone: body.telefone },
          });
          if (existente) {
            // Se já tem dono, é a mesma pessoa com conta: só linka o Jogador existente.
            // Se é órfão, também linka (evita duplicata).
            jogadorId = existente.id;
          } else {
            const novo = await app.prisma.jogador.create({
              data: {
                id: gerarId(),
                nome: body.nome.trim(),
                avatarInicial: body.nome.trim()[0]!.toUpperCase(),
                telefone: body.telefone,
              },
            });
            jogadorId = novo.id;
          }
        } else {
          const novo = await app.prisma.jogador.create({
            data: {
              id: gerarId(),
              nome: body.nome.trim(),
              avatarInicial: body.nome.trim()[0]!.toUpperCase(),
            },
          });
          jogadorId = novo.id;
        }
      }

      // Verifica duplicata na pelada
      const jaMembro = await app.prisma.groupMember.findUnique({
        where: { peladaId_jogadorId: { peladaId, jogadorId } },
      });
      if (jaMembro) {
        return reply.code(409).send({ mensagem: 'Jogador já é membro desta pelada' });
      }

      // Limite de membros (se configurado)
      if (admin.limiteMembros !== null) {
        const total = await app.prisma.groupMember.count({ where: { peladaId } });
        if (total >= admin.limiteMembros) {
          return reply.code(409).send({ mensagem: 'Pelada atingiu o limite de membros' });
        }
      }

      const criado = await app.prisma.groupMember.create({
        data: {
          id: gerarId(),
          peladaId,
          jogadorId,
          papel: body.papel,
        },
        include: {
          jogador: {
            select: {
              id: true,
              nome: true,
              apelido: true,
              avatarInicial: true,
              telefone: true,
              userId: true,
              funcaoPreferida: true,
              posicaoLinha: true,
            },
          },
        },
      });
      return reply.code(201).send(criado);
    },
  );

  // ---- Remover membro (admin remove outros / próprio jogador se auto-sai) --
  typed.delete(
    '/:id/membros/:jogadorId',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({
          id: z.string().uuid(),
          jogadorId: z.string().uuid(),
        }),
        response: {
          204: z.null(),
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const userId = req.usuario!.id;
      const { id: peladaId, jogadorId } = req.params;

      const pelada = await app.prisma.pelada.findUnique({
        where: { id: peladaId },
        include: {
          membros: {
            where: { jogador: { userId } },
            select: { papel: true, jogadorId: true },
          },
        },
      });
      if (!pelada) return reply.code(404).send({ mensagem: 'Pelada não encontrada' });

      const meuMembro = pelada.membros[0];
      const ehCriador = pelada.criadoPorUserId === userId;
      const ehAdmin = ehCriador || meuMembro?.papel === 'admin';
      const removendoASiMesmo = meuMembro?.jogadorId === jogadorId;

      if (!ehAdmin && !removendoASiMesmo) {
        return reply.code(403).send({ mensagem: 'Sem permissão para remover este membro' });
      }
      // Criador não pode ser removido
      const alvo = await app.prisma.groupMember.findUnique({
        where: { peladaId_jogadorId: { peladaId, jogadorId } },
        include: { jogador: { select: { userId: true } } },
      });
      if (!alvo) return reply.code(404).send({ mensagem: 'Membro não encontrado' });
      if (alvo.jogador.userId === pelada.criadoPorUserId) {
        return reply.code(403).send({ mensagem: 'O criador da pelada não pode ser removido' });
      }

      await app.prisma.groupMember.delete({
        where: { peladaId_jogadorId: { peladaId, jogadorId } },
      });
      return reply.code(204).send(null);
    },
  );
}
