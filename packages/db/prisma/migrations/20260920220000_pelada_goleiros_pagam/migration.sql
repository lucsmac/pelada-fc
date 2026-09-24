-- Flag pra pelada em que goleiros não pagam (comum: "quem tá no gol não paga").
-- Quando false, goleiros ficam de fora do rateio na tesouraria.

ALTER TABLE "Pelada"
  ADD COLUMN "goleirosPagam" BOOLEAN NOT NULL DEFAULT true;
