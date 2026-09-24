export interface Cidade {
  readonly nome: string;
  readonly uf: string;
}

export const formatCidade = (c: Cidade): string => `${c.nome}, ${c.uf}`;
