'use client';

import { useEffect, useState } from 'react';

interface EstadoTemporal {
  iniciadoEm: Date | string | null;
  pausadoEm: Date | string | null;
  finalizadoEm: Date | string | null;
  duracaoPausadaSegundos: number;
}

interface UseTimerReturn {
  segundos: number;
  formatado: string;
  ativo: boolean;
}

function ms(v: Date | string | null): number | null {
  if (!v) return null;
  const d = typeof v === 'string' ? new Date(v) : v;
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

// Cronômetro derivado de timestamps — sobrevive a background/foreground e
// resfresh porque sempre recalcula a partir de `iniciadoEm` / `pausadoEm`.
// O tick de 1s só existe pra forçar re-render enquanto o timer roda; se estiver
// pausado ou finalizado, para de tickar (não consome CPU à toa).
export function useTimer(estado: EstadoTemporal): UseTimerReturn {
  const [, setTick] = useState(0);
  const iniciado = ms(estado.iniciadoEm);
  const pausado = ms(estado.pausadoEm);
  const finalizado = ms(estado.finalizadoEm);
  const ativo = iniciado != null && finalizado == null && pausado == null;

  useEffect(() => {
    if (!ativo) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [ativo]);

  if (iniciado == null) return { segundos: 0, formatado: '00:00', ativo: false };
  const fim = finalizado ?? pausado ?? Date.now();
  const seg = Math.max(0, Math.floor((fim - iniciado) / 1000) - estado.duracaoPausadaSegundos);
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return { segundos: seg, formatado: `${pad(m)}:${pad(s)}`, ativo };
}
