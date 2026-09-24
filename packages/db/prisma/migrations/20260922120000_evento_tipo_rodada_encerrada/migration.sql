-- Adiciona 'rodada_encerrada' ao enum TipoEvento. Isolado numa migration
-- própria porque ALTER TYPE ADD VALUE não roda dentro de transação no Postgres.

ALTER TYPE "TipoEvento" ADD VALUE IF NOT EXISTS 'rodada_encerrada';
