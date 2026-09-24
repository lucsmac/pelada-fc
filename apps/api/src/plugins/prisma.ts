import fp from 'fastify-plugin';
import { prisma } from '@peladafc/db';
import type { PrismaClient } from '@peladafc/db';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export const prismaPlugin = fp(async (app) => {
  app.decorate('prisma', prisma);
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
});
