-- Etapa 4: Partidas — Attendance, Team, TeamPlayer + enum de status.

CREATE TYPE "StatusPresenca" AS ENUM ('confirmado', 'recusado', 'lista_espera');
CREATE TYPE "StatusPartida" AS ENUM ('agendada', 'em_andamento', 'finalizada', 'cancelada');

ALTER TABLE "Partida"
  ADD COLUMN "status"   "StatusPartida" NOT NULL DEFAULT 'agendada',
  ADD COLUMN "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "Attendance" (
  "id"           UUID PRIMARY KEY,
  "partidaId"    UUID NOT NULL,
  "jogadorId"    UUID NOT NULL,
  "status"       "StatusPresenca" NOT NULL DEFAULT 'confirmado',
  "respondidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Attendance_partidaId_fkey"
    FOREIGN KEY ("partidaId") REFERENCES "Partida"("id") ON DELETE CASCADE,
  CONSTRAINT "Attendance_jogadorId_fkey"
    FOREIGN KEY ("jogadorId") REFERENCES "Jogador"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "Attendance_partidaId_jogadorId_key"
  ON "Attendance" ("partidaId", "jogadorId");
CREATE INDEX "Attendance_partidaId_idx" ON "Attendance" ("partidaId");
CREATE INDEX "Attendance_jogadorId_idx" ON "Attendance" ("jogadorId");

CREATE TABLE "Team" (
  "id"        UUID PRIMARY KEY,
  "partidaId" UUID NOT NULL,
  "nome"      TEXT NOT NULL,
  "cor"       TEXT,
  CONSTRAINT "Team_partidaId_fkey"
    FOREIGN KEY ("partidaId") REFERENCES "Partida"("id") ON DELETE CASCADE
);

CREATE INDEX "Team_partidaId_idx" ON "Team" ("partidaId");

CREATE TABLE "TeamPlayer" (
  "id"        UUID PRIMARY KEY,
  "teamId"    UUID NOT NULL,
  "jogadorId" UUID NOT NULL,
  CONSTRAINT "TeamPlayer_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE,
  CONSTRAINT "TeamPlayer_jogadorId_fkey"
    FOREIGN KEY ("jogadorId") REFERENCES "Jogador"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "TeamPlayer_teamId_jogadorId_key"
  ON "TeamPlayer" ("teamId", "jogadorId");
CREATE INDEX "TeamPlayer_teamId_idx" ON "TeamPlayer" ("teamId");
CREATE INDEX "TeamPlayer_jogadorId_idx" ON "TeamPlayer" ("jogadorId");
