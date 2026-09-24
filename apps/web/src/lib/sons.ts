'use client';

import { useCallback, useEffect, useState } from 'react';

// Sons sintéticos via Web Audio API — sem assets. Envelope curto pra soar
// como apito de árbitro / fanfarra sem tocar samples externos.

export type NomeSom = 'apitoInicio' | 'apitoFim' | 'gol' | 'tempoEsgotado';

const CHAVE_MUDO = 'pelada-fc:som-mudo';

let ctx: AudioContext | null = null;

function pegarContexto(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx && ctx.state !== 'closed') return ctx;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

// Apito de árbitro — square wave em ~2200Hz com vibrato via LFO acoplado à
// frequência. Envelope ADSR bem curto pra atacar rápido e não estourar.
function apito(c: AudioContext, inicio: number, duracao: number, freq = 2200) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();

  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, inicio);
  lfo.frequency.value = 22;
  lfoGain.gain.value = 70;
  lfo.connect(lfoGain).connect(osc.frequency);

  gain.gain.setValueAtTime(0, inicio);
  gain.gain.linearRampToValueAtTime(0.12, inicio + 0.02);
  gain.gain.setValueAtTime(0.12, inicio + Math.max(0.05, duracao - 0.05));
  gain.gain.linearRampToValueAtTime(0, inicio + duracao);

  osc.connect(gain).connect(c.destination);
  osc.start(inicio);
  lfo.start(inicio);
  osc.stop(inicio + duracao + 0.02);
  lfo.stop(inicio + duracao + 0.02);
}

function nota(c: AudioContext, inicio: number, duracao: number, freq: number, volume = 0.18) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, inicio);
  gain.gain.linearRampToValueAtTime(volume, inicio + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, inicio + duracao);
  osc.connect(gain).connect(c.destination);
  osc.start(inicio);
  osc.stop(inicio + duracao + 0.02);
}

function tocarApitoInicio(c: AudioContext) {
  apito(c, c.currentTime, 0.55);
}

function tocarApitoFim(c: AudioContext) {
  const t = c.currentTime;
  apito(c, t, 0.18);
  apito(c, t + 0.28, 0.18);
  apito(c, t + 0.56, 0.95);
}

function tocarTempoEsgotado(c: AudioContext) {
  const t = c.currentTime;
  apito(c, t, 0.28);
  apito(c, t + 0.38, 0.28);
}

// Fanfarra curta ascendente — Do, Mi, Sol, Do (oitava acima).
function tocarGol(c: AudioContext) {
  const t = c.currentTime;
  const notas = [523.25, 659.25, 783.99, 1046.5];
  notas.forEach((f, i) => {
    nota(c, t + i * 0.1, 0.35, f, 0.2);
  });
  nota(c, t + notas.length * 0.1, 0.5, 1046.5, 0.22);
}

function estaSilenciado(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(CHAVE_MUDO) === '1';
}

export function tocar(nome: NomeSom): void {
  if (estaSilenciado()) return;
  const c = pegarContexto();
  if (!c) return;
  if (c.state === 'suspended') {
    void c.resume().catch(() => {});
  }
  switch (nome) {
    case 'apitoInicio':
      tocarApitoInicio(c);
      break;
    case 'apitoFim':
      tocarApitoFim(c);
      break;
    case 'gol':
      tocarGol(c);
      break;
    case 'tempoEsgotado':
      tocarTempoEsgotado(c);
      break;
  }
}

// Hook que expõe estado do mudo sincronizado com localStorage. A leitura
// inicial roda no useEffect pra não quebrar SSR/hidratação.
export function useSom() {
  const [mudo, setMudo] = useState(false);

  useEffect(() => {
    setMudo(estaSilenciado());
  }, []);

  const alternar = useCallback(() => {
    setMudo((atual) => {
      const novo = !atual;
      if (typeof window !== 'undefined') {
        if (novo) window.localStorage.setItem(CHAVE_MUDO, '1');
        else window.localStorage.removeItem(CHAVE_MUDO);
      }
      return novo;
    });
  }, []);

  return { mudo, alternar, tocar };
}
