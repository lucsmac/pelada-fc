'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type {
  CandidaturaDTO,
  ListarCandidaturasResponse,
  PeladaDTO,
} from '@peladafc/contracts';
import { api } from '@/lib/api';
import { isApiError, useAuth } from '@/lib/auth-context';

const STATUS_LABEL: Record<CandidaturaDTO['status'], string> = {
  pendente: 'Pendente',
  aceito: 'Aceita',
  recusado: 'Recusada',
  cancelado: 'Cancelada',
  expirado: 'Expirada',
};

export default function CandidaturasPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { estado } = useAuth();
  const [pelada, setPelada] = useState<PeladaDTO | null>(null);
  const [candidaturas, setCandidaturas] = useState<CandidaturaDTO[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (estado.status === 'anonimo') router.replace('/entrar');
  }, [estado.status, router]);

  const carregar = async () => {
    const p = await api.get<PeladaDTO>(`/peladas/${slug}`, { auth: true });
    setPelada(p);
    const r = await api.get<ListarCandidaturasResponse>(`/peladas/${p.id}/candidaturas`, {
      auth: true,
    });
    setCandidaturas(r.itens);
  };

  useEffect(() => {
    carregar().catch((e) => setErro(isApiError(e) ? e.mensagem : 'Erro'));
  }, [slug]);

  const responder = async (id: string, acao: 'aprovar' | 'recusar') => {
    try {
      await api.post(`/candidaturas/${id}/${acao}`, undefined, { auth: true });
      await carregar();
    } catch (err) {
      alert(isApiError(err) ? err.mensagem : 'Erro');
    }
  };

  if (!pelada) {
    return <main className="mx-auto max-w-container px-16 py-16 text-text-tertiary">Carregando…</main>;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href={{ pathname: `/peladas/${pelada.slug}` }}
        className="text-xs text-text-tertiary hover:text-text"
      >
        ← {pelada.nome}
      </Link>
      <h1 className="mt-2 font-display text-5xl uppercase leading-none">Candidaturas</h1>
      {erro && <p className="mt-4 text-sm text-coral">{erro}</p>}

      <ul className="mt-8 flex flex-col divide-y divide-border">
        {candidaturas.length === 0 && (
          <li className="py-4 text-sm text-text-tertiary">Nenhuma candidatura ainda.</li>
        )}
        {candidaturas.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm">
                <span className="font-semibold">{c.user.nome}</span>{' '}
                <span className="text-text-tertiary">
                  {c.user.telefone.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3')}
                </span>
              </p>
              {c.mensagem && (
                <p className="mt-1 text-sm text-text-secondary">"{c.mensagem}"</p>
              )}
              <p className="mt-1 text-xs text-text-tertiary">
                {new Date(c.criadoEm).toLocaleDateString('pt-BR')} · {STATUS_LABEL[c.status]}
              </p>
            </div>
            {c.status === 'pendente' && (
              <div className="flex gap-2">
                <button
                  onClick={() => responder(c.id, 'aprovar')}
                  className="border border-accent bg-accent px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[#0B0D10] hover:brightness-95"
                >
                  Aprovar
                </button>
                <button
                  onClick={() => responder(c.id, 'recusar')}
                  className="border border-border-strong bg-panel px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-text-secondary hover:text-coral"
                >
                  Recusar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
