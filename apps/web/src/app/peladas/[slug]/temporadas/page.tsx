'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  CriarTemporadaBody,
  ListarMembrosResponse,
  ListarTemporadasResponse,
  PeladaDTO,
  TemporadaDTO,
} from '@peladafc/contracts';
import { Botao } from '@/components/botao';
import { Campo } from '@/components/campo';
import { api } from '@/lib/api';
import { isApiError, useAuth } from '@/lib/auth-context';

export default function TemporadasPage() {
  const { slug } = useParams<{ slug: string }>();
  const { estado } = useAuth();

  const [pelada, setPelada] = useState<PeladaDTO | null>(null);
  const [temporadas, setTemporadas] = useState<TemporadaDTO[]>([]);
  const [souAdmin, setSouAdmin] = useState(false);

  const [ano, setAno] = useState(new Date().getFullYear());
  const [numero, setNumero] = useState(1);
  const [nome, setNome] = useState('');
  const [inicioEm, setInicioEm] = useState('');
  const [fimEm, setFimEm] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = async () => {
    const p = await api.get<PeladaDTO>(`/peladas/${slug}`);
    setPelada(p);
    const [t, m] = await Promise.all([
      api.get<ListarTemporadasResponse>(`/peladas/${p.id}/temporadas`),
      api.get<ListarMembrosResponse>(`/peladas/${p.id}/membros`),
    ]);
    setTemporadas(t.itens);
    if (estado.status === 'autenticado') {
      setSouAdmin(
        p.criadoPorUserId === estado.usuario.id ||
          m.itens.some(
            (mm) => mm.papel === 'admin' && mm.jogador.userId === estado.usuario.id,
          ),
      );
    }
    return { p };
  };

  useEffect(() => {
    carregar().catch(() => {});
  }, [slug, estado]);

  const temporadaAtualId = useMemo(() => pelada?.temporadaAtualId ?? null, [pelada]);

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    if (!pelada) return;
    setErro(null);
    setEnviando(true);
    try {
      const body: CriarTemporadaBody = {
        ano,
        numero,
        nome: nome.trim() || undefined,
        inicioEm: new Date(inicioEm),
        fimEm: fimEm ? new Date(fimEm) : undefined,
        ativarComoAtual: true,
      };
      await api.post<TemporadaDTO>(`/peladas/${pelada.id}/temporadas`, body, { auth: true });
      setNome('');
      setInicioEm('');
      setFimEm('');
      setNumero((n) => n + 1);
      await carregar();
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro ao criar temporada');
    } finally {
      setEnviando(false);
    }
  };

  const encerrar = async (id: string) => {
    if (!confirm('Encerrar temporada? O ranking será congelado.')) return;
    try {
      await api.post(`/temporadas/${id}/encerrar`, undefined, { auth: true });
      await carregar();
    } catch (err) {
      alert(isApiError(err) ? err.mensagem : 'Erro');
    }
  };

  const ativar = async (id: string) => {
    try {
      await api.post(`/temporadas/${id}/ativar`, undefined, { auth: true });
      await carregar();
    } catch (err) {
      alert(isApiError(err) ? err.mensagem : 'Erro');
    }
  };

  if (!pelada) {
    return <main className="mx-auto max-w-container px-4 py-10 md:px-16 md:py-16 text-text-tertiary">Carregando…</main>;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href={{ pathname: `/peladas/${pelada.slug}` }}
        className="text-xs text-text-tertiary hover:text-text"
      >
        ← {pelada.nome}
      </Link>
      <h1 className="mt-2 font-display text-4xl uppercase leading-none sm:text-5xl">Temporadas</h1>

      {souAdmin && (
        <section className="mt-8 border border-border bg-panel p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            Nova temporada
          </p>
          <form
            onSubmit={criar}
            className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4"
          >
            <Campo
              rotulo="Ano"
              type="number"
              name="ano"
              min={2020}
              max={2100}
              value={ano}
              onChange={(e) => setAno(Number(e.target.value))}
            />
            <Campo
              rotulo="Número"
              type="number"
              name="numero"
              min={1}
              max={20}
              value={numero}
              onChange={(e) => setNumero(Number(e.target.value))}
            />
            <Campo
              rotulo="Nome (opcional)"
              name="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="ex: T2 verão"
            />
            <div />
            <Campo
              rotulo="Início"
              type="date"
              name="inicioEm"
              required
              value={inicioEm}
              onChange={(e) => setInicioEm(e.target.value)}
            />
            <Campo
              rotulo="Fim (opcional)"
              type="date"
              name="fimEm"
              value={fimEm}
              onChange={(e) => setFimEm(e.target.value)}
            />
            {erro && <p className="md:col-span-2 lg:col-span-4 text-sm text-coral">{erro}</p>}
            <div className="md:col-span-2 lg:col-span-4">
              <Botao type="submit" carregando={enviando}>
                Criar temporada
              </Botao>
            </div>
          </form>
        </section>
      )}

      <ul className="mt-8 flex flex-col divide-y divide-border">
        {temporadas.length === 0 && (
          <li className="py-4 text-sm text-text-tertiary">Nenhuma temporada ainda.</li>
        )}
        {temporadas.map((t) => (
          <li key={t.id} className="flex items-center justify-between py-4">
            <div>
              <p className="font-display text-2xl uppercase leading-none">
                {t.nome ?? `${t.ano} — T${t.numero}`}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {new Date(t.inicioEm).toLocaleDateString('pt-BR')}
                {' – '}
                {t.fimEm ? new Date(t.fimEm).toLocaleDateString('pt-BR') : 'em curso'}
              </p>
              <p className="text-xs">
                {t.encerradaEm ? (
                  <span className="text-text-tertiary">
                    Encerrada em {new Date(t.encerradaEm).toLocaleDateString('pt-BR')}
                  </span>
                ) : t.id === temporadaAtualId ? (
                  <span className="text-accent">Atual</span>
                ) : (
                  <span className="text-text-tertiary">Inativa</span>
                )}
              </p>
            </div>
            {souAdmin && (
              <div className="flex gap-2">
                {!t.encerradaEm && t.id !== temporadaAtualId && (
                  <button
                    onClick={() => ativar(t.id)}
                    className="text-[11px] font-bold uppercase tracking-wider text-accent hover:underline"
                  >
                    Ativar
                  </button>
                )}
                {!t.encerradaEm && (
                  <button
                    onClick={() => encerrar(t.id)}
                    className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary hover:text-coral"
                  >
                    Encerrar
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
