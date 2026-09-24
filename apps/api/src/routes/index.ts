import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.js';
import { cidadesRoutes } from './cidades.js';
import { followsRoutes } from './follows.js';
import { jogadoresRoutes } from './jogadores.js';
import { locaisRoutes } from './locais.js';
import { meRoutes } from './me.js';
import { partidasRoutes } from './partidas.js';
import { peladasRoutes } from './peladas.js';
import { rankingsRoutes, rankingsPorPeladaRoutes } from './rankings.js';
import { solicitacoesRoutes } from './solicitacoes.js';
import { temporadasRoutes } from './temporadas.js';
import { tesourariaRoutes } from './tesouraria.js';

export async function registerRoutes(app: FastifyInstance) {
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(cidadesRoutes, { prefix: '/cidades' });
  await app.register(jogadoresRoutes, { prefix: '/jogadores' });
  await app.register(locaisRoutes, { prefix: '/locais' });
  await app.register(peladasRoutes, { prefix: '/peladas' });
  await app.register(meRoutes, { prefix: '/me' });
  await app.register(partidasRoutes);
  await app.register(temporadasRoutes);
  await app.register(solicitacoesRoutes);
  await app.register(followsRoutes);
  await app.register(rankingsRoutes, { prefix: '/rankings' });
  await app.register(rankingsPorPeladaRoutes);
  await app.register(tesourariaRoutes);
}
