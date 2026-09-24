-- Etapa 2: expandir Modalidade, criar TipoLocal + Local, refatorar Pelada.
-- Nota (dev-only): esta migration limpa dados dependentes de Pelada porque
-- (a) o enum Modalidade muda de forma; (b) Pelada perde cidadeNome/uf/bairro
-- em favor de localId obrigatório. Seguro em dev — não há dados reais.

-- 0) Limpeza de dados de teste que dependem do schema antigo.
DELETE FROM "EstatisticaPartida";
DELETE FROM "Partida";
UPDATE "Pelada" SET "temporadaAtualId" = NULL;
DELETE FROM "Temporada";
DELETE FROM "Pelada";

-- 1) Expande enum Modalidade (renomeia + recria com valores novos).
ALTER TYPE "Modalidade" RENAME TO "Modalidade_old";

CREATE TYPE "Modalidade" AS ENUM (
  'fut7',
  'campo_7',
  'campo_11',
  'society',
  'futsal',
  'beach_soccer',
  'futevolei'
);

-- Coluna vazia (peladas foram removidas acima), CAST direto funciona.
ALTER TABLE "Pelada"
  ALTER COLUMN "modalidade" TYPE "Modalidade"
  USING ("modalidade"::text::"Modalidade");

DROP TYPE "Modalidade_old";

-- 2) Novos enums TipoLocal e Superficie.
CREATE TYPE "TipoLocal" AS ENUM (
  'arena_society',
  'campo_futebol_11',
  'campo_futebol_7',
  'campo_areia',
  'quadra_coberta',
  'quadra_aberta'
);

CREATE TYPE "Superficie" AS ENUM (
  'grama_sintetica',
  'grama_natural',
  'areia',
  'piso'
);

-- 3) Tabela Local.
CREATE TABLE "Local" (
  "id" UUID PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "tipo" "TipoLocal" NOT NULL,
  "cidadeNome" TEXT NOT NULL,
  "cidadeUf" CHAR(2) NOT NULL,
  "bairro" TEXT,
  "endereco" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "superficies" "Superficie"[] NOT NULL DEFAULT ARRAY[]::"Superficie"[],
  "modalidadesSuportadas" "Modalidade"[] NOT NULL DEFAULT ARRAY[]::"Modalidade"[],
  "verificado" BOOLEAN NOT NULL DEFAULT false,
  "criadoPorUserId" UUID NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Local_criadoPorUserId_fkey"
    FOREIGN KEY ("criadoPorUserId") REFERENCES "User"("id")
);

CREATE INDEX "Local_cidadeNome_cidadeUf_idx" ON "Local" ("cidadeNome", "cidadeUf");
CREATE INDEX "Local_tipo_idx" ON "Local" ("tipo");
CREATE INDEX "Local_criadoPorUserId_idx" ON "Local" ("criadoPorUserId");

-- 4) Refactor Pelada: remove cidade/bairro soltos, adiciona localId FK.
DROP INDEX IF EXISTS "Pelada_cidadeNome_cidadeUf_idx";
ALTER TABLE "Pelada" DROP COLUMN "cidadeNome";
ALTER TABLE "Pelada" DROP COLUMN "cidadeUf";
ALTER TABLE "Pelada" DROP COLUMN "bairro";

ALTER TABLE "Pelada" ADD COLUMN "localId" UUID NOT NULL;
ALTER TABLE "Pelada"
  ADD CONSTRAINT "Pelada_localId_fkey"
  FOREIGN KEY ("localId") REFERENCES "Local"("id");

CREATE INDEX "Pelada_localId_idx" ON "Pelada" ("localId");
