'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  CriarPartidaBody,
  ListarPartidasResponse,
  PartidaDTO,
  PeladaDTO,
  ListarMembrosResponse,
} from '@peladafc/contracts';
import { Botao } from '@/components/botao';
import { Campo } from '@/components/campo';
import { api, ApiError } from '@/lib/api';
import { isApiError, useAuth } from '@/lib/auth-context';

const STATUS_LABEL: Record<string, string> = {
  agendada: 'Agendada',
  em_andamento: 'Em andamento',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
};

const DIA_LABEL: Record<string, string> = {
  domingo: 'Domingos',
  segunda: 'Segundas',
  terca: 'Terças',
  quarta: 'Quartas',
  quinta: 'Quintas',
  sexta: 'Sextas',
  sabado: 'Sábados',
};

export default function PartidasPeladaPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { estado } = useAuth();

  const [pelada, setPelada] = useState<PeladaDTO | null>(null);
  const [partidas, setPartidas] = useState<PartidaDTO[] | null>(null);
  const [souAdmin, setSouAdmin] = useState(false);
  const [mostrarAvulsa, setMostrarAvulsa] = useState(false);
  const [data, setData] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  const [acaoErro, setAcaoErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const p = await api.get<PeladaDTO>(`/peladas/${slug}`);
        if (cancelado) return;
        setPelada(p);
        const [lista, membros] = await Promise.all([
          api.get<ListarPartidasResponse>(`/peladas/${p.id}/partidas`),
          api.get<ListarMembrosResponse>(`/peladas/${p.id}/membros`),
        ]);
        if (cancelado) return;
        setPartidas(lista.itens);
        if (estado.status === 'autenticado') {
          const admin =
            p.criadoPorUserId === estado.usuario.id ||
            membros.itens.some(
              (m) => m.papel === 'admin' && m.jogador.userId === estado.usuario.id,
            );
          setSouAdmin(admin);
        }
      } catch (e) {
        if (!cancelado)
          setErroCarregar(
            e instanceof ApiError && e.status === 404
              ? 'Pelada não encontrada'
              : 'Erro ao carregar',
          );
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [slug, estado]);

  const criarAvulsa = async (e: FormEvent) => {
    e.preventDefault();
    if (!pelada) return;
    setErro(null);
    setEnviando(true);
    try {
      const body: CriarPartidaBody = { data: new Date(data) };
      const nova = await api.post<PartidaDTO>(`/peladas/${pelada.id}/partidas`, body, {
        auth: true,
      });
      setPartidas((atual) => (atual ? [nova, ...atual] : [nova]));
      setData('');
      setMostrarAvulsa(false);
      router.push(`/partidas/${nova.id}`);
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro ao criar partida');
      setEnviando(false);
    } finally {
      setEnviando(false);
    }
  };

  const cancelar = async (partidaId: string) => {
    if (!confirm('Cancelar essa partida?')) return;
    setAcaoErro(null);
    try {
      const atualizada = await api.post<PartidaDTO>(
        `/partidas/${partidaId}/cancelar`,
        undefined,
        { auth: true },
      );
      setPartidas((atual) => atual?.map((p) => (p.id === atualizada.id ? atualizada : p)) ?? null);
    } catch (err) {
      setAcaoErro(isApiError(err) ? err.mensagem : 'Erro ao cancelar');
    }
  };

  const reabrir = async (partidaId: string) => {
    setAcaoErro(null);
    try {
      const atualizada = await api.post<PartidaDTO>(
        `/partidas/${partidaId}/reabrir`,
        undefined,
        { auth: true },
      );
      setPartidas((atual) => atual?.map((p) => (p.id === atualizada.id ? atualizada : p)) ?? null);
    } catch (err) {
      setAcaoErro(isApiError(err) ? err.mensagem : 'Erro ao reabrir');
    }
  };

  const { proximas, passadas } = useMemo(() => {
    const agora = Date.now();
    const orden = [...(partidas ?? [])].sort(
      (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime(),
    );
    return {
      proximas: orden.filter(
        (p) => p.status !== 'finalizada' && new Date(p.data).getTime() >= agora - 12 * 3600_000,
      ),
      passadas: orden
        .filter(
          (p) => p.status === 'finalizada' || new Date(p.data).getTime() < agora - 12 * 3600_000,
        )
        .reverse(),
    };
  }, [partidas]);

  if (erroCarregar) {
    return (
      <main className="mx-auto max-w-container px-16 py-16">
        <h1 className="font-display text-4xl uppercase">{erroCarregar}</h1>
      </main>
    );
  }
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
      <h1 className="mt-2 font-display text-5xl uppercase leading-none">Partidas</h1>
      <p className="mt-3 text-sm text-text-secondary">
        Rotina: <b className="text-text">{DIA_LABEL[pelada.diaSemana] ?? pelada.diaSemana}</b> ·{' '}
        <b className="text-text">{pelada.horario}</b>. As próximas ocorrências são criadas
        automaticamente — cancele quando não for rolar.
      </p>

      {acaoErro && (
        <p className="mt-4 border border-coral bg-coral/10 p-3 text-sm text-coral">{acaoErro}</p>
      )}

      <section className="mt-8">
        <h2 className="border-b border-dotted border-border-strong pb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
          Próximas
        </h2>
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {proximas.length === 0 && (
            <li className="py-4 text-sm text-text-tertiary">Nenhuma partida agendada.</li>
          )}
          {proximas.map((p) => (
            <LinhaPartida
              key={p.id}
              partida={p}
              souAdmin={souAdmin}
              onCancelar={() => cancelar(p.id)}
              onReabrir={() => reabrir(p.id)}
            />
          ))}
        </ul>
      </section>

      {souAdmin && (
        <section className="mt-10 border border-border bg-panel p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                Partida avulsa
              </p>
              <p className="mt-1 text-xs text-text-tertiary">
                Só use pra jogo fora da rotina (amistoso, reposição, etc).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMostrarAvulsa((v) => !v)}
              className="text-xs font-bold uppercase tracking-wider text-accent hover:underline"
            >
              {mostrarAvulsa ? 'Fechar' : 'Adicionar +'}
            </button>
          </div>
          {mostrarAvulsa && (
            <form onSubmit={criarAvulsa} className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
              <div className="flex-1">
                <Campo
                  rotulo="Data e hora"
                  type="datetime-local"
                  name="data"
                  required
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
              <Botao type="submit" carregando={enviando}>
                Agendar avulsa
              </Botao>
            </form>
          )}
          {erro && <p className="mt-2 text-sm text-coral">{erro}</p>}
        </section>
      )}

      <section className="mt-10">
        <h2 className="border-b border-dotted border-border-strong pb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
          Histórico
        </h2>
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {partidas === null && <li className="py-4 text-sm text-text-tertiary">Carregando…</li>}
          {partidas !== null && passadas.length === 0 && (
            <li className="py-4 text-sm text-text-tertiary">Sem partidas anteriores.</li>
          )}
          {passadas.map((p) => (
            <LinhaPartida
              key={p.id}
              partida={p}
              souAdmin={souAdmin}
              onCancelar={() => cancelar(p.id)}
              onReabrir={() => reabrir(p.id)}
            />
          ))}
        </ul>
      </section>
    </main>
  );
}

function LinhaPartida({
  partida,
  souAdmin,
  onCancelar,
  onReabrir,
}: {
  partida: PartidaDTO;
  souAdmin: boolean;
  onCancelar: () => void;
  onReabrir: () => void;
}) {
  const cancelada = partida.status === 'cancelada';
  return (
    <li
      className={[
        'flex items-center justify-between py-4',
        cancelada ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div>
        <p
          className={[
            'font-display text-2xl uppercase leading-none',
            cancelada ? 'line-through' : '',
          ].join(' ')}
        >
          {new Date(partida.data).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
          })}
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          {new Date(partida.data).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          — {STATUS_LABEL[partida.status]}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {partida.status === 'finalizada' && (
          <span className="font-display text-2xl">
            {partida.placarTimeA} · {partida.placarTimeB}
          </span>
        )}
        {souAdmin && partida.status === 'agendada' && (
          <button
            onClick={onCancelar}
            className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary hover:text-coral"
          >
            Cancelar
          </button>
        )}
        {souAdmin && cancelada && (
          <button
            onClick={onReabrir}
            className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary hover:text-accent"
          >
            Reabrir
          </button>
        )}
        <Link
          href={`/partidas/${partida.id}`}
          className="border border-border-strong bg-panel-2 px-3 py-2 text-xs font-bold uppercase tracking-wider hover:border-accent"
        >
          Abrir
        </Link>
      </div>
    </li>
  );
}
