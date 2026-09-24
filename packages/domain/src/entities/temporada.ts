export interface Temporada {
  readonly id: string;
  readonly peladaId: string;
  readonly ano: number;
  readonly numero: number;
  readonly inicioEm: Date;
  readonly fimEm?: Date;
}

export const rotuloTemporada = (t: Pick<Temporada, 'ano' | 'numero'>): string =>
  `${t.ano} — T${t.numero}`;
