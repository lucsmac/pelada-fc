import { aproveitamento, type EstatisticasJogador } from '../entities/jogador.js';

export const CATEGORIAS_RANKING = [
  'geral',
  'artilharia',
  'vitorias',
  'assistencias',
  'mvp',
  'aproveitamento',
] as const;
export type CategoriaRanking = (typeof CATEGORIAS_RANKING)[number];

export const CATEGORIA_LABEL: Record<CategoriaRanking, string> = {
  geral: 'Geral',
  artilharia: 'Artilharia',
  vitorias: 'Vitórias',
  assistencias: 'Assistências',
  mvp: 'MVP',
  aproveitamento: 'Aproveitamento',
};

export interface LinhaRanking {
  jogadorId: string;
  nome: string;
  avatarInicial: string;
  estatisticas: EstatisticasJogador;
}

export interface LinhaRankingOrdenada extends LinhaRanking {
  posicao: number;
  valor: number;
}

const criterio: Record<CategoriaRanking, (e: EstatisticasJogador) => number> = {
  geral: () => 0,
  artilharia: (e) => e.gols,
  vitorias: (e) => e.vitorias,
  assistencias: (e) => e.assistencias,
  mvp: (e) => e.mvps,
  aproveitamento: (e) => aproveitamento(e),
};

export function ordenarRanking(
  linhas: readonly LinhaRanking[],
  categoria: CategoriaRanking,
): LinhaRankingOrdenada[] {
  const fn = criterio[categoria];
  const ordenadas =
    categoria === 'geral'
      ? [...linhas]
      : [...linhas].sort((a, b) => fn(b.estatisticas) - fn(a.estatisticas));

  return ordenadas.map((linha, idx) => ({
    ...linha,
    posicao: idx + 1,
    valor: fn(linha.estatisticas),
  }));
}
