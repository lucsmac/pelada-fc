export interface Jogador {
  readonly id: string;
  readonly nome: string;
  readonly apelido?: string;
  readonly avatarInicial: string;
  readonly cidadeAtual?: string;
  readonly criadoEm: Date;
}

export interface EstatisticasJogador {
  partidas: number;
  gols: number;
  assistencias: number;
  vitorias: number;
  empates: number;
  derrotas: number;
  mvps: number;
}

export const aproveitamento = (e: Pick<EstatisticasJogador, 'vitorias' | 'partidas'>): number =>
  e.partidas === 0 ? 0 : Math.round((e.vitorias / e.partidas) * 100);

/**
 * Rating derivado das estatísticas (0–99), inspirado em cartas de futebol.
 * Fórmula simples: pondera aproveitamento, gols/partida, assist/partida e MVPs.
 * Requer mínimo de 3 partidas — abaixo disso, retorna null.
 */
export const calcularRating = (e: EstatisticasJogador): number | null => {
  if (e.partidas < 3) return null;
  const aprov = aproveitamento(e); // 0-100
  const golsPP = (e.gols / e.partidas) * 20; // 1 gol/jogo = 20
  const assistPP = (e.assistencias / e.partidas) * 15;
  const mvpPP = (e.mvps / e.partidas) * 25;
  const raw = aprov * 0.45 + golsPP + assistPP + mvpPP;
  return Math.max(0, Math.min(99, Math.round(raw)));
};
