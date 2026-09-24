'use client';

import { useEffect } from 'react';

// Minimal Wake Lock types — a lib padrão do TS 5.7 tem tipos DOM mas nem
// todo alvo os inclui. Declaro localmente pra não depender do lib.dom.iterable.
interface WakeLockSentinel {
  release(): Promise<void>;
}

// Screen Wake Lock API — mantém a tela ligada enquanto a partida está ao vivo.
// - Só age quando `ativo=true` (tipicamente `status === 'em_andamento'`).
// - Re-adquire o lock quando a aba volta a ficar visível (o navegador libera
//   automaticamente ao esconder a página).
// - Falha silenciosamente em contextos não suportados (iOS < 16.4, HTTP,
//   iframe sem permissão, etc.) — o app continua funcionando, só a tela
//   pode apagar sozinha.
export function useWakeLock(ativo: boolean) {
  useEffect(() => {
    if (!ativo) return;
    if (typeof navigator === 'undefined') return;
    const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> } })
      .wakeLock;
    if (!wl) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelado = false;

    const adquirir = async () => {
      if (cancelado || document.visibilityState !== 'visible') return;
      try {
        sentinel = await wl.request('screen');
      } catch {
        // Alguns browsers rejeitam por policy — ignora.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinel) {
        void adquirir();
      }
    };

    void adquirir();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelado = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel) {
        void sentinel.release().catch(() => {});
        sentinel = null;
      }
    };
  }, [ativo]);
}
