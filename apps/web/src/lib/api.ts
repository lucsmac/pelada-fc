const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/v1';

let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export const getAccessToken = (): string | null => accessToken;

export class ApiError extends Error {
  constructor(
    public status: number,
    public mensagem: string,
  ) {
    super(mensagem);
  }
}

type FetchOptions = RequestInit & { auth?: boolean };

async function rawFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { auth, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = {
    ...(headers as Record<string, string> | undefined),
  };
  // Só declara Content-Type quando de fato há body — POSTs sem body dispararam
  // 400 (Fastify tentava fazer parse de JSON vazio).
  if (rest.body != null) {
    finalHeaders['Content-Type'] = 'application/json';
  }
  if (auth && accessToken) {
    finalHeaders.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: finalHeaders,
    credentials: 'include',
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const mensagem =
      typeof body === 'object' && body && 'mensagem' in body
        ? String((body as { mensagem: unknown }).mensagem)
        : `Erro ${res.status}`;
    throw new ApiError(res.status, mensagem);
  }
  return body as T;
}

/**
 * Tenta rodar `fn`. Se retornar 401 e for autenticada, chama /auth/refresh
 * uma vez e refaz a requisição. Se o refresh também falhar, propaga o 401.
 */
async function withRefresh<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) throw err;
    try {
      const { accessToken: novo } = await rawFetch<{ accessToken: string }>('/auth/refresh', {
        method: 'POST',
      });
      setAccessToken(novo);
      return await fn();
    } catch {
      setAccessToken(null);
      throw err;
    }
  }
}

export const api = {
  get: <T>(path: string, opts?: FetchOptions) =>
    withRefresh(() => rawFetch<T>(path, { ...opts, method: 'GET' })),
  post: <T>(path: string, body?: unknown, opts?: FetchOptions) =>
    withRefresh(() =>
      rawFetch<T>(path, {
        ...opts,
        method: 'POST',
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    ),
  put: <T>(path: string, body?: unknown, opts?: FetchOptions) =>
    withRefresh(() =>
      rawFetch<T>(path, {
        ...opts,
        method: 'PUT',
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    ),
  patch: <T>(path: string, body?: unknown, opts?: FetchOptions) =>
    withRefresh(() =>
      rawFetch<T>(path, {
        ...opts,
        method: 'PATCH',
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    ),
  delete: <T>(path: string, opts?: FetchOptions) =>
    withRefresh(() => rawFetch<T>(path, { ...opts, method: 'DELETE' })),
  // Não passa pelo withRefresh (evita loop no próprio /refresh e /login).
  postSemRefresh: <T>(path: string, body?: unknown, opts?: FetchOptions) =>
    rawFetch<T>(path, {
      ...opts,
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
};

export const formatarTelefone = (raw: string): string => {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export const soDigitos = (raw: string): string => raw.replace(/\D/g, '');
