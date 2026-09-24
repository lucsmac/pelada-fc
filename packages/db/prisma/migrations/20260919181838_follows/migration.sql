-- Etapa 11: PeladaFollow + JogadorFollow (seguir peladas e jogadores).

CREATE TABLE "PeladaFollow" (
  "id"       UUID PRIMARY KEY,
  "userId"   UUID NOT NULL,
  "peladaId" UUID NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PeladaFollow_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "PeladaFollow_peladaId_fkey"
    FOREIGN KEY ("peladaId") REFERENCES "Pelada"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "PeladaFollow_userId_peladaId_key"
  ON "PeladaFollow" ("userId", "peladaId");
CREATE INDEX "PeladaFollow_peladaId_idx" ON "PeladaFollow" ("peladaId");

CREATE TABLE "JogadorFollow" (
  "id"        UUID PRIMARY KEY,
  "userId"    UUID NOT NULL,
  "jogadorId" UUID NOT NULL,
  "criadoEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JogadorFollow_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "JogadorFollow_jogadorId_fkey"
    FOREIGN KEY ("jogadorId") REFERENCES "Jogador"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "JogadorFollow_userId_jogadorId_key"
  ON "JogadorFollow" ("userId", "jogadorId");
CREATE INDEX "JogadorFollow_jogadorId_idx" ON "JogadorFollow" ("jogadorId");
