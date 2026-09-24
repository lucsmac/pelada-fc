-- Adiciona 'substituicao' ao enum TipoEvento. Isolado numa migration própria
-- porque ALTER TYPE ADD VALUE não roda dentro de transação no Postgres.

ALTER TYPE "TipoEvento" ADD VALUE IF NOT EXISTS 'substituicao';
