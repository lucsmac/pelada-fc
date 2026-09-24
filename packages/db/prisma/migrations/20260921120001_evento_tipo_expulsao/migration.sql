-- Adiciona 'expulsao' ao enum TipoEvento. Precisa ficar isolado numa migration
-- própria porque ALTER TYPE ADD VALUE não roda dentro de transação no Postgres
-- (a Prisma envolve cada migration em BEGIN/COMMIT).

ALTER TYPE "TipoEvento" ADD VALUE IF NOT EXISTS 'expulsao';
