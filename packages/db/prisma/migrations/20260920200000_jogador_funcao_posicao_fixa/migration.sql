-- Substitui Jogador.posicao (texto livre) por funcaoPreferida + posicaoLinha
-- estruturados. Enums FuncaoPartida e PosicaoLinha já foram criados na
-- migration 20260920190000_presenca_funcao_posicao.

ALTER TABLE "Jogador"
  DROP COLUMN "posicao",
  ADD COLUMN "funcaoPreferida" "FuncaoPartida",
  ADD COLUMN "posicaoLinha"    "PosicaoLinha";
