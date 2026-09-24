-- AlterTable
ALTER TABLE "Jogador" ADD COLUMN "telefone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Jogador_telefone_key" ON "Jogador"("telefone");
