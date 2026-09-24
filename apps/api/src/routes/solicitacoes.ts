import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { gerarId } from '@peladafc/db';
import {
  candidaturaSchema,
  conviteSchema,
  convitePublicoDadosSchema,
  criarCandidaturaBodySchema,
  criarConviteBodySchema,
  entrarConvitePublicoResponseSchema,
  erroResponseSchema,
  linkConvitePublicoSchema,
  listarCandidaturasResponseSchema,
  listarConvitesResponseSchema,
} from '@peladafc/contracts';

// Token curto (12 chars base64url) — colisão improvável, cabe bem em WhatsApp.
function gerarTokenConvite() {
  return randomBytes(9).toString('base64url');
}

async function checarAdmin(
  app: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply,
  peladaId: string,
) {
  const userId = req.usuario!.id;
  const pelada = await app.prisma.pelada.findUnique({
    where: { id: peladaId },
    include: {
      membros: { where: { jogador: { userId } }, select: { papel: true } },
    },
  });
  if (!pelada) {
    reply.code(404).send({ mensagem: 'Pelada não encontrada' });
    return null;
  }
  const ehAdmin =
    pelada.criadoPorUserId === userId || pelada.membros.some((m) => m.papel === 'admin');
  if (!ehAdmin) {
    reply.code(403).send({ mensagem: 'Apenas donos da pelada' });
    return null;
  }
  return pelada;
}

export async function solicitacoesRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // ==== Candidaturas ========================================================

  // Usuário se candidata
  typed.post(
    '/peladas/:peladaId/candidaturas',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ peladaId: z.string().uuid() }),
        body: criarCandidaturaBodySchema,
        response: {
          201: candidaturaSchema,
          401: erroResponseSchema,
          404: erroResponseSchema,
          409: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const userId = req.usuario!.id;
      const pelada = await app.prisma.pelada.findUnique({
        where: { id: req.params.peladaId },
        include: { membros: { where: { jogador: { userId } } } },
      });
      if (!pelada) return reply.code(404).send({ mensagem: 'Pelada não encontrada' });
      if (!pelada.publica) return reply.code(422).send({ mensagem: 'Pelada privada' });
      if (!pelada.abertaParaNovos) {
        return reply.code(422).send({ mensagem: 'Pelada fechada para novos jogadores' });
      }
      if (pelada.membros.length > 0) {
        return reply.code(409).send({ mensagem: 'Você já é membro desta pelada' });
      }
      const jaAplicou = await app.prisma.groupApplication.findUnique({
        where: { peladaId_userId: { peladaId: pelada.id, userId } },
      });
      if (jaAplicou && jaAplicou.status === 'pendente') {
        return reply.code(409).send({ mensagem: 'Você já se candidatou a esta pelada' });
      }

      const dados = {
        peladaId: pelada.id,
        userId,
        mensagem: req.body.mensagem?.trim() || null,
        status: 'pendente' as const,
      };
      const criada = jaAplicou
        ? await app.prisma.groupApplication.update({
            where: { id: jaAplicou.id },
            data: dados,
            include: { user: { select: { id: true, nome: true, telefone: true, email: true } } },
          })
        : await app.prisma.groupApplication.create({
            data: { id: gerarId(), ...dados },
            include: { user: { select: { id: true, nome: true, telefone: true, email: true } } },
          });
      return reply.code(201).send(criada);
    },
  );

  // Admin lista candidaturas
  typed.get(
    '/peladas/:peladaId/candidaturas',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ peladaId: z.string().uuid() }),
        response: {
          200: listarCandidaturasResponseSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const pelada = await checarAdmin(app, req, reply, req.params.peladaId);
      if (!pelada) return;
      const itens = await app.prisma.groupApplication.findMany({
        where: { peladaId: pelada.id },
        include: { user: { select: { id: true, nome: true, telefone: true, email: true } } },
        orderBy: [{ status: 'asc' }, { criadoEm: 'desc' }],
      });
      return { itens, total: itens.length };
    },
  );

  // Admin aprova candidatura
  typed.post(
    '/candidaturas/:id/aprovar',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: candidaturaSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          409: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const app_ = await app.prisma.groupApplication.findUnique({
        where: { id: req.params.id },
        include: {
          user: {
            select: { id: true, nome: true, telefone: true, email: true, jogador: { select: { id: true } } },
          },
        },
      });
      if (!app_) return reply.code(404).send({ mensagem: 'Candidatura não encontrada' });
      if (app_.status !== 'pendente')
        return reply.code(409).send({ mensagem: 'Candidatura já processada' });

      const pelada = await checarAdmin(app, req, reply, app_.peladaId);
      if (!pelada) return;

      if (!app_.user.jogador) {
        return reply.code(409).send({ mensagem: 'Usuário sem jogador vinculado' });
      }

      // Cria membro e marca como aceito
      await app.prisma.$transaction([
        app.prisma.groupMember.upsert({
          where: {
            peladaId_jogadorId: { peladaId: app_.peladaId, jogadorId: app_.user.jogador.id },
          },
          create: {
            id: gerarId(),
            peladaId: app_.peladaId,
            jogadorId: app_.user.jogador.id,
            papel: 'membro',
          },
          update: {},
        }),
        app.prisma.groupApplication.update({
          where: { id: app_.id },
          data: { status: 'aceito', respondidoEm: new Date() },
        }),
      ]);
      const atualizada = await app.prisma.groupApplication.findUnique({
        where: { id: app_.id },
        include: { user: { select: { id: true, nome: true, telefone: true, email: true } } },
      });
      return atualizada!;
    },
  );

  // Admin recusa candidatura
  typed.post(
    '/candidaturas/:id/recusar',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: candidaturaSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          409: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const app_ = await app.prisma.groupApplication.findUnique({ where: { id: req.params.id } });
      if (!app_) return reply.code(404).send({ mensagem: 'Candidatura não encontrada' });
      if (app_.status !== 'pendente')
        return reply.code(409).send({ mensagem: 'Candidatura já processada' });
      const pelada = await checarAdmin(app, req, reply, app_.peladaId);
      if (!pelada) return;
      const atualizada = await app.prisma.groupApplication.update({
        where: { id: app_.id },
        data: { status: 'recusado', respondidoEm: new Date() },
        include: { user: { select: { id: true, nome: true, telefone: true, email: true } } },
      });
      return atualizada;
    },
  );

  // ==== Convites ============================================================

  // Admin convida jogador
  typed.post(
    '/peladas/:peladaId/convites',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ peladaId: z.string().uuid() }),
        body: criarConviteBodySchema,
        response: {
          201: conviteSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          409: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const pelada = await checarAdmin(app, req, reply, req.params.peladaId);
      if (!pelada) return;

      const jogador = await app.prisma.jogador.findUnique({ where: { id: req.body.jogadorId } });
      if (!jogador) return reply.code(422).send({ mensagem: 'Jogador não encontrado' });

      const jaMembro = await app.prisma.groupMember.findUnique({
        where: { peladaId_jogadorId: { peladaId: pelada.id, jogadorId: jogador.id } },
      });
      if (jaMembro) return reply.code(409).send({ mensagem: 'Jogador já é membro' });

      const pendente = await app.prisma.groupInvitation.findFirst({
        where: { peladaId: pelada.id, jogadorId: jogador.id, status: 'pendente' },
      });
      if (pendente) return reply.code(409).send({ mensagem: 'Já existe convite pendente' });

      const convite = await app.prisma.groupInvitation.create({
        data: {
          id: gerarId(),
          peladaId: pelada.id,
          jogadorId: jogador.id,
          criadoPorUserId: req.usuario!.id,
          expiraEm: req.body.expiraEm ?? null,
        },
        include: {
          jogador: { select: { id: true, nome: true, avatarInicial: true, userId: true } },
          pelada: { select: { id: true, slug: true, nome: true } },
        },
      });
      return reply.code(201).send(convite);
    },
  );

  // Lista convites recebidos pelo user logado
  typed.get(
    '/convites/meus',
    {
      onRequest: [app.authenticate],
      schema: {
        response: {
          200: listarConvitesResponseSchema,
          401: erroResponseSchema,
        },
      },
    },
    async (req) => {
      const userId = req.usuario!.id;
      const jogador = await app.prisma.jogador.findUnique({ where: { userId } });
      if (!jogador) return { itens: [], total: 0 };
      const itens = await app.prisma.groupInvitation.findMany({
        where: { jogadorId: jogador.id, status: 'pendente' },
        include: {
          jogador: { select: { id: true, nome: true, avatarInicial: true, userId: true } },
          pelada: { select: { id: true, slug: true, nome: true } },
        },
        orderBy: { criadoEm: 'desc' },
      });
      return { itens, total: itens.length };
    },
  );

  // Aceitar convite
  typed.post(
    '/convites/:id/aceitar',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: conviteSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          409: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const userId = req.usuario!.id;
      const convite = await app.prisma.groupInvitation.findUnique({
        where: { id: req.params.id },
        include: { jogador: true },
      });
      if (!convite) return reply.code(404).send({ mensagem: 'Convite não encontrado' });
      if (convite.jogador.userId !== userId) {
        return reply.code(403).send({ mensagem: 'Este convite não é seu' });
      }
      if (convite.status !== 'pendente') {
        return reply.code(409).send({ mensagem: 'Convite já processado' });
      }
      if (convite.expiraEm && convite.expiraEm < new Date()) {
        await app.prisma.groupInvitation.update({
          where: { id: convite.id },
          data: { status: 'expirado', respondidoEm: new Date() },
        });
        return reply.code(409).send({ mensagem: 'Convite expirado' });
      }

      await app.prisma.$transaction([
        app.prisma.groupMember.upsert({
          where: {
            peladaId_jogadorId: { peladaId: convite.peladaId, jogadorId: convite.jogadorId },
          },
          create: {
            id: gerarId(),
            peladaId: convite.peladaId,
            jogadorId: convite.jogadorId,
            papel: 'membro',
          },
          update: {},
        }),
        app.prisma.groupInvitation.update({
          where: { id: convite.id },
          data: { status: 'aceito', respondidoEm: new Date() },
        }),
      ]);
      const atualizado = await app.prisma.groupInvitation.findUnique({
        where: { id: convite.id },
        include: {
          jogador: { select: { id: true, nome: true, avatarInicial: true, userId: true } },
          pelada: { select: { id: true, slug: true, nome: true } },
        },
      });
      return atualizado!;
    },
  );

  // Recusar convite
  typed.post(
    '/convites/:id/recusar',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: conviteSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
          409: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const userId = req.usuario!.id;
      const convite = await app.prisma.groupInvitation.findUnique({
        where: { id: req.params.id },
        include: { jogador: true },
      });
      if (!convite) return reply.code(404).send({ mensagem: 'Convite não encontrado' });
      if (convite.jogador.userId !== userId) {
        return reply.code(403).send({ mensagem: 'Este convite não é seu' });
      }
      if (convite.status !== 'pendente') {
        return reply.code(409).send({ mensagem: 'Convite já processado' });
      }
      const atualizado = await app.prisma.groupInvitation.update({
        where: { id: convite.id },
        data: { status: 'recusado', respondidoEm: new Date() },
        include: {
          jogador: { select: { id: true, nome: true, avatarInicial: true, userId: true } },
          pelada: { select: { id: true, slug: true, nome: true } },
        },
      });
      return atualizado;
    },
  );

  // ==== Convite público por link (1 token por pelada, sem expiração) =========

  // Admin gera (ou obtém o já existente) link público.
  typed.post(
    '/peladas/:peladaId/link-convite',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ peladaId: z.string().uuid() }),
        response: {
          200: linkConvitePublicoSchema,
          401: erroResponseSchema,
          403: erroResponseSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const pelada = await checarAdmin(app, req, reply, req.params.peladaId);
      if (!pelada) return;
      if (pelada.tokenConvitePublico) {
        return { token: pelada.tokenConvitePublico };
      }
      const atualizada = await app.prisma.pelada.update({
        where: { id: pelada.id },
        data: { tokenConvitePublico: gerarTokenConvite() },
        select: { tokenConvitePublico: true },
      });
      return { token: atualizada.tokenConvitePublico! };
    },
  );

  // Landing page pública — dados suficientes pra decidir entrar.
  typed.get(
    '/convite-publico/:token',
    {
      schema: {
        params: z.object({ token: z.string().min(4) }),
        response: {
          200: convitePublicoDadosSchema,
          404: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const pelada = await app.prisma.pelada.findUnique({
        where: { tokenConvitePublico: req.params.token },
        include: {
          local: {
            select: { nome: true, bairro: true, cidadeNome: true, cidadeUf: true },
          },
          criadoPor: { select: { nome: true } },
          membros: {
            take: 8,
            orderBy: { entrouEm: 'asc' },
            include: { jogador: { select: { nome: true, avatarInicial: true } } },
          },
        },
      });
      if (!pelada) return reply.code(404).send({ mensagem: 'Convite não encontrado' });

      const totalMembros = await app.prisma.groupMember.count({
        where: { peladaId: pelada.id },
      });

      return {
        token: req.params.token,
        pelada: {
          id: pelada.id,
          slug: pelada.slug,
          nome: pelada.nome,
          descricao: pelada.descricao,
          modalidade: pelada.modalidade,
          diaSemana: pelada.diaSemana,
          horario: pelada.horario,
          totalJogadores: pelada.quantidadeTimes * pelada.jogadoresPorTime,
          aprovacaoObrigatoria: pelada.aprovacaoObrigatoria,
          abertaParaNovos: pelada.abertaParaNovos,
        },
        local: pelada.local,
        criadoPor: pelada.criadoPor,
        totalMembros,
        membrosPreview: pelada.membros.map((m) => ({
          nome: m.jogador.nome,
          avatarInicial: m.jogador.avatarInicial,
        })),
      };
    },
  );

  // Aceitar convite público — usuário logado entra. Se a pelada exige
  // aprovação, vira candidatura pendente; senão, entra direto como membro.
  typed.post(
    '/convite-publico/:token/entrar',
    {
      onRequest: [app.authenticate],
      schema: {
        params: z.object({ token: z.string().min(4) }),
        response: {
          200: entrarConvitePublicoResponseSchema,
          401: erroResponseSchema,
          404: erroResponseSchema,
          409: erroResponseSchema,
          422: erroResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const userId = req.usuario!.id;
      const pelada = await app.prisma.pelada.findUnique({
        where: { tokenConvitePublico: req.params.token },
      });
      if (!pelada) return reply.code(404).send({ mensagem: 'Convite não encontrado' });
      if (!pelada.abertaParaNovos) {
        return reply.code(422).send({ mensagem: 'Pelada fechada para novos jogadores' });
      }

      const user = await app.prisma.user.findUnique({
        where: { id: userId },
        include: { jogador: { select: { id: true } } },
      });
      if (!user?.jogador) {
        return reply.code(422).send({ mensagem: 'Seu perfil não tem jogador vinculado' });
      }

      const jaMembro = await app.prisma.groupMember.findUnique({
        where: {
          peladaId_jogadorId: { peladaId: pelada.id, jogadorId: user.jogador.id },
        },
      });
      if (jaMembro) {
        return { estado: 'ja_membro' as const, peladaSlug: pelada.slug };
      }

      if (pelada.aprovacaoObrigatoria) {
        const existente = await app.prisma.groupApplication.findUnique({
          where: { peladaId_userId: { peladaId: pelada.id, userId } },
        });
        if (existente?.status === 'pendente') {
          return { estado: 'ja_candidatura' as const, peladaSlug: pelada.slug };
        }
        const dados = {
          peladaId: pelada.id,
          userId,
          mensagem: null,
          status: 'pendente' as const,
        };
        if (existente) {
          await app.prisma.groupApplication.update({
            where: { id: existente.id },
            data: { ...dados, respondidoEm: null },
          });
        } else {
          await app.prisma.groupApplication.create({
            data: { id: gerarId(), ...dados },
          });
        }
        return { estado: 'candidatura' as const, peladaSlug: pelada.slug };
      }

      await app.prisma.groupMember.create({
        data: {
          id: gerarId(),
          peladaId: pelada.id,
          jogadorId: user.jogador.id,
          papel: 'membro',
        },
      });
      return { estado: 'membro' as const, peladaSlug: pelada.slug };
    },
  );
}
