-- Adiciona função (goleiro | linha) e posição preferida ao Attendance,
-- e configuração maxGoleiros na Pelada. Reserva (lista_espera) já existia
-- em StatusPresenca — passa a ser preenchida automaticamente quando a
-- capacidade da função escolhida se esgota.

CREATE TYPE "FuncaoPartida" AS ENUM ('goleiro', 'linha');

CREATE TYPE "PosicaoLinha" AS ENUM (
  'zagueiro',
  'lateral',
  'volante',
  'meia',
  'atacante'
);

ALTER TABLE "Pelada"
  ADD COLUMN "maxGoleiros" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Attendance"
  ADD COLUMN "funcao"       "FuncaoPartida" NOT NULL DEFAULT 'linha',
  ADD COLUMN "posicaoLinha" "PosicaoLinha";
