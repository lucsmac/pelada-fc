-- Etapa 8: GroupApplication + GroupInvitation.

CREATE TYPE "StatusSolicitacao" AS ENUM (
  'pendente', 'aceito', 'recusado', 'cancelado', 'expirado'
);

CREATE TABLE "GroupApplication" (
  "id"           UUID PRIMARY KEY,
  "peladaId"     UUID NOT NULL,
  "userId"       UUID NOT NULL,
  "mensagem"     TEXT,
  "status"       "StatusSolicitacao" NOT NULL DEFAULT 'pendente',
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondidoEm" TIMESTAMP(3),
  CONSTRAINT "GroupApplication_peladaId_fkey"
    FOREIGN KEY ("peladaId") REFERENCES "Pelada"("id") ON DELETE CASCADE,
  CONSTRAINT "GroupApplication_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "GroupApplication_peladaId_userId_key"
  ON "GroupApplication" ("peladaId", "userId");
CREATE INDEX "GroupApplication_peladaId_status_idx"
  ON "GroupApplication" ("peladaId", "status");
CREATE INDEX "GroupApplication_userId_status_idx"
  ON "GroupApplication" ("userId", "status");

CREATE TABLE "GroupInvitation" (
  "id"              UUID PRIMARY KEY,
  "peladaId"        UUID NOT NULL,
  "jogadorId"       UUID NOT NULL,
  "criadoPorUserId" UUID NOT NULL,
  "status"          "StatusSolicitacao" NOT NULL DEFAULT 'pendente',
  "expiraEm"        TIMESTAMP(3),
  "criadoEm"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondidoEm"    TIMESTAMP(3),
  CONSTRAINT "GroupInvitation_peladaId_fkey"
    FOREIGN KEY ("peladaId") REFERENCES "Pelada"("id") ON DELETE CASCADE,
  CONSTRAINT "GroupInvitation_jogadorId_fkey"
    FOREIGN KEY ("jogadorId") REFERENCES "Jogador"("id") ON DELETE CASCADE,
  CONSTRAINT "GroupInvitation_criadoPorUserId_fkey"
    FOREIGN KEY ("criadoPorUserId") REFERENCES "User"("id")
);

CREATE UNIQUE INDEX "GroupInvitation_peladaId_jogadorId_status_key"
  ON "GroupInvitation" ("peladaId", "jogadorId", "status");
CREATE INDEX "GroupInvitation_peladaId_status_idx"
  ON "GroupInvitation" ("peladaId", "status");
CREATE INDEX "GroupInvitation_jogadorId_status_idx"
  ON "GroupInvitation" ("jogadorId", "status");
