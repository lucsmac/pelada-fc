'use client';

import { useCallback, useRef, type PointerEvent } from 'react';

interface UseLongPressOptions {
  onLongPress: () => void;
  onTap?: () => void;
  ms?: number;
  toleranciaPx?: number;
}

interface HandlersLongPress {
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLElement>) => void;
  onPointerLeave: (e: PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLElement>) => void;
  onContextMenu: (e: React.SyntheticEvent) => void;
}

// Hook simples pra distinguir tap de long-press num único elemento.
// Se o dedo/mouse ficar `ms` (default 500) na mesma posição (tolerância
// `toleranciaPx`, default 10px), dispara `onLongPress` e cancela o tap.
// Caso contrário, dispara `onTap` no release.
//
// Observação: intencionalmente NÃO usa e.preventDefault no onContextMenu
// para não bloquear menu do sistema em desktop — o próprio long-press já
// dispara o menu customizado antes.
export function useLongPress({
  onLongPress,
  onTap,
  ms = 500,
  toleranciaPx = 10,
}: UseLongPressOptions): HandlersLongPress {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disparouRef = useRef(false);
  const origemRef = useRef<{ x: number; y: number } | null>(null);

  const limpar = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      disparouRef.current = false;
      origemRef.current = { x: e.clientX, y: e.clientY };
      limpar();
      timerRef.current = setTimeout(() => {
        disparouRef.current = true;
        onLongPress();
      }, ms);
    },
    [limpar, ms, onLongPress],
  );

  const onPointerUp = useCallback(() => {
    limpar();
    if (!disparouRef.current && onTap) onTap();
  }, [limpar, onTap]);

  const onPointerLeave = useCallback(() => {
    limpar();
  }, [limpar]);

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (!origemRef.current) return;
      const dx = e.clientX - origemRef.current.x;
      const dy = e.clientY - origemRef.current.y;
      if (dx * dx + dy * dy > toleranciaPx * toleranciaPx) limpar();
    },
    [limpar, toleranciaPx],
  );

  const onContextMenu = useCallback((e: React.SyntheticEvent) => {
    // Impede menu de contexto do navegador ao segurar (mobile fires this).
    e.preventDefault();
  }, []);

  return { onPointerDown, onPointerUp, onPointerLeave, onPointerMove, onContextMenu };
}
