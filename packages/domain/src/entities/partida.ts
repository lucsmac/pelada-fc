export interface EstatisticaPartida {
  jogadorId: string;
  gols: number;
  assistencias: number;
  foiMvp: boolean;
}

export interface Partida {
  readonly id: string;
  readonly peladaId: string;
  readonly temporadaId: string;
  readonly data: Date;
  readonly placar: {
    timeA: number;
    timeB: number;
  };
  readonly estatisticas: readonly EstatisticaPartida[];
}
