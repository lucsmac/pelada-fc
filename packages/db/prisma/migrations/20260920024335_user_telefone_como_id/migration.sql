-- User: telefone como identificador primário, email opcional.

-- 1) Adiciona telefone (nullable pra backfill).
ALTER TABLE "User" ADD COLUMN "telefone" TEXT;

-- 2) Backfill via Jogador vinculado.
UPDATE "User" u
   SET "telefone" = j."telefone"
  FROM "Jogador" j
 WHERE j."userId" = u."id"
   AND j."telefone" IS NOT NULL;

-- 3) Users que ficaram sem telefone não podem existir mais (dev-only).
--    Cascade limpa peladas criadas, follows, candidaturas, etc.
DELETE FROM "User" WHERE "telefone" IS NULL;

-- 4) Constraints finais.
ALTER TABLE "User" ALTER COLUMN "telefone" SET NOT NULL;
CREATE UNIQUE INDEX "User_telefone_key" ON "User"("telefone");

-- 5) Email vira opcional.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
