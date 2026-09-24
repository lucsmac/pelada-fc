// Cálculo puro do valor devido por jogador em uma partida.
//
// A partida tem N custos, cada um com tipo:
//   - por_jogador: valor fixo somado direto a todo mundo (ex: aluguel R$10)
//   - rateado:     valor total dividido entre os que dividem (ex: juiz R$30)
//
// A soma dos custos rateados é dividida pelo número de "divisores" — jogadores
// confirmados que pagam. Convidados entram ou não conforme a configuração da
// pelada (Pelada.convidadosPagamCustos), mas essa decisão acontece antes de
// chegar aqui: o chamador passa o `nDivisores` já pronto.

export const TIPOS_CUSTO = ['por_jogador', 'rateado'] as const;
export type TipoCusto = (typeof TIPOS_CUSTO)[number];

export interface CustoParaCalculo {
  readonly tipo: TipoCusto;
  readonly valorCentavos: number;
}

export interface ResumoTesouraria {
  readonly totalPorJogadorCentavos: number;
  readonly totalRateadoCentavos: number;
  readonly nDivisores: number;
  readonly valorPorJogadorCentavos: number;
  // true quando o rateio usou `estimativaDivisores` em vez do `nDivisores`
  // real (ninguém tinha confirmado presença).
  readonly estimado: boolean;
}

export function calcularTesourariaPartida(
  custos: readonly CustoParaCalculo[],
  nDivisores: number,
  estimativaDivisores?: number,
): ResumoTesouraria {
  let totalPorJogadorCentavos = 0;
  let totalRateadoCentavos = 0;
  for (const c of custos) {
    if (c.tipo === 'por_jogador') totalPorJogadorCentavos += c.valorCentavos;
    else totalRateadoCentavos += c.valorCentavos;
  }

  // Sem divisores reais, cai na estimativa (ex: totalJogadores da pelada) pra
  // não subestimar o valor por jogador. Se também não houver estimativa útil,
  // parteRateada fica 0.
  const divisorEfetivo =
    nDivisores > 0 ? nDivisores : estimativaDivisores && estimativaDivisores > 0 ? estimativaDivisores : 0;
  const estimado = nDivisores === 0 && divisorEfetivo > 0;
  const parteRateada =
    divisorEfetivo > 0 ? Math.ceil(totalRateadoCentavos / divisorEfetivo) : 0;

  return {
    totalPorJogadorCentavos,
    totalRateadoCentavos,
    nDivisores,
    valorPorJogadorCentavos: totalPorJogadorCentavos + parteRateada,
    estimado,
  };
}
