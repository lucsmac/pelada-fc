-- Adiciona coluna e FK para o autor de assistência em EventoPartida
-- (só faz sentido pra gols; null = gol sem assist).

ALTER TABLE "EventoPartida"
  ADD COLUMN "assistenteJogadorId" UUID;

CREATE INDEX "EventoPartida_assistenteJogadorId_idx"
  ON "EventoPartida" ("assistenteJogadorId");

ALTER TABLE "EventoPartida"
  ADD CONSTRAINT "EventoPartida_assistenteJogadorId_fkey"
  FOREIGN KEY ("assistenteJogadorId") REFERENCES "Jogador"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
