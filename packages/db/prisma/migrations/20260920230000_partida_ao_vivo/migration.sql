-- Partida ao vivo — suporte a "pelada rápida" (standalone, sem Pelada/Temporada)
-- e a modo live (cronômetro, meta de gols, desempate, eventos por jogada).
--
-- Mudanças:
--  1. Novos enums ModoDesempate e TipoEvento.
--  2. Partida: peladaId/temporadaId viram opcionais; novos campos para modo
--     live (metaGols, cronômetro, desempate) + dono da partida standalone.
--  3. Nova tabela EventoPartida — fonte da verdade das jogadas (placar deriva
--     por count de eventos por time).

-- 1. Enums novos
CREATE TYPE "ModoDesempate" AS ENUM ('par_impar', 'penaltis', 'shootout', 'gol_de_ouro');
CREATE TYPE "TipoEvento"    AS ENUM ('gol', 'gol_contra', 'penalti_desempate');

-- 2. Partida: tornar peladaId/temporadaId nullable + novos campos
ALTER TABLE "Partida"
  ALTER COLUMN "peladaId"    DROP NOT NULL,
  ALTER COLUMN "temporadaId" DROP NOT NULL,
  ADD COLUMN  "criadoPorUserId"        UUID,
  ADD COLUMN  "nome"                   TEXT,
  ADD COLUMN  "metaGols"               INTEGER,
  ADD COLUMN  "duracaoMinutos"         INTEGER,
  ADD COLUMN  "iniciadoEm"             TIMESTAMP(3),
  ADD COLUMN  "finalizadoEm"           TIMESTAMP(3),
  ADD COLUMN  "pausadoEm"              TIMESTAMP(3),
  ADD COLUMN  "duracaoPausadaSegundos" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN  "modoDesempate"          "ModoDesempate",
  ADD COLUMN  "desempateVencedorTeamId" UUID;

-- Backfill de criadoPorUserId para partidas existentes (usa o criador da Pelada).
-- Mantém a coluna nullable — partidas sem Pelada e sem owner ficam admin-less
-- e são inacessíveis via nova autorização (só admin de Pelada continua controlando).
UPDATE "Partida" p
SET "criadoPorUserId" = pe."criadoPorUserId"
FROM "Pelada" pe
WHERE p."peladaId" = pe."id"
  AND p."criadoPorUserId" IS NULL;

-- FK para o novo dono da partida
ALTER TABLE "Partida"
  ADD CONSTRAINT "Partida_criadoPorUserId_fkey"
  FOREIGN KEY ("criadoPorUserId") REFERENCES "User"("id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

-- Índices auxiliares
CREATE INDEX "Partida_criadoPorUserId_idx" ON "Partida" ("criadoPorUserId");
CREATE INDEX "Partida_status_idx"          ON "Partida" ("status");

-- 3. EventoPartida — jogada pontual do modo live
CREATE TABLE "EventoPartida" (
  "id"              UUID         NOT NULL,
  "partidaId"       UUID         NOT NULL,
  "teamId"          UUID         NOT NULL,
  "jogadorId"       UUID,
  "tipo"            "TipoEvento" NOT NULL DEFAULT 'gol',
  "minutoJogo"      INTEGER      NOT NULL DEFAULT 0,
  "criadoEm"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "criadoPorUserId" UUID         NOT NULL,

  CONSTRAINT "EventoPartida_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventoPartida_partidaId_minutoJogo_idx"
  ON "EventoPartida" ("partidaId", "minutoJogo");
CREATE INDEX "EventoPartida_teamId_idx"    ON "EventoPartida" ("teamId");
CREATE INDEX "EventoPartida_jogadorId_idx" ON "EventoPartida" ("jogadorId");

ALTER TABLE "EventoPartida"
  ADD CONSTRAINT "EventoPartida_partidaId_fkey"
  FOREIGN KEY ("partidaId") REFERENCES "Partida"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventoPartida"
  ADD CONSTRAINT "EventoPartida_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventoPartida"
  ADD CONSTRAINT "EventoPartida_jogadorId_fkey"
  FOREIGN KEY ("jogadorId") REFERENCES "Jogador"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EventoPartida"
  ADD CONSTRAINT "EventoPartida_criadoPorUserId_fkey"
  FOREIGN KEY ("criadoPorUserId") REFERENCES "User"("id")
  ON DELETE NO ACTION ON UPDATE CASCADE;
