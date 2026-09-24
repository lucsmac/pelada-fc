-- Link público de convite por Pelada: 1 token único, sem expiração.
-- Gerado sob demanda pelo admin (nullable enquanto ninguém pediu).

ALTER TABLE "Pelada" ADD COLUMN "tokenConvitePublico" TEXT;

CREATE UNIQUE INDEX "Pelada_tokenConvitePublico_key"
  ON "Pelada" ("tokenConvitePublico");
