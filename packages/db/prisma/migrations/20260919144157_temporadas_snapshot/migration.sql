-- Etapa 6: Temporadas — nome, encerradaEm, snapshot SeasonRanking.

ALTER TABLE "Temporada"
  ADD COLUMN "nome" TEXT,
  ADD COLUMN "encerradaEm" TIMESTAMP(3);

CREATE TABLE "SeasonRanking" (
  "id"           UUID PRIMARY KEY,
  "temporadaId"  UUID NOT NULL UNIQUE,
  "linhas"       JSONB NOT NULL,
  "congeladoEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SeasonRanking_temporadaId_fkey"
    FOREIGN KEY ("temporadaId") REFERENCES "Temporada"("id") ON DELETE CASCADE
);
