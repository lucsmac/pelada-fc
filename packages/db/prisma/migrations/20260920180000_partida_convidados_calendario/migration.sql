-- Convidados de partida: jogador chamado para uma partida específica sem
-- virar membro fixo da pelada.

CREATE TABLE "PartidaConvidado" (
  "id"                  UUID        NOT NULL,
  "partidaId"           UUID        NOT NULL,
  "jogadorId"           UUID        NOT NULL,
  "convidadoPorUserId"  UUID        NOT NULL,
  "criadoEm"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PartidaConvidado_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartidaConvidado_partidaId_jogadorId_key"
  ON "PartidaConvidado" ("partidaId", "jogadorId");

CREATE INDEX "PartidaConvidado_partidaId_idx" ON "PartidaConvidado" ("partidaId");
CREATE INDEX "PartidaConvidado_jogadorId_idx" ON "PartidaConvidado" ("jogadorId");

ALTER TABLE "PartidaConvidado"
  ADD CONSTRAINT "PartidaConvidado_partidaId_fkey"
  FOREIGN KEY ("partidaId") REFERENCES "Partida"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PartidaConvidado"
  ADD CONSTRAINT "PartidaConvidado_jogadorId_fkey"
  FOREIGN KEY ("jogadorId") REFERENCES "Jogador"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PartidaConvidado"
  ADD CONSTRAINT "PartidaConvidado_convidadoPorUserId_fkey"
  FOREIGN KEY ("convidadoPorUserId") REFERENCES "User"("id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

-- Nova flag de privacidade: mostrar calendário no perfil público.
ALTER TABLE "Jogador"
  ADD COLUMN "mostrarCalendarioPublico" BOOLEAN NOT NULL DEFAULT false;
