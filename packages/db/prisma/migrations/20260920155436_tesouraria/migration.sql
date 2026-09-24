-- CreateEnum
CREATE TYPE "TipoCusto" AS ENUM ('por_jogador', 'rateado');

-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_jogadorId_fkey";

-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_partidaId_fkey";

-- DropForeignKey
ALTER TABLE "GroupApplication" DROP CONSTRAINT "GroupApplication_peladaId_fkey";

-- DropForeignKey
ALTER TABLE "GroupApplication" DROP CONSTRAINT "GroupApplication_userId_fkey";

-- DropForeignKey
ALTER TABLE "GroupInvitation" DROP CONSTRAINT "GroupInvitation_criadoPorUserId_fkey";

-- DropForeignKey
ALTER TABLE "GroupInvitation" DROP CONSTRAINT "GroupInvitation_jogadorId_fkey";

-- DropForeignKey
ALTER TABLE "GroupInvitation" DROP CONSTRAINT "GroupInvitation_peladaId_fkey";

-- DropForeignKey
ALTER TABLE "GroupMember" DROP CONSTRAINT "GroupMember_jogadorId_fkey";

-- DropForeignKey
ALTER TABLE "GroupMember" DROP CONSTRAINT "GroupMember_peladaId_fkey";

-- DropForeignKey
ALTER TABLE "JogadorFollow" DROP CONSTRAINT "JogadorFollow_jogadorId_fkey";

-- DropForeignKey
ALTER TABLE "JogadorFollow" DROP CONSTRAINT "JogadorFollow_userId_fkey";

-- DropForeignKey
ALTER TABLE "Local" DROP CONSTRAINT "Local_criadoPorUserId_fkey";

-- DropForeignKey
ALTER TABLE "Pelada" DROP CONSTRAINT "Pelada_criadoPorUserId_fkey";

-- DropForeignKey
ALTER TABLE "Pelada" DROP CONSTRAINT "Pelada_localId_fkey";

-- DropForeignKey
ALTER TABLE "PeladaFollow" DROP CONSTRAINT "PeladaFollow_peladaId_fkey";

-- DropForeignKey
ALTER TABLE "PeladaFollow" DROP CONSTRAINT "PeladaFollow_userId_fkey";

-- DropForeignKey
ALTER TABLE "SeasonRanking" DROP CONSTRAINT "SeasonRanking_temporadaId_fkey";

-- DropForeignKey
ALTER TABLE "Team" DROP CONSTRAINT "Team_partidaId_fkey";

-- DropForeignKey
ALTER TABLE "TeamPlayer" DROP CONSTRAINT "TeamPlayer_jogadorId_fkey";

-- DropForeignKey
ALTER TABLE "TeamPlayer" DROP CONSTRAINT "TeamPlayer_teamId_fkey";

-- AlterTable
ALTER TABLE "Pelada" ADD COLUMN     "convidadosPagamCustos" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "CustoRecorrente" (
    "id" UUID NOT NULL,
    "peladaId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoCusto" NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustoRecorrente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustoPartida" (
    "id" UUID NOT NULL,
    "partidaId" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoCusto" NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "criadoPorUserId" UUID NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustoPartida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PagamentoPartida" (
    "id" UUID NOT NULL,
    "partidaId" UUID NOT NULL,
    "jogadorId" UUID NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "pagoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marcadoPorUserId" UUID NOT NULL,

    CONSTRAINT "PagamentoPartida_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustoRecorrente_peladaId_ativo_idx" ON "CustoRecorrente"("peladaId", "ativo");

-- CreateIndex
CREATE INDEX "CustoPartida_partidaId_idx" ON "CustoPartida"("partidaId");

-- CreateIndex
CREATE INDEX "PagamentoPartida_partidaId_idx" ON "PagamentoPartida"("partidaId");

-- CreateIndex
CREATE INDEX "PagamentoPartida_jogadorId_idx" ON "PagamentoPartida"("jogadorId");

-- CreateIndex
CREATE UNIQUE INDEX "PagamentoPartida_partidaId_jogadorId_key" ON "PagamentoPartida"("partidaId", "jogadorId");

-- AddForeignKey
ALTER TABLE "Local" ADD CONSTRAINT "Local_criadoPorUserId_fkey" FOREIGN KEY ("criadoPorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pelada" ADD CONSTRAINT "Pelada_criadoPorUserId_fkey" FOREIGN KEY ("criadoPorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pelada" ADD CONSTRAINT "Pelada_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_peladaId_fkey" FOREIGN KEY ("peladaId") REFERENCES "Pelada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_jogadorId_fkey" FOREIGN KEY ("jogadorId") REFERENCES "Jogador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeladaFollow" ADD CONSTRAINT "PeladaFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeladaFollow" ADD CONSTRAINT "PeladaFollow_peladaId_fkey" FOREIGN KEY ("peladaId") REFERENCES "Pelada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JogadorFollow" ADD CONSTRAINT "JogadorFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JogadorFollow" ADD CONSTRAINT "JogadorFollow_jogadorId_fkey" FOREIGN KEY ("jogadorId") REFERENCES "Jogador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonRanking" ADD CONSTRAINT "SeasonRanking_temporadaId_fkey" FOREIGN KEY ("temporadaId") REFERENCES "Temporada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "Partida"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_jogadorId_fkey" FOREIGN KEY ("jogadorId") REFERENCES "Jogador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "Partida"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPlayer" ADD CONSTRAINT "TeamPlayer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPlayer" ADD CONSTRAINT "TeamPlayer_jogadorId_fkey" FOREIGN KEY ("jogadorId") REFERENCES "Jogador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupApplication" ADD CONSTRAINT "GroupApplication_peladaId_fkey" FOREIGN KEY ("peladaId") REFERENCES "Pelada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupApplication" ADD CONSTRAINT "GroupApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvitation" ADD CONSTRAINT "GroupInvitation_peladaId_fkey" FOREIGN KEY ("peladaId") REFERENCES "Pelada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvitation" ADD CONSTRAINT "GroupInvitation_jogadorId_fkey" FOREIGN KEY ("jogadorId") REFERENCES "Jogador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInvitation" ADD CONSTRAINT "GroupInvitation_criadoPorUserId_fkey" FOREIGN KEY ("criadoPorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustoRecorrente" ADD CONSTRAINT "CustoRecorrente_peladaId_fkey" FOREIGN KEY ("peladaId") REFERENCES "Pelada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustoPartida" ADD CONSTRAINT "CustoPartida_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "Partida"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustoPartida" ADD CONSTRAINT "CustoPartida_criadoPorUserId_fkey" FOREIGN KEY ("criadoPorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagamentoPartida" ADD CONSTRAINT "PagamentoPartida_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "Partida"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagamentoPartida" ADD CONSTRAINT "PagamentoPartida_jogadorId_fkey" FOREIGN KEY ("jogadorId") REFERENCES "Jogador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagamentoPartida" ADD CONSTRAINT "PagamentoPartida_marcadoPorUserId_fkey" FOREIGN KEY ("marcadoPorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
