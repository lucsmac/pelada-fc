import { describe, expect, it } from 'vitest';
import { aproveitamento } from '../entities/jogador.js';
import { rotuloTemporada } from '../entities/temporada.js';

describe('domain smoke', () => {
  it('aproveitamento retorna 0 quando não há partidas', () => {
    expect(aproveitamento({ vitorias: 0, partidas: 0 })).toBe(0);
  });

  it('aproveitamento arredonda percentual', () => {
    expect(aproveitamento({ vitorias: 7, partidas: 12 })).toBe(58);
  });

  it('rotuloTemporada formata "ano — Tn"', () => {
    expect(rotuloTemporada({ ano: 2026, numero: 2 })).toBe('2026 — T2');
  });
});
