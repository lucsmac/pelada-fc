-- Etapa 9: campos de privacidade e posição no Jogador.

ALTER TABLE "Jogador"
  ADD COLUMN "posicao"             TEXT,
  ADD COLUMN "perfilPublico"       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "mostrarEstatisticas" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "mostrarPeladas"      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "mostrarHistorico"    BOOLEAN NOT NULL DEFAULT true;
