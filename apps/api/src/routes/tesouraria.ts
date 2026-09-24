import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { gerarId } from '@peladafc/db';
import { calcularTesourariaPartida } from '@peladafc/domain';
import {
  atualizarCustoPartidaBodySchema,
  atualizarCustoRecorrenteBodySchema,
  criarCustoPartidaBodySchema,
  criarCustoRecorrenteBodySchema,
  custoPartidaSchema,
  custoRecorrenteSchema,
  erroResponseSchema,
  listarCustosRecorrentesResponseSchema,
  marcarPagamentoBodySchema,
  pagamentoPartidaSchema,
  tesourariaPartidaResponseSchema,
  type LinhaDevedorDTO,
  type TesourariaPartidaResponse,
} from '@peladafc/contracts';

// ---------------------------------------------------------------------------
// Helpers de autorização
//
// Duplicamos os helpers de peladas.ts / partidas.ts para manter o arquivo
// autossuficiente. Se aparecer um terceiro consumidor, extrai pra um módulo
// comum — por enquanto, dois usos é barulho aceitável.

async function checarAdminPelada(
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
  const ehAdmin = ehCriador || pelada.membros.some((m) => m.papel === 'admin');
  if (!ehAdmin) {
    reply.code(403).send({ mensagem: 'Apenas administradores podem realizar esta ação' });
    return null;
  }
  return pelada;
}

async function checarAdminPartida(
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
  if (!partida.pelada) {
    reply.code(400).send({ mensagem: 'Tesouraria não se aplica a partidas standalone' });
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

// ---------------------------------------------------------------------------
// Monta o payload de tesouraria de uma partida. Reutilizado no GET e depois
// de mutações (POST custo, POST/DELETE pagamento) pra devolver estado atual.

async function montarTesouraria(
  app: FastifyInstance,
  partidaId: string,
): Promise<TesourariaPartidaResponse | null> {
  const partida = await app.prisma.partida.findUnique({
    where: { id: partidaId },
    select: {
      peladaId: true,
      pelada: {
        select: {
          convidadosPagamCustos: true,
          quantidadeTimes: true,
          jogadoresPorTime: true,
          goleirosPorTime: true,
          goleirosPagam: true,
        },
      },
    },
  });
  if (!partida) return null;
  // Tesouraria só se aplica a partidas com pelada — standalone não tem custos.
  if (!partida.pelada || partida.peladaId == null) return null;
  const peladaConfig = partida.pelada;
  const peladaId = partida.peladaId;

  const [custosRecorrentes, custosPartida, presencas, convidados, pagamentos, membros] =
    await Promise.all([
      app.prisma.custoRecorrente.findMany({
        where: { peladaId, ativo: true },
        orderBy: { criadoEm: 'asc' },
      }),
      app.prisma.custoPartida.findMany({
        where: { partidaId },
        orderBy: { criadoEm: 'asc' },
      }),
      app.prisma.attendance.findMany({
        where: { partidaId, status: 'confirmado' },
        include: {
          jogador: {
            select: { id: true, nome: true, avatarInicial: true, userId: true },
          },
        },
      }),
      app.prisma.partidaConvidado.findMany({
        where: { partidaId },
        select: { jogadorId: true },
      }),
      app.prisma.pagamentoPartida.findMany({ where: { partidaId } }),
      app.prisma.groupMember.findMany({
        where: { peladaId },
        select: { jogadorId: true },
      }),
    ]);

  const idsConvidados = new Set(convidados.map((c) => c.jogadorId));
  const idsMembros = new Set(membros.map((m) => m.jogadorId));

  // Divisores = confirmados que pagam. Membros sempre pagam; convidados só se
  // a pelada estiver configurada pra cobrar deles. Se `goleirosPagam=false`,
  // goleiros ficam de fora (comum: quem tá no gol não paga).
  const confirmadosQuePagam = presencas.filter((p) => {
    if (p.funcao === 'goleiro' && !peladaConfig.goleirosPagam) return false;
    if (idsMembros.has(p.jogadorId)) return true;
    if (idsConvidados.has(p.jogadorId) && peladaConfig.convidadosPagamCustos) return true;
    return false;
  });

  const custosTodos = [
    ...custosRecorrentes.map((c) => ({ tipo: c.tipo, valorCentavos: c.valorCentavos })),
    ...custosPartida.map((c) => ({ tipo: c.tipo, valorCentavos: c.valorCentavos })),
  ];
  // Estimativa também considera se goleiros pagam ou não.
  const linhaPorTime = Math.max(
    0,
    peladaConfig.jogadoresPorTime - peladaConfig.goleirosPorTime,
  );
  const estimativaDivisores = peladaConfig.goleirosPagam
    ? peladaConfig.quantidadeTimes * peladaConfig.jogadoresPorTime
    : peladaConfig.quantidadeTimes * linhaPorTime;
  const resumo = calcularTesourariaPartida(
    custosTodos,
    confirmadosQuePagam.length,
    estimativaDivisores,
  );

  const mapaPagamentos = new Map(pagamentos.map((p) => [p.jogadorId, p]));

  const devedores: LinhaDevedorDTO[] = confirmadosQuePagam.map((p) => {
    const pagamento = mapaPagamentos.get(p.jogadorId) ?? null;
    return {
      jogador: p.jogador,
      origem: idsMembros.has(p.jogadorId) ? 'membro' : 'convidado',
      valorDevidoCentavos: resumo.valorPorJogadorCentavos,
      pago: pagamento !== null,
      pagamento,
    };
  });

  return {
    convidadosPagamCustos: peladaConfig.convidadosPagamCustos,
    custosRecorrentes,
    custosPartida,
    resumo,
    devedores,
  };
}

// ---------------------------------------------------------------------------

export async function tesourariaRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ---- Listar custos recorrentes da pelada -------------------------------
  typed.get(
    '/peladas/:peladaId/custos-recorrentes',
    {
      schema: {
        params: z.object({ peladaId: z.string().uuid() }),
        response: {
          200: listarCustosRecorrentesResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const pelada = await app.prisma.pelada.findUnique({
        where: { id: req.params.peladaId },
        select: { id: true },
      });
      if (!pelada) return reply.code(404).send({ mensagem: 'Pelada não encontrada' });
      const itens = await app.prisma.custoRecorrente.findMany({
        where: { peladaId: pelada.id },
        orderBy: { criadoEm: 'asc' },
      });
      return { itens };
    },
  );

  // ---- Criar custo recorrente (admin) ------------------------------------
  typed.post(
    '/peladas/:peladaId/custos-recorrentes',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ peladaId: z.string().uuid() }),
        body: criarCustoRecorrenteBodySchema,
        response: {
          201: custoRecorrenteSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const pelada = await checarAdminPelada(app, req, reply, req.params.peladaId);
      if (!pelada) return;
      const criado = await app.prisma.custoRecorrente.create({
        data: {
          id: gerarId(),
          peladaId: pelada.id,
          nome: req.body.nome.trim(),
          tipo: req.body.tipo,
          valorCentavos: req.body.valorCentavos,
          ativo: req.body.ativo,
        },
      });
      return reply.code(201).send(criado);
    },
  );

  // ---- Atualizar custo recorrente (admin) --------------------------------
  typed.patch(
    '/custos-recorrentes/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: atualizarCustoRecorrenteBodySchema,
        response: {
          200: custoRecorrenteSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const existente = await app.prisma.custoRecorrente.findUnique({
        where: { id: req.params.id },
      });
      if (!existente) return reply.code(404).send({ mensagem: 'Custo não encontrado' });
      const pelada = await checarAdminPelada(app, req, reply, existente.peladaId);
      if (!pelada) return;
      const atualizado = await app.prisma.custoRecorrente.update({
        where: { id: existente.id },
        data: {
          ...(req.body.nome !== undefined && { nome: req.body.nome.trim() }),
          ...(req.body.tipo !== undefined && { tipo: req.body.tipo }),
          ...(req.body.valorCentavos !== undefined && { valorCentavos: req.body.valorCentavos }),
          ...(req.body.ativo !== undefined && { ativo: req.body.ativo }),
        },
      });
      return atualizado;
    },
  );

  // ---- Deletar custo recorrente (admin) ----------------------------------
  typed.delete(
    '/custos-recorrentes/:id',
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
      const existente = await app.prisma.custoRecorrente.findUnique({
        where: { id: req.params.id },
      });
      if (!existente) return reply.code(404).send({ mensagem: 'Custo não encontrado' });
      const pelada = await checarAdminPelada(app, req, reply, existente.peladaId);
      if (!pelada) return;
      await app.prisma.custoRecorrente.delete({ where: { id: existente.id } });
      return reply.code(204).send(null);
    },
  );

  // ---- Tesouraria da partida (leitura) -----------------------------------
  typed.get(
    '/partidas/:id/tesouraria',
    {
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: tesourariaPartidaResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const payload = await montarTesouraria(app, req.params.id);
      if (!payload) return reply.code(404).send({ mensagem: 'Partida não encontrada' });
      return payload;
    },
  );

  // ---- Criar custo avulso da partida (admin) -----------------------------
  typed.post(
    '/partidas/:id/custos',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: criarCustoPartidaBodySchema,
        response: {
          201: custoPartidaSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const partida = await checarAdminPartida(app, req, reply, req.params.id);
      if (!partida) return;
      const criado = await app.prisma.custoPartida.create({
        data: {
          id: gerarId(),
          partidaId: partida.id,
          nome: req.body.nome.trim(),
          tipo: req.body.tipo,
          valorCentavos: req.body.valorCentavos,
          criadoPorUserId: req.usuario!.id,
        },
      });
      return reply.code(201).send(criado);
    },
  );

  // ---- Atualizar custo avulso (admin) ------------------------------------
  typed.patch(
    '/custos-partida/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: atualizarCustoPartidaBodySchema,
        response: {
          200: custoPartidaSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const existente = await app.prisma.custoPartida.findUnique({
        where: { id: req.params.id },
      });
      if (!existente) return reply.code(404).send({ mensagem: 'Custo não encontrado' });
      const partida = await checarAdminPartida(app, req, reply, existente.partidaId);
      if (!partida) return;
      const atualizado = await app.prisma.custoPartida.update({
        where: { id: existente.id },
        data: {
          ...(req.body.nome !== undefined && { nome: req.body.nome.trim() }),
          ...(req.body.tipo !== undefined && { tipo: req.body.tipo }),
          ...(req.body.valorCentavos !== undefined && { valorCentavos: req.body.valorCentavos }),
        },
      });
      return atualizado;
    },
  );

  // ---- Deletar custo avulso (admin) --------------------------------------
  typed.delete(
    '/custos-partida/:id',
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
      const existente = await app.prisma.custoPartida.findUnique({
        where: { id: req.params.id },
      });
      if (!existente) return reply.code(404).send({ mensagem: 'Custo não encontrado' });
      const partida = await checarAdminPartida(app, req, reply, existente.partidaId);
      if (!partida) return;
      await app.prisma.custoPartida.delete({ where: { id: existente.id } });
      return reply.code(204).send(null);
    },
  );

  // ---- Marcar pagamento (admin) ------------------------------------------
  // Se `valorCentavos` for omitido, usa o valor calculado no momento.
  typed.post(
    '/partidas/:id/pagamentos',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: marcarPagamentoBodySchema,
        response: {
          201: pagamentoPartidaSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const partida = await checarAdminPartida(app, req, reply, req.params.id);
      if (!partida) return;

      let valorCentavos = req.body.valorCentavos;
      if (valorCentavos === undefined) {
        const tesouraria = await montarTesouraria(app, partida.id);
        if (!tesouraria) return reply.code(404).send({ mensagem: 'Partida não encontrada' });
        const linha = tesouraria.devedores.find((d) => d.jogador.id === req.body.jogadorId);
        if (!linha) {
          return reply.code(422).send({
            mensagem: 'Jogador não está entre os confirmados que pagam',
          });
        }
        valorCentavos = linha.valorDevidoCentavos;
      }

      const pago = await app.prisma.pagamentoPartida.upsert({
        where: { partidaId_jogadorId: { partidaId: partida.id, jogadorId: req.body.jogadorId } },
        create: {
          id: gerarId(),
          partidaId: partida.id,
          jogadorId: req.body.jogadorId,
          valorCentavos,
          marcadoPorUserId: req.usuario!.id,
        },
        update: {
          valorCentavos,
          marcadoPorUserId: req.usuario!.id,
          pagoEm: new Date(),
        },
      });
      return reply.code(201).send(pago);
    },
  );

  // ---- Desmarcar pagamento (admin) ---------------------------------------
  typed.delete(
    '/partidas/:id/pagamentos/:jogadorId',
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
      const partida = await checarAdminPartida(app, req, reply, req.params.id);
      if (!partida) return;
      const apagado = await app.prisma.pagamentoPartida
        .delete({
          where: {
            partidaId_jogadorId: {
              partidaId: partida.id,
              jogadorId: req.params.jogadorId,
            },
          },
        })
        .catch(() => null);
      if (!apagado) return reply.code(404).send({ mensagem: 'Pagamento não encontrado' });
      return reply.code(204).send(null);
    },
  );
}
