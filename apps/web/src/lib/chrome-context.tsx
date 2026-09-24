'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface ChromeCtx {
  ocultarMenu: boolean;
  setOcultarMenu: (v: boolean) => void;
}

const Ctx = createContext<ChromeCtx | null>(null);

export function ChromeProvider({ children }: { children: ReactNode }) {
  const [ocultarMenu, setOcultarMenu] = useState(false);
  return <Ctx.Provider value={{ ocultarMenu, setOcultarMenu }}>{children}</Ctx.Provider>;
}

export function useChrome(): ChromeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useChrome fora do ChromeProvider');
  return c;
}
