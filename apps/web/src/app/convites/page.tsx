'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ConviteDTO, ListarConvitesResponse } from '@peladafc/contracts';
import { api } from '@/lib/api';
import { isApiError, useAuth } from '@/lib/auth-context';

export default function ConvitesPage() {
  const router = useRouter();
  const { estado } = useAuth();
  const [convites, setConvites] = useState<ConviteDTO[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (estado.status === 'anonimo') router.replace('/entrar');
  }, [estado.status, router]);

  const carregar = async () => {
    const r = await api.get<ListarConvitesResponse>('/convites/meus', { auth: true });
    setConvites(r.itens);
  };

  useEffect(() => {
    if (estado.status === 'autenticado') {
      carregar().catch((e) => setErro(isApiError(e) ? e.mensagem : 'Erro'));
    }
  }, [estado.status]);

  const responder = async (id: string, acao: 'aceitar' | 'recusar') => {
    try {
      await api.post(`/convites/${id}/${acao}`, undefined, { auth: true });
      await carregar();
    } catch (err) {
      alert(isApiError(err) ? err.mensagem : 'Erro');
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-5xl uppercase leading-none">Meus convites</h1>
      {erro && <p className="mt-4 text-sm text-coral">{erro}</p>}

      <ul className="mt-8 flex flex-col divide-y divide-border">
        {convites.length === 0 && (
          <li className="py-4 text-sm text-text-tertiary">Nenhum convite pendente.</li>
        )}
        {convites.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-4">
            <div>
              {c.pelada && (
                <p className="text-sm">
                  Convite para{' '}
                  <Link
                    href={{ pathname: `/peladas/${c.pelada.slug}` }}
                    className="font-semibold text-accent hover:underline"
                  >
                    {c.pelada.nome}
                  </Link>
                </p>
              )}
              <p className="mt-1 text-xs text-text-tertiary">
                {new Date(c.criadoEm).toLocaleDateString('pt-BR')}
                {c.expiraEm && ` · expira ${new Date(c.expiraEm).toLocaleDateString('pt-BR')}`}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => responder(c.id, 'aceitar')}
                className="border border-accent bg-accent px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[#0B0D10] hover:brightness-95"
              >
                Aceitar
              </button>
              <button
                onClick={() => responder(c.id, 'recusar')}
                className="border border-border-strong bg-panel px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-text-secondary hover:text-coral"
              >
                Recusar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
