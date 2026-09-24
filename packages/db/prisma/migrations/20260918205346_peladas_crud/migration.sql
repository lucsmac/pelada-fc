-- Etapa 3: Peladas CRUD — GroupMember, papéis, criador, regras de entrada.

-- 1) Enum PapelMembro
CREATE TYPE "PapelMembro" AS ENUM ('admin', 'membro');

-- 2) Novos campos em Pelada
ALTER TABLE "Pelada"
  ADD COLUMN "descricao" TEXT,
  ADD COLUMN "limiteMembros" INTEGER,
  ADD COLUMN "aprovacaoObrigatoria" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "criadoPorUserId" UUID;

-- (Como a migration anterior limpou peladas, não há linhas — mesmo assim, dev-safe.)
-- Faz criadoPorUserId NOT NULL após backfill hipotético.
-- Neste dev, apenas garante NOT NULL:
ALTER TABLE "Pelada" ALTER COLUMN "criadoPorUserId" SET NOT NULL;

ALTER TABLE "Pelada"
  ADD CONSTRAINT "Pelada_criadoPorUserId_fkey"
  FOREIGN KEY ("criadoPorUserId") REFERENCES "User"("id");

CREATE INDEX "Pelada_criadoPorUserId_idx" ON "Pelada" ("criadoPorUserId");

-- 3) Tabela GroupMember
CREATE TABLE "GroupMember" (
  "id"        UUID PRIMARY KEY,
  "peladaId"  UUID NOT NULL,
  "jogadorId" UUID NOT NULL,
  "papel"     "PapelMembro" NOT NULL DEFAULT 'membro',
  "entrouEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupMember_peladaId_fkey"
    FOREIGN KEY ("peladaId") REFERENCES "Pelada"("id") ON DELETE CASCADE,
  CONSTRAINT "GroupMember_jogadorId_fkey"
    FOREIGN KEY ("jogadorId") REFERENCES "Jogador"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "GroupMember_peladaId_jogadorId_key" ON "GroupMember" ("peladaId", "jogadorId");
CREATE INDEX "GroupMember_peladaId_idx" ON "GroupMember" ("peladaId");
CREATE INDEX "GroupMember_jogadorId_idx" ON "GroupMember" ("jogadorId");
