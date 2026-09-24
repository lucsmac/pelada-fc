import { describe, expect, it } from 'vitest';
import { calcularTesourariaPartida } from './calculo.js';

describe('calcularTesourariaPartida', () => {
  it('sem custos retorna zero', () => {
    const r = calcularTesourariaPartida([], 5);
    expect(r.valorPorJogadorCentavos).toBe(0);
    expect(r.totalPorJogadorCentavos).toBe(0);
    expect(r.totalRateadoCentavos).toBe(0);
  });

  it('só por_jogador soma sem depender de divisores', () => {
    const r = calcularTesourariaPartida(
      [
        { tipo: 'por_jogador', valorCentavos: 1000 },
        { tipo: 'por_jogador', valorCentavos: 200 },
      ],
      3,
    );
    expect(r.valorPorJogadorCentavos).toBe(1200);
  });

  it('só rateado divide pelos divisores', () => {
    // R$30 rateado entre 5 = R$6 por jogador
    const r = calcularTesourariaPartida(
      [{ tipo: 'rateado', valorCentavos: 3000 }],
      5,
    );
    expect(r.valorPorJogadorCentavos).toBe(600);
    expect(r.totalRateadoCentavos).toBe(3000);
  });

  it('misto: por_jogador + rateado', () => {
    // R$10 fixo + R$30/5 = R$10 + R$6 = R$16
    const r = calcularTesourariaPartida(
      [
        { tipo: 'por_jogador', valorCentavos: 1000 },
        { tipo: 'rateado', valorCentavos: 3000 },
      ],
      5,
    );
    expect(r.valorPorJogadorCentavos).toBe(1600);
  });

  it('nDivisores=0 sem estimativa devolve só o fixo', () => {
    const r = calcularTesourariaPartida(
      [
        { tipo: 'por_jogador', valorCentavos: 500 },
        { tipo: 'rateado', valorCentavos: 3000 },
      ],
      0,
    );
    expect(r.valorPorJogadorCentavos).toBe(500);
    expect(r.estimado).toBe(false);
  });

  it('nDivisores=0 com estimativa marca estimado=true e usa a estimativa', () => {
    // R$5 fixo + R$30 rateado por 10 (estimativa) = R$5 + R$3 = R$8
    const r = calcularTesourariaPartida(
      [
        { tipo: 'por_jogador', valorCentavos: 500 },
        { tipo: 'rateado', valorCentavos: 3000 },
      ],
      0,
      10,
    );
    expect(r.valorPorJogadorCentavos).toBe(800);
    expect(r.estimado).toBe(true);
  });

  it('quando há divisores reais, ignora a estimativa', () => {
    const r = calcularTesourariaPartida(
      [{ tipo: 'rateado', valorCentavos: 3000 }],
      5,
      100,
    );
    expect(r.valorPorJogadorCentavos).toBe(600);
    expect(r.estimado).toBe(false);
  });

  it('arredonda o rateado pra cima em centavos (nunca deixa falha por 1 centavo)', () => {
    // R$10 / 3 = R$3,3333 → arredonda pra R$3,34 por jogador (334 centavos)
    const r = calcularTesourariaPartida(
      [{ tipo: 'rateado', valorCentavos: 1000 }],
      3,
    );
    expect(r.valorPorJogadorCentavos).toBe(334);
  });
});
