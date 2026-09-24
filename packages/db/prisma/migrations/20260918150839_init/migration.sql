-- CreateEnum
CREATE TYPE "Modalidade" AS ENUM ('fut7', 'society', 'futsal', 'campo');

-- CreateEnum
CREATE TYPE "DiaSemana" AS ENUM ('domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado');

-- CreateTable
CREATE TABLE "Pelada" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "modalidade" "Modalidade" NOT NULL,
    "cidadeNome" TEXT NOT NULL,
    "cidadeUf" CHAR(2) NOT NULL,
    "bairro" TEXT NOT NULL,
    "diaSemana" "DiaSemana" NOT NULL,
    "horario" TEXT NOT NULL,
    "totalJogadores" INTEGER NOT NULL,
    "abertaParaNovos" BOOLEAN NOT NULL DEFAULT true,
    "publica" BOOLEAN NOT NULL DEFAULT false,
    "temporadaAtualId" UUID,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pelada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Jogador" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "apelido" TEXT,
    "avatarInicial" CHAR(1) NOT NULL,
    "cidadeAtual" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Jogador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Temporada" (
    "id" UUID NOT NULL,
    "peladaId" UUID NOT NULL,
    "ano" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "inicioEm" TIMESTAMP(3) NOT NULL,
    "fimEm" TIMESTAMP(3),

    CONSTRAINT "Temporada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partida" (
    "id" UUID NOT NULL,
    "peladaId" UUID NOT NULL,
    "temporadaId" UUID NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "placarTimeA" INTEGER NOT NULL DEFAULT 0,
    "placarTimeB" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Partida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstatisticaPartida" (
    "id" UUID NOT NULL,
    "partidaId" UUID NOT NULL,
    "jogadorId" UUID NOT NULL,
    "gols" INTEGER NOT NULL DEFAULT 0,
    "assistencias" INTEGER NOT NULL DEFAULT 0,
    "foiMvp" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "EstatisticaPartida_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pelada_slug_key" ON "Pelada"("slug");

-- CreateIndex
CREATE INDEX "Pelada_cidadeNome_cidadeUf_idx" ON "Pelada"("cidadeNome", "cidadeUf");

-- CreateIndex
CREATE INDEX "Pelada_publica_abertaParaNovos_idx" ON "Pelada"("publica", "abertaParaNovos");

-- CreateIndex
CREATE INDEX "Temporada_peladaId_idx" ON "Temporada"("peladaId");

-- CreateIndex
CREATE UNIQUE INDEX "Temporada_peladaId_ano_numero_key" ON "Temporada"("peladaId", "ano", "numero");

-- CreateIndex
CREATE INDEX "Partida_peladaId_data_idx" ON "Partida"("peladaId", "data");

-- CreateIndex
CREATE INDEX "Partida_temporadaId_idx" ON "Partida"("temporadaId");

-- CreateIndex
CREATE INDEX "EstatisticaPartida_jogadorId_idx" ON "EstatisticaPartida"("jogadorId");

-- CreateIndex
CREATE UNIQUE INDEX "EstatisticaPartida_partidaId_jogadorId_key" ON "EstatisticaPartida"("partidaId", "jogadorId");

-- AddForeignKey
ALTER TABLE "Pelada" ADD CONSTRAINT "Pelada_temporadaAtualId_fkey" FOREIGN KEY ("temporadaAtualId") REFERENCES "Temporada"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Temporada" ADD CONSTRAINT "Temporada_peladaId_fkey" FOREIGN KEY ("peladaId") REFERENCES "Pelada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partida" ADD CONSTRAINT "Partida_peladaId_fkey" FOREIGN KEY ("peladaId") REFERENCES "Pelada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partida" ADD CONSTRAINT "Partida_temporadaId_fkey" FOREIGN KEY ("temporadaId") REFERENCES "Temporada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstatisticaPartida" ADD CONSTRAINT "EstatisticaPartida_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "Partida"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstatisticaPartida" ADD CONSTRAINT "EstatisticaPartida_jogadorId_fkey" FOREIGN KEY ("jogadorId") REFERENCES "Jogador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
