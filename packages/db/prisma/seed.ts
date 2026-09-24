import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { v7 as uuidv7 } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  // Seed idempotente — limpa dados de dev antes de inserir.
  // Ordem respeitando FKs (filhos → pais).
  await prisma.estatisticaPartida.deleteMany();
  await prisma.partida.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.pelada.updateMany({ data: { temporadaAtualId: null } });
  await prisma.temporada.deleteMany();
  await prisma.pelada.deleteMany();
  await prisma.local.deleteMany();
  await prisma.jogador.deleteMany();
  await prisma.user.deleteMany();

  const peladaId = uuidv7();
  const temporadaId = uuidv7();
  const localId = uuidv7();

  // Usuário completo (email + senha) com Jogador linkado.
  const userId = uuidv7();
  const jogadorLucasId = uuidv7();
  const senhaHash = await argon2.hash('peladafc123', { type: argon2.argon2id });

  await prisma.user.create({
    data: {
      id: userId,
      telefone: '84999990001',
      email: 'lucas@peladafc.dev',
      senhaHash,
      nome: 'Lucas',
      jogador: {
        create: {
          id: jogadorLucasId,
          nome: 'Lucas',
          apelido: 'Meia',
          avatarInicial: 'L',
          cidadeAtual: 'Natal',
          telefone: '84999990001',
        },
      },
    },
  });

  // Jogadores "simples" (sem conta) — representam participantes menos engajados.
  // Pedro tem telefone → serve para testar o fluxo de reivindicação no signup.
  const jogadoresSimples = [
    {
      id: uuidv7(),
      nome: 'João',
      apelido: null,
      avatarInicial: 'J',
      cidadeAtual: 'Natal',
      telefone: null,
    },
    {
      id: uuidv7(),
      nome: 'Pedro',
      apelido: null,
      avatarInicial: 'P',
      cidadeAtual: 'Natal',
      telefone: '84999990002',
    },
  ];
  await prisma.jogador.createMany({ data: jogadoresSimples });

  // Local (arena) criado pelo Lucas — hospeda a pelada abaixo.
  await prisma.local.create({
    data: {
      id: localId,
      nome: 'Arena Zona Sul',
      tipo: 'arena_society',
      cidadeNome: 'Natal',
      cidadeUf: 'RN',
      bairro: 'Zona Sul',
      superficies: ['grama_sintetica'],
      modalidadesSuportadas: ['fut7', 'society'],
      verificado: true,
      criadoPorUserId: userId,
    },
  });

  await prisma.pelada.create({
    data: {
      id: peladaId,
      slug: 'pelada-dos-amigos',
      nome: 'Pelada dos Amigos',
      descricao: 'Pelada semanal entre jogadores da região.',
      modalidade: 'fut7',
      localId,
      diaSemana: 'quinta',
      horario: '20:00',
      quantidadeTimes: 3,
      jogadoresPorTime: 6,
      goleirosPorTime: 1,
      tamanhoReserva: 4,
      abertaParaNovos: true,
      publica: true,
      aprovacaoObrigatoria: true,
      criadoPorUserId: userId,
    },
  });

  // Criador entra como admin; jogadores simples entram como membros.
  await prisma.groupMember.createMany({
    data: [
      { id: uuidv7(), peladaId, jogadorId: jogadorLucasId, papel: 'admin' },
      ...jogadoresSimples.map((j) => ({
        id: uuidv7(),
        peladaId,
        jogadorId: j.id,
        papel: 'membro' as const,
      })),
    ],
  });

  await prisma.temporada.create({
    data: {
      id: temporadaId,
      peladaId,
      ano: 2026,
      numero: 2,
      inicioEm: new Date('2026-04-01T00:00:00Z'),
    },
  });

  await prisma.pelada.update({
    where: { id: peladaId },
    data: { temporadaAtualId: temporadaId },
  });

  console.log('[seed] ok — pelada:', peladaId, 'temporada:', temporadaId);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
