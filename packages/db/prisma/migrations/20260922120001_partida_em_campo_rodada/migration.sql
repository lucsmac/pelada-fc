-- Adiciona suporte a racha com 3+ times na Partida:
--   * `emCampoTeamIds`: array de 2 UUIDs (teamA, teamB) indicando quais times
--     estão em campo agora. Vazio em partidas legadas.
--   * `rodadaAtual`: contador de rodadas dentro da sessão. Começa em 1.
--   * `rankingJson`: snapshot do ranking dos times (vitorias/derrotas/saldo).
--     Mutado só por /encerrar-rodada. Evita replay em toda leitura.
--
-- Não é FK — validação fica na aplicação, coerente com desempateVencedorTeamId
-- (evita ciclo Team ⇄ Partida no onDelete).

ALTER TABLE "Partida"
  ADD COLUMN "emCampoTeamIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  ADD COLUMN "rodadaAtual" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "rankingJson" JSONB;
