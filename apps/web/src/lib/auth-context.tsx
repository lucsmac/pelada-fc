'use client';

import type { AuthResponse, AuthUser, LoginBody, SignupBody } from '@peladafc/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, setAccessToken } from './api';

type EstadoAuth =
  | { status: 'carregando'; usuario: null }
  | { status: 'anonimo'; usuario: null }
  | { status: 'autenticado'; usuario: AuthUser };

interface AuthContextValue {
  estado: EstadoAuth;
  entrar: (body: LoginBody) => Promise<AuthUser>;
  cadastrar: (body: SignupBody) => Promise<AuthUser>;
  sair: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoAuth>({ status: 'carregando', usuario: null });

  // Ao montar: tenta renovar o access token via cookie de refresh.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const { accessToken } = await api.postSemRefresh<{ accessToken: string }>(
          '/auth/refresh',
        );
        setAccessToken(accessToken);
        const { usuario } = await api.get<{ usuario: AuthUser }>('/auth/me', { auth: true });
        if (!cancelado) setEstado({ status: 'autenticado', usuario });
      } catch {
        if (!cancelado) setEstado({ status: 'anonimo', usuario: null });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const entrar = useCallback(async (body: LoginBody) => {
    const resp = await api.postSemRefresh<AuthResponse>('/auth/login', body);
    setAccessToken(resp.accessToken);
    setEstado({ status: 'autenticado', usuario: resp.usuario });
    return resp.usuario;
  }, []);

  const cadastrar = useCallback(async (body: SignupBody) => {
    const resp = await api.postSemRefresh<AuthResponse>('/auth/signup', body);
    setAccessToken(resp.accessToken);
    setEstado({ status: 'autenticado', usuario: resp.usuario });
    return resp.usuario;
  }, []);

  const sair = useCallback(async () => {
    try {
      await api.postSemRefresh('/auth/logout');
    } catch {
      // ignora — sair local mesmo se o servidor falhar
    }
    setAccessToken(null);
    setEstado({ status: 'anonimo', usuario: null });
  }, []);

  const value = useMemo(() => ({ estado, entrar, cadastrar, sair }), [estado, entrar, cadastrar, sair]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve estar dentro de <AuthProvider>');
  return ctx;
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
