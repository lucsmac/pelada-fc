-- Substitui totalJogadores/maxGoleiros por config estruturada de times.
-- Os campos antigos passam a ser derivados no server:
--   totalJogadores = quantidadeTimes × jogadoresPorTime
--   maxGoleiros    = quantidadeTimes × goleirosPorTime
-- E fica configurável quantos jogadores/goleiros por time e o tamanho da reserva.

ALTER TABLE "Pelada"
  DROP COLUMN "totalJogadores",
  DROP COLUMN "maxGoleiros",
  ADD COLUMN "quantidadeTimes"  INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "jogadoresPorTime" INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN "goleirosPorTime"  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "tamanhoReserva"   INTEGER NOT NULL DEFAULT 4;
