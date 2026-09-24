'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type {
  BuscarJogadoresResponse,
  ConvidadoPartidaDTO,
  ConvidarParaPartidaBody,
  ConvidarParaPartidaResponse,
  CriarCustoPartidaBody,
  CustoPartidaDTO,
  EventoEstatistica,
  FuncaoPartida,
  LinhaDevedorDTO,
  ListarMembrosResponse,
  MarcarPagamentoBody,
  MembroDTO,
  PartidaDetalhe,
  PeladaDTO,
  PosicaoLinha,
  PresencaJogador,
  RegistrarPresencaBody,
  RegistrarResultadoBody,
  SortearTimesBody,
  StatusPresenca,
  TesourariaPartidaResponse,
  TimeDTO,
  TipoCusto,
} from '@peladafc/contracts';
import { POSICOES_LINHA, ROTULOS_POSICAO_LINHA } from '@peladafc/contracts';
import { Botao } from '@/components/botao';
import {
  IconeGoleiro,
  IconeInterrogacao,
  IconeLinha,
  IconeRecusado,
  IconeReserva,
} from '@/components/icones-funcao';
import { api, ApiError } from '@/lib/api';
import { isApiError, useAuth } from '@/lib/auth-context';

export default function PartidaDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { estado } = useAuth();

  const [partida, setPartida] = useState<PartidaDetalhe | null>(null);
  const [pelada, setPelada] = useState<PeladaDTO | null>(null);
  const [membros, setMembros] = useState<MembroDTO[]>([]);
  const [tesouraria, setTesouraria] = useState<TesourariaPartidaResponse | null>(null);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = async () => {
    const p = await api.get<PartidaDetalhe>(`/partidas/${id}`);
    setPartida(p);
    // Standalone (pelada rápida) não tem grupo, tesouraria, nem membros —
    // toda a experiência vive em /ao-vivo ou /resumo.
    if (p.peladaId == null) return p;
    if (!pelada || pelada.id !== p.peladaId) {
      const pel = await api.get<PeladaDTO>(`/peladas/${p.peladaId}`);
      setPelada(pel);
      const m = await api.get<ListarMembrosResponse>(`/peladas/${p.peladaId}/membros`);
      setMembros(m.itens);
    }
    const t = await api.get<TesourariaPartidaResponse>(`/partidas/${id}/tesouraria`);
    setTesouraria(t);
    return p;
  };

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const p = await carregar();
        if (cancelado) return;
        // Partida em modo live (standalone ou vinculada) — redireciona pra
        // experiência dedicada em vez de mostrar o detalhe tradicional.
        if (p.peladaId == null || p.metaGols != null) {
          if (p.status === 'finalizada') router.replace(`/partidas/${id}/resumo`);
          else router.replace(`/partidas/${id}/ao-vivo`);
        }
      } catch (e) {
        if (!cancelado) {
          setErroCarregar(
            e instanceof ApiError && e.status === 404 ? 'Partida não encontrada' : 'Erro',
          );
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [id]);

  const souAdmin = useMemo(() => {
    if (estado.status !== 'autenticado' || !pelada) return false;
    return (
      pelada.criadoPorUserId === estado.usuario.id ||
      membros.some((m) => m.papel === 'admin' && m.jogador.userId === estado.usuario.id)
    );
  }, [estado, pelada, membros]);

  const meuMembro = useMemo(() => {
    if (estado.status !== 'autenticado') return null;
    return membros.find((m) => m.jogador.userId === estado.usuario.id) ?? null;
  }, [estado, membros]);
  const meuJogadorId = meuMembro?.jogador.id ?? null;

  if (erroCarregar) {
    return (
      <main className="mx-auto max-w-container px-4 py-10 md:px-16 md:py-16">
        <h1 className="font-display text-4xl uppercase">{erroCarregar}</h1>
      </main>
    );
  }
  if (!partida) {
    return <main className="mx-auto max-w-container px-4 py-10 md:px-16 md:py-16 text-text-tertiary">Carregando…</main>;
  }

  const registrarPresenca = async (
    status: StatusPresenca,
    opts: { jogadorId?: string; funcao?: FuncaoPartida; posicaoLinha?: PosicaoLinha | null } = {},
  ) => {
    setErro(null);
    try {
      const body: RegistrarPresencaBody = {
        status,
        jogadorId: opts.jogadorId,
        funcao: opts.funcao ?? 'linha',
        posicaoLinha: opts.funcao === 'goleiro' ? null : opts.posicaoLinha ?? null,
      };
      await api.post(`/partidas/${partida.id}/presenca`, body, { auth: true });
      await carregar();
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro');
    }
  };

  const sortear = async (quantidadeTimes?: number) => {
    setErro(null);
    setAviso(null);
    try {
      const body: SortearTimesBody = quantidadeTimes ? { quantidadeTimes } : {};
      await api.post(`/partidas/${partida.id}/sorteio`, body, { auth: true });
      setAviso('Times sorteados.');
      await carregar();
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro no sorteio');
    }
  };

  const confirmados = partida.presencas.filter((p) => p.status === 'confirmado');
  const goleirosConfirmados = confirmados.filter((p) => p.funcao === 'goleiro');
  const linhaConfirmados = confirmados.filter((p) => p.funcao === 'linha');
  const listaEspera = partida.presencas.filter((p) => p.status === 'lista_espera');
  const recusados = partida.presencas.filter((p) => p.status === 'recusado');
  const maxGoleiros = pelada?.maxGoleiros ?? 1;
  const maxLinha = pelada ? Math.max(0, pelada.totalJogadores - pelada.maxGoleiros) : 0;
  const minhaPresenca =
    meuJogadorId != null
      ? partida.presencas.find((p) => p.jogadorId === meuJogadorId) ?? null
      : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {pelada && (
        <Link
          href={{ pathname: `/peladas/${pelada.slug}/partidas` }}
          className="text-xs text-text-tertiary hover:text-text"
        >
          ← Partidas de {pelada.nome}
        </Link>
      )}
      <h1 className="mt-2 font-display text-4xl uppercase leading-none sm:text-5xl">
        {new Date(partida.data).toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })}
      </h1>
      <p className="mt-2 text-sm text-text-secondary">
        {new Date(partida.data).toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })}{' '}
        · {partida.status === 'finalizada'
          ? `Placar ${partida.placarTimeA} × ${partida.placarTimeB}`
          : partida.status}
      </p>

      {erro && <p className="mt-4 text-sm text-coral">{erro}</p>}
      {aviso && <p className="mt-4 text-sm text-accent">{aviso}</p>}

      {/* Presença */}
      <section className="mt-10">
        <h2 className="border-b border-dotted border-border-strong pb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
          Presença
        </h2>

        {meuJogadorId && (
          <FormMinhaPresenca
            minhaPresenca={minhaPresenca}
            funcaoPreferida={meuMembro?.jogador.funcaoPreferida ?? null}
            posicaoPreferida={meuMembro?.jogador.posicaoLinha ?? null}
            onEnviar={(status, funcao, posicaoLinha) =>
              registrarPresenca(status, { funcao, posicaoLinha })
            }
          />
        )}

        <div className="mt-5 flex flex-col gap-4">
          <BlocoRole
            icone={<IconeGoleiro />}
            titulo="Goleiros"
            cor="dourado"
            confirmados={goleirosConfirmados}
            capacidade={maxGoleiros}
          />
          <BlocoRole
            icone={<IconeLinha />}
            titulo="Linha"
            cor="accent"
            confirmados={linhaConfirmados}
            capacidade={maxLinha}
          />
        </div>

        {listaEspera.length > 0 && (
          <BlocoReserva presencas={listaEspera} />
        )}

        {recusados.length > 0 && (
          <BlocoRecusados presencas={recusados} />
        )}

        {souAdmin &&
          (() => {
            const semResposta = membros.filter(
              (m) => !partida.presencas.some((p) => p.jogadorId === m.jogador.id),
            );
            if (semResposta.length === 0) return null;
            return (
              <BlocoSemResposta
                membros={semResposta}
                onMarcar={(jogadorId, funcao) =>
                  registrarPresenca('confirmado', { jogadorId, funcao })
                }
              />
            );
          })()}
      </section>

      {/* Convidados */}
      <section className="mt-10">
        <h2 className="border-b border-dotted border-border-strong pb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
          Convidados ({partida.convidados.length})
        </h2>
        <p className="mt-2 text-xs text-text-tertiary">
          Jogadores chamados só pra essa partida — não viram membros fixos da pelada.
        </p>

        {partida.convidados.length > 0 && (
          <ul className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
            {partida.convidados.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 border border-border bg-panel px-3 py-2"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[#1C2027] font-display text-sm">
                  {c.jogador.avatarInicial}
                </span>
                <span className="flex-1 text-sm">
                  {c.jogador.nome}
                  <span className="ml-2 text-[10px] font-bold uppercase text-dourado">
                    convidado
                  </span>
                </span>
                {souAdmin && partida.status !== 'finalizada' && (
                  <button
                    onClick={async () => {
                      if (!confirm(`Remover ${c.jogador.nome} da partida?`)) return;
                      try {
                        await api.delete(
                          `/partidas/${partida.id}/convidados/${c.jogador.id}`,
                          { auth: true },
                        );
                        await carregar();
                      } catch (err) {
                        setErro(isApiError(err) ? err.mensagem : 'Erro');
                      }
                    }}
                    className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary hover:text-coral"
                  >
                    Remover
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {souAdmin && partida.status !== 'finalizada' && pelada && (
          <FormConvidar
            partidaId={partida.id}
            peladaId={pelada.id}
            onConvidado={carregar}
          />
        )}
      </section>

      {/* Tesouraria */}
      {tesouraria && pelada && (
        <SecaoTesouraria
          partidaId={partida.id}
          peladaSlug={pelada.slug}
          souAdmin={souAdmin}
          tesouraria={tesouraria}
          onMudou={carregar}
        />
      )}

      {/* Sorteio */}
      {souAdmin && partida.status !== 'finalizada' && pelada && (
        <section className="mt-10">
          <h2 className="border-b border-dotted border-border-strong pb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            Sorteio
          </h2>
          <p className="mt-3 text-xs text-text-tertiary">
            Cada time recebe até {pelada.goleirosPorTime} goleiro
            {pelada.goleirosPorTime === 1 ? '' : 's'} + {pelada.jogadoresPorTime - pelada.goleirosPorTime} de linha.
            Se faltar goleiro, os disponíveis ficam fixos e os demais times jogam sem.
          </p>
          <div className="mt-3">
            <Botao onClick={() => sortear(pelada.quantidadeTimes)}>
              Sortear em {pelada.quantidadeTimes} times
            </Botao>
          </div>
        </section>
      )}

      {/* Times */}
      {partida.times.length > 0 && (
        <section className="mt-10">
          <h2 className="border-b border-dotted border-border-strong pb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            Times
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {partida.times.map((t) => (
              <TimeCard key={t.id} time={t} />
            ))}
          </div>
        </section>
      )}

      {/* Resultado */}
      {souAdmin && partida.status !== 'finalizada' && (
        <FormularioResultado
          partida={partida}
          onSalvo={async () => {
            await carregar();
            setAviso('Resultado registrado.');
          }}
        />
      )}

      {partida.status === 'finalizada' && partida.estatisticas.length > 0 && (
        <section className="mt-10">
          <h2 className="border-b border-dotted border-border-strong pb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
            Destaques
          </h2>
          <ul className="mt-4 flex flex-col gap-2">
            {partida.estatisticas.map((e) => (
              <li key={e.id} className="flex items-center gap-3 border border-border bg-panel px-3 py-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[#1C2027] font-display text-sm">
                  {e.jogador.avatarInicial}
                </span>
                <span className="flex-1 text-sm">{e.jogador.nome}</span>
                <span className="text-xs text-text-secondary">
                  {e.gols > 0 && `${e.gols}⚽ `}
                  {e.assistencias > 0 && `${e.assistencias}🅰 `}
                  {e.foiMvp && '👑 MVP'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function BadgePresenca({ status }: { status: StatusPresenca }) {
  const map: Record<StatusPresenca, { label: string; classe: string }> = {
    confirmado: { label: 'Confirmado', classe: 'text-accent' },
    recusado: { label: 'Não vai', classe: 'text-text-tertiary' },
    lista_espera: { label: 'Espera', classe: 'text-dourado' },
  };
  const c = map[status];
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider ${c.classe}`}>{c.label}</span>
  );
}


const CORES_ROLE = {
  dourado: {
    borda: 'border-dourado/40',
    fundoHeader: 'bg-dourado/10',
    texto: 'text-dourado',
  },
  accent: {
    borda: 'border-accent/40',
    fundoHeader: 'bg-accent/10',
    texto: 'text-accent',
  },
} as const;

const LIMITE_PREVIEW = 5;

function BlocoRole({
  icone,
  titulo,
  cor,
  confirmados,
  capacidade,
}: {
  icone: React.ReactNode;
  titulo: string;
  cor: keyof typeof CORES_ROLE;
  confirmados: PresencaJogador[];
  capacidade: number;
}) {
  const paleta = CORES_ROLE[cor];
  const [expandido, setExpandido] = useState(false);
  // Ordena por data de resposta (quem confirmou primeiro fica em cima)
  const ordenados = [...confirmados].sort(
    (a, b) => new Date(a.respondidoEm).getTime() - new Date(b.respondidoEm).getTime(),
  );
  const vagasVazias = Math.max(0, capacidade - ordenados.length);
  const podeColapsar = ordenados.length > LIMITE_PREVIEW;
  const visiveis = expandido || !podeColapsar ? ordenados : ordenados.slice(0, LIMITE_PREVIEW);
  const ocultos = ordenados.length - visiveis.length;

  return (
    <div className={`border ${paleta.borda} bg-panel`}>
      <div className={`flex items-center gap-2 border-b border-border ${paleta.fundoHeader} px-3 py-2`}>
        <span className={paleta.texto}>{icone}</span>
        <span className={`text-[11px] font-bold uppercase tracking-wider ${paleta.texto}`}>
          {titulo}
        </span>
        <span className="ml-auto font-display text-sm">
          <span className={paleta.texto}>{ordenados.length}</span>
          <span className="text-text-tertiary">/{capacidade}</span>
        </span>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {visiveis.map((p) => (
          <LinhaPresenca key={p.id} presenca={p} />
        ))}
        {/* Vagas vazias só aparecem quando a lista está totalmente expandida,
            pra não empurrar o botão de "ver todos" pra longe. */}
        {(!podeColapsar || expandido) &&
          Array.from({ length: vagasVazias }).map((_, i) => (
            <li
              key={`vaga-${i}`}
              className="flex items-center gap-3 px-3 py-2 text-text-tertiary"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full border border-dashed border-border-strong text-xs">
                ·
              </span>
              <span className="text-xs italic">Vaga aberta</span>
            </li>
          ))}
        {capacidade === 0 && ordenados.length === 0 && (
          <li className="px-3 py-3 text-xs text-text-tertiary">Sem vagas configuradas.</li>
        )}
      </ul>
      {podeColapsar && (
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          className={`w-full border-t border-border px-3 py-2 text-[11px] font-bold uppercase tracking-wider ${paleta.texto} hover:bg-panel-2`}
        >
          {expandido ? 'Mostrar menos' : `Ver todos os jogadores (+${ocultos})`}
        </button>
      )}
    </div>
  );
}

function LinhaPresenca({ presenca, muted = false }: { presenca: PresencaJogador; muted?: boolean }) {
  const detalhe =
    presenca.funcao === 'goleiro'
      ? 'Goleiro'
      : presenca.posicaoLinha
        ? ROTULOS_POSICAO_LINHA[presenca.posicaoLinha]
        : 'Linha';
  return (
    <li className={`flex items-center gap-3 px-3 py-2 ${muted ? 'opacity-60' : ''}`}>
      <span className="grid h-8 w-8 place-items-center rounded-full bg-[#1C2027] font-display text-sm">
        {presenca.jogador.avatarInicial}
      </span>
      <span className="flex-1 text-sm">{presenca.jogador.nome}</span>
      <span className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
        {detalhe}
      </span>
    </li>
  );
}

function BlocoReserva({ presencas }: { presencas: PresencaJogador[] }) {
  // Ordena por data de resposta — quem chegou primeiro entra antes.
  const ordenados = [...presencas].sort(
    (a, b) => new Date(a.respondidoEm).getTime() - new Date(b.respondidoEm).getTime(),
  );
  return (
    <div className="mt-4 border border-dourado/40 bg-panel">
      <div className="flex items-center gap-2 border-b border-border bg-dourado/10 px-3 py-2">
        <span className="text-dourado">
          <IconeReserva />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-dourado">
          Reserva
        </span>
        <span className="ml-auto font-display text-sm text-dourado">{ordenados.length}</span>
      </div>
      <p className="border-b border-border px-3 py-2 text-xs text-text-tertiary">
        Entram automaticamente conforme abrem vagas na função escolhida (por ordem de resposta).
      </p>
      <ol className="flex flex-col divide-y divide-border">
        {ordenados.map((p, i) => (
          <li key={p.id} className="flex items-center gap-3 px-3 py-2">
            <span className="w-4 text-center font-display text-xs text-text-tertiary">
              {i + 1}
            </span>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#1C2027] font-display text-sm">
              {p.jogador.avatarInicial}
            </span>
            <span className="flex-1 text-sm">{p.jogador.nome}</span>
            <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${p.funcao === 'goleiro' ? 'text-dourado' : 'text-accent'}`}>
              {p.funcao === 'goleiro' ? <IconeGoleiro className="h-3 w-3" /> : <IconeLinha className="h-3 w-3" />}
              {p.funcao === 'goleiro'
                ? 'Goleiro'
                : p.posicaoLinha
                  ? ROTULOS_POSICAO_LINHA[p.posicaoLinha]
                  : 'Linha'}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function BlocoRecusados({ presencas }: { presencas: PresencaJogador[] }) {
  return (
    <div className="mt-4 border border-border bg-panel/60">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-text-tertiary">
          <IconeRecusado />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
          Não vai
        </span>
        <span className="ml-auto font-display text-sm text-text-tertiary">{presencas.length}</span>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {presencas.map((p) => (
          <LinhaPresenca key={p.id} presenca={p} muted />
        ))}
      </ul>
    </div>
  );
}

function BlocoSemResposta({
  membros,
  onMarcar,
}: {
  membros: MembroDTO[];
  onMarcar: (jogadorId: string, funcao: FuncaoPartida) => void;
}) {
  return (
    <div className="mt-4 border border-dashed border-border-strong bg-panel/30">
      <div className="flex items-center gap-2 border-b border-dashed border-border-strong px-3 py-2">
        <span className="text-text-tertiary">
          <IconeInterrogacao />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
          Sem função definida
        </span>
        <span className="ml-auto font-display text-sm text-text-tertiary">{membros.length}</span>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {membros.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-text-tertiary">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#1C2027] font-display text-sm">
              {m.jogador.avatarInicial}
            </span>
            <span className="flex-1 text-sm">{m.jogador.nome}</span>
            <button
              onClick={() => onMarcar(m.jogador.id, 'goleiro')}
              className="flex items-center gap-1 border border-border-strong px-2 py-1 text-[10px] font-bold uppercase tracking-wider hover:border-dourado hover:text-dourado"
            >
              <IconeGoleiro className="h-3 w-3" />
              Goleiro
            </button>
            <button
              onClick={() => onMarcar(m.jogador.id, 'linha')}
              className="flex items-center gap-1 border border-border-strong px-2 py-1 text-[10px] font-bold uppercase tracking-wider hover:border-accent hover:text-accent"
            >
              <IconeLinha className="h-3 w-3" />
              Linha
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormMinhaPresenca({
  minhaPresenca,
  funcaoPreferida,
  posicaoPreferida,
  onEnviar,
}: {
  minhaPresenca: PresencaJogador | null;
  funcaoPreferida: FuncaoPartida | null;
  posicaoPreferida: PosicaoLinha | null;
  onEnviar: (
    status: StatusPresenca,
    funcao: FuncaoPartida,
    posicaoLinha: PosicaoLinha | null,
  ) => void;
}) {
  // Prioridade: presença atual > preferência do perfil > 'linha'
  const [funcao, setFuncao] = useState<FuncaoPartida>(
    minhaPresenca?.funcao ?? funcaoPreferida ?? 'linha',
  );
  const [posicao, setPosicao] = useState<PosicaoLinha | ''>(
    minhaPresenca?.posicaoLinha ?? posicaoPreferida ?? '',
  );

  const jaConfirmado = minhaPresenca?.status === 'confirmado';
  const naReserva = minhaPresenca?.status === 'lista_espera';

  return (
    <div className="mt-4 border border-border-strong bg-panel-2 p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
        Sua presença
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden border border-border-strong">
          {(['linha', 'goleiro'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFuncao(f)}
              className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold uppercase tracking-wider ${funcao === f
                  ? f === 'goleiro'
                    ? 'bg-dourado text-black'
                    : 'bg-accent text-black'
                  : 'bg-panel text-text-secondary'
                }`}
            >
              {f === 'linha' ? <IconeLinha className="h-3.5 w-3.5" /> : <IconeGoleiro className="h-3.5 w-3.5" />}
              {f === 'linha' ? 'Linha' : 'Goleiro'}
            </button>
          ))}
        </div>
        {funcao === 'linha' && (
          <select
            value={posicao}
            onChange={(e) => setPosicao(e.target.value as PosicaoLinha | '')}
            className="h-9 border border-border-strong bg-panel px-3 text-xs outline-none focus:border-accent"
          >
            <option value="">Posição (opcional)</option>
            {POSICOES_LINHA.map((p) => (
              <option key={p} value={p}>
                {ROTULOS_POSICAO_LINHA[p]}
              </option>
            ))}
          </select>
        )}
        <Botao
          variante="secundario"
          onClick={() => onEnviar('confirmado', funcao, funcao === 'linha' && posicao ? posicao : null)}
        >
          {jaConfirmado ? 'Atualizar' : 'Confirmar'}
        </Botao>
        <Botao variante="secundario" onClick={() => onEnviar('recusado', funcao, null)}>
          Não vou
        </Botao>
      </div>
      {naReserva && (
        <p className="mt-2 text-xs text-dourado">
          Vaga da sua função lotou — você está na reserva e entra automático se abrir vaga.
        </p>
      )}
    </div>
  );
}

function TimeCard({ time }: { time: TimeDTO }) {
  return (
    <div className="border border-border bg-panel p-4">
      <p className="font-display text-lg uppercase">{time.nome}</p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {time.jogadores.map((tp) => (
          <li key={tp.id} className="flex items-center gap-2 text-sm">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-[#1C2027] font-display text-xs">
              {tp.jogador.avatarInicial}
            </span>
            {tp.jogador.nome}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormularioResultado({
  partida,
  onSalvo,
}: {
  partida: PartidaDetalhe;
  onSalvo: () => void;
}) {
  const [placarA, setPlacarA] = useState(0);
  const [placarB, setPlacarB] = useState(0);
  const [eventos, setEventos] = useState<Record<string, EventoEstatistica>>({});
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const confirmados = partida.presencas.filter((p) => p.status === 'confirmado');

  const setEvento = (jogadorId: string, patch: Partial<EventoEstatistica>) => {
    setEventos((atual) => {
      const base = atual[jogadorId] ?? { jogadorId, gols: 0, assistencias: 0, foiMvp: false };
      return { ...atual, [jogadorId]: { ...base, ...patch } };
    });
  };

  const salvar = async () => {
    setEnviando(true);
    setErro(null);
    try {
      const body: RegistrarResultadoBody = {
        placarTimeA: placarA,
        placarTimeB: placarB,
        eventos: Object.values(eventos).filter(
          (e) => e.gols > 0 || e.assistencias > 0 || e.foiMvp,
        ),
      };
      await api.post(`/partidas/${partida.id}/resultado`, body, { auth: true });
      onSalvo();
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="mt-10 border border-border-strong bg-panel-2 p-5">
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
        Registrar resultado
      </h2>
      <div className="mt-4 flex items-center justify-center gap-4">
        <NumeroCampo valor={placarA} onChange={setPlacarA} rotulo="Time A" />
        <span className="text-2xl text-text-tertiary">×</span>
        <NumeroCampo valor={placarB} onChange={setPlacarB} rotulo="Time B" />
      </div>

      <p className="mt-6 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
        Eventos por jogador (opcional)
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {confirmados.map((p) => {
          const e = eventos[p.jogadorId] ?? { jogadorId: p.jogadorId, gols: 0, assistencias: 0, foiMvp: false };
          return (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-3 border border-border bg-panel px-3 py-2"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[#1C2027] font-display text-xs">
                {p.jogador.avatarInicial}
              </span>
              <span className="flex-1 text-sm">{p.jogador.nome}</span>
              <LabelledStepper
                rotulo="Gols"
                valor={e.gols}
                onChange={(v) => setEvento(p.jogadorId, { gols: v })}
              />
              <LabelledStepper
                rotulo="Assist"
                valor={e.assistencias}
                onChange={(v) => setEvento(p.jogadorId, { assistencias: v })}
              />
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={e.foiMvp}
                  onChange={(ev) => setEvento(p.jogadorId, { foiMvp: ev.target.checked })}
                  className="h-4 w-4 accent-accent"
                />
                MVP
              </label>
            </li>
          );
        })}
      </ul>

      {erro && <p className="mt-3 text-sm text-coral">{erro}</p>}
      <div className="mt-4">
        <Botao onClick={salvar} carregando={enviando}>
          Salvar resultado
        </Botao>
      </div>
    </section>
  );
}

function NumeroCampo({
  rotulo,
  valor,
  onChange,
}: {
  rotulo: string;
  valor: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">{rotulo}</p>
      <input
        type="number"
        min={0}
        max={50}
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-16 w-20 border border-border-strong bg-panel text-center font-display text-4xl outline-none focus:border-accent"
      />
    </div>
  );
}

function LabelledStepper({
  rotulo,
  valor,
  onChange,
}: {
  rotulo: string;
  valor: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-text-tertiary">{rotulo}</span>
      <button
        onClick={() => onChange(Math.max(0, valor - 1))}
        className="grid h-6 w-6 place-items-center border border-border-strong bg-panel"
        type="button"
      >
        −
      </button>
      <span className="w-4 text-center">{valor}</span>
      <button
        onClick={() => onChange(valor + 1)}
        className="grid h-6 w-6 place-items-center border border-border-strong bg-panel"
        type="button"
      >
        +
      </button>
    </div>
  );
}

function FormConvidar({
  partidaId,
  peladaId,
  onConvidado,
}: {
  partidaId: string;
  peladaId: string;
  onConvidado: () => Promise<PartidaDetalhe> | Promise<void>;
}) {
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<
    BuscarJogadoresResponse['itens']
  >([]);
  const [selecionado, setSelecionado] = useState<BuscarJogadoresResponse['itens'][number] | null>(null);
  const [quantidade, setQuantidade] = useState(1);
  const [buscando, setBuscando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!termo.trim() || selecionado) {
      setResultados([]);
      return;
    }
    let cancelado = false;
    const timer = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await api.get<BuscarJogadoresResponse>(
          `/jogadores/?q=${encodeURIComponent(termo.trim())}&limite=8&excluirPeladaId=${peladaId}`,
        );
        if (!cancelado) setResultados(r.itens);
      } catch {
        /* ignore */
      } finally {
        if (!cancelado) setBuscando(false);
      }
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [termo, peladaId, selecionado]);

  const convidar = async () => {
    if (!selecionado) return;
    setErro(null);
    setAviso(null);
    setEnviando(true);
    try {
      const body: ConvidarParaPartidaBody = {
        jogadorId: selecionado.id,
        proximasPartidas: quantidade,
      };
      const r = await api.post<ConvidarParaPartidaResponse>(
        `/partidas/${partidaId}/convidados`,
        body,
        { auth: true },
      );
      setAviso(
        r.criados.length === 1
          ? `${selecionado.nome} convidado.`
          : `${selecionado.nome} convidado em ${r.criados.length} partidas.`,
      );
      setTermo('');
      setSelecionado(null);
      setQuantidade(1);
      await onConvidado();
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro ao convidar');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="mt-6 border border-border bg-panel-2 p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
        Convidar jogador
      </p>
      {selecionado ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 border border-accent bg-accent/10 px-3 py-2 text-sm text-accent">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-[#1C2027] font-display text-xs text-text">
              {selecionado.avatarInicial}
            </span>
            {selecionado.nome}
            {selecionado.apelido && (
              <span className="text-text-tertiary">({selecionado.apelido})</span>
            )}
            <button
              onClick={() => setSelecionado(null)}
              className="ml-1 text-[10px] font-bold uppercase text-text-tertiary hover:text-coral"
            >
              ✕
            </button>
          </span>
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            Convidar para as próximas
            <input
              type="number"
              min={1}
              max={20}
              value={quantidade}
              onChange={(e) => setQuantidade(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              className="h-8 w-14 border border-border-strong bg-panel text-center text-sm outline-none focus:border-accent"
            />
            partida{quantidade > 1 ? 's' : ''}
          </label>
          <Botao onClick={convidar} carregando={enviando}>
            Confirmar convite
          </Botao>
        </div>
      ) : (
        <div className="mt-3">
          <input
            type="search"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar jogador por nome ou apelido…"
            className="w-full border border-border-strong bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {termo.trim().length > 0 && (
            <ul className="mt-2 max-h-56 overflow-y-auto border border-border">
              {buscando && (
                <li className="px-3 py-2 text-xs text-text-tertiary">Buscando…</li>
              )}
              {!buscando && resultados.length === 0 && (
                <li className="px-3 py-2 text-xs text-text-tertiary">Nada encontrado.</li>
              )}
              {resultados.map((j) => (
                <li key={j.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelecionado(j);
                      setResultados([]);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-panel"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-[#1C2027] font-display text-xs">
                      {j.avatarInicial}
                    </span>
                    <span className="flex-1">
                      {j.nome}
                      {j.apelido && (
                        <span className="ml-2 text-text-tertiary">({j.apelido})</span>
                      )}
                    </span>
                    {j.cidadeAtual && (
                      <span className="text-xs text-text-tertiary">{j.cidadeAtual}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {erro && <p className="mt-2 text-sm text-coral">{erro}</p>}
      {aviso && <p className="mt-2 text-sm text-accent">{aviso}</p>}
    </div>
  );
}

// suppress unused var warning for PresencaJogador / ConvidadoPartidaDTO
export type { PresencaJogador, ConvidadoPartidaDTO };

// ---------------------------------------------------------------------------
// Tesouraria
// ---------------------------------------------------------------------------

function formatarReais(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function rotuloTipo(tipo: TipoCusto): string {
  return tipo === 'por_jogador' ? 'por jogador' : 'rateado';
}

function SecaoTesouraria({
  partidaId,
  peladaSlug,
  souAdmin,
  tesouraria,
  onMudou,
}: {
  partidaId: string;
  peladaSlug: string;
  souAdmin: boolean;
  tesouraria: TesourariaPartidaResponse;
  onMudou: () => Promise<PartidaDetalhe>;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const { resumo, custosRecorrentes, custosPartida, devedores } = tesouraria;
  const totalArrecadado = devedores
    .filter((d) => d.pago)
    .reduce((acc, d) => acc + (d.pagamento?.valorCentavos ?? 0), 0);
  const totalDevido = resumo.valorPorJogadorCentavos * devedores.length;

  const remover = async (custoId: string) => {
    if (!confirm('Remover este custo?')) return;
    setErro(null);
    try {
      await api.delete(`/custos-partida/${custoId}`, { auth: true });
      await onMudou();
    } catch (e) {
      setErro(isApiError(e) ? e.mensagem : 'Erro ao remover');
    }
  };

  const marcarPago = async (jogadorId: string) => {
    setErro(null);
    try {
      const body: MarcarPagamentoBody = { jogadorId };
      await api.post(`/partidas/${partidaId}/pagamentos`, body, { auth: true });
      await onMudou();
    } catch (e) {
      setErro(isApiError(e) ? e.mensagem : 'Erro ao marcar');
    }
  };

  const desmarcar = async (jogadorId: string) => {
    setErro(null);
    try {
      await api.delete(`/partidas/${partidaId}/pagamentos/${jogadorId}`, { auth: true });
      await onMudou();
    } catch (e) {
      setErro(isApiError(e) ? e.mensagem : 'Erro ao desmarcar');
    }
  };

  return (
    <section className="mt-10">
      <h2 className="border-b border-dotted border-border-strong pb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
        Tesouraria
      </h2>

      <CardValorPorJogador resumo={resumo} />

      {devedores.length === 0 && (
        <p className="mt-4 text-xs text-text-tertiary">
          Confirme jogadores na presença para o valor por jogador ser calculado.
        </p>
      )}

      {erro && <p className="mt-3 text-sm text-coral">{erro}</p>}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ListaCustos
          custosRecorrentes={custosRecorrentes}
          custosPartida={custosPartida}
          souAdmin={souAdmin}
          peladaSlug={peladaSlug}
          onRemover={remover}
        />
        <TabelaPagamentos
          devedores={devedores}
          resumo={resumo}
          totalArrecadado={totalArrecadado}
          totalDevido={totalDevido}
          souAdmin={souAdmin}
          onMarcar={marcarPago}
          onDesmarcar={desmarcar}
        />
      </div>

      {souAdmin && (
        <FormAdicionarCusto partidaId={partidaId} onCriado={onMudou} />
      )}
    </section>
  );
}

function CardValorPorJogador({ resumo }: { resumo: TesourariaPartidaResponse['resumo'] }) {
  return (
    <div className="mt-4 border border-border-strong bg-panel-2 p-5">
      <div className="flex items-baseline gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
          Valor por jogador
        </p>
        {resumo.estimado && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-dourado">
            estimado
          </span>
        )}
      </div>
      <p className="mt-2 font-display text-5xl leading-none text-accent">
        {resumo.estimado ? '~' : ''}
        {formatarReais(resumo.valorPorJogadorCentavos)}
      </p>
      <p className="mt-3 text-xs text-text-tertiary">
        {formatarReais(resumo.totalPorJogadorCentavos)} fixo
        {resumo.totalRateadoCentavos > 0 && (
          <>
            {' '}
            + {formatarReais(resumo.totalRateadoCentavos)} rateado entre{' '}
            {resumo.estimado
              ? 'os jogadores previstos'
              : `${resumo.nDivisores} confirmado${resumo.nDivisores === 1 ? '' : 's'}`}
          </>
        )}
      </p>
      {resumo.estimado && (
        <p className="mt-2 text-[11px] text-text-tertiary">
          Ninguém confirmou ainda — valor ajusta quando começarem a confirmar.
        </p>
      )}
    </div>
  );
}

function ListaCustos({
  custosRecorrentes,
  custosPartida,
  souAdmin,
  peladaSlug,
  onRemover,
}: {
  custosRecorrentes: TesourariaPartidaResponse['custosRecorrentes'];
  custosPartida: CustoPartidaDTO[];
  souAdmin: boolean;
  peladaSlug: string;
  onRemover: (id: string) => void;
}) {
  return (
    <div className="border border-border bg-panel p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
        Custos
      </p>

      <ul className="mt-3 flex flex-col divide-y divide-border">
        {custosRecorrentes.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="flex-1">
              {c.nome}
              <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-dourado">
                recorrente
              </span>
            </span>
            <span className="text-xs text-text-tertiary">{rotuloTipo(c.tipo)}</span>
            <span className="w-20 text-right font-mono">{formatarReais(c.valorCentavos)}</span>
          </li>
        ))}
        {custosPartida.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="flex-1">{c.nome}</span>
            <span className="text-xs text-text-tertiary">{rotuloTipo(c.tipo)}</span>
            <span className="w-20 text-right font-mono">{formatarReais(c.valorCentavos)}</span>
            {souAdmin && (
              <button
                onClick={() => onRemover(c.id)}
                className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary hover:text-coral"
              >
                ✕
              </button>
            )}
          </li>
        ))}
        {custosRecorrentes.length === 0 && custosPartida.length === 0 && (
          <li className="py-2 text-xs text-text-tertiary">Sem custos cadastrados.</li>
        )}
      </ul>

      {souAdmin && (
        <Link
          href={{ pathname: `/peladas/${peladaSlug}/tesouraria` }}
          className="mt-3 inline-block text-[11px] font-bold uppercase tracking-wider text-accent hover:underline"
        >
          Gerenciar custos recorrentes →
        </Link>
      )}
    </div>
  );
}

function TabelaPagamentos({
  devedores,
  resumo,
  totalArrecadado,
  totalDevido,
  souAdmin,
  onMarcar,
  onDesmarcar,
}: {
  devedores: LinhaDevedorDTO[];
  resumo: TesourariaPartidaResponse['resumo'];
  totalArrecadado: number;
  totalDevido: number;
  souAdmin: boolean;
  onMarcar: (jogadorId: string) => void;
  onDesmarcar: (jogadorId: string) => void;
}) {
  return (
    <div className="border border-border bg-panel p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
        Pagamentos ({devedores.filter((d) => d.pago).length}/{devedores.length})
      </p>
      <p className="mt-1 text-xs text-text-tertiary">
        {formatarReais(totalArrecadado)} arrecadado de {formatarReais(totalDevido)}
      </p>

      <ul className="mt-3 flex flex-col divide-y divide-border">
        {devedores.map((d) => (
          <li key={d.jogador.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#1C2027] font-display text-xs">
              {d.jogador.avatarInicial}
            </span>
            <span className="flex-1">
              {d.jogador.nome}
              {d.origem === 'convidado' && (
                <span className="ml-2 text-[10px] font-bold uppercase text-dourado">
                  convidado
                </span>
              )}
            </span>
            <span className="w-16 text-right font-mono text-xs">
              {formatarReais(
                d.pago ? d.pagamento!.valorCentavos : d.valorDevidoCentavos,
              )}
            </span>
            {d.pago ? (
              <button
                onClick={() => souAdmin && onDesmarcar(d.jogador.id)}
                disabled={!souAdmin}
                className="text-[10px] font-bold uppercase tracking-wider text-accent disabled:cursor-default"
                title={souAdmin ? 'Clique para desmarcar' : undefined}
              >
                Pago ✓
              </button>
            ) : souAdmin ? (
              <button
                onClick={() => onMarcar(d.jogador.id)}
                className="border border-border-strong bg-panel-2 px-2 py-1 text-[10px] font-bold uppercase tracking-wider hover:border-accent hover:text-accent"
              >
                Marcar pago
              </button>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
                Devendo
              </span>
            )}
          </li>
        ))}
        {devedores.length === 0 && (
          <li className="py-2 text-xs text-text-tertiary">
            Ninguém confirmado ainda — nada pra cobrar.
          </li>
        )}
      </ul>

      {resumo.nDivisores > 0 && resumo.valorPorJogadorCentavos === 0 && (
        <p className="mt-2 text-xs text-text-tertiary">
          Nenhum custo cadastrado — pelada de graça hoje 🍻
        </p>
      )}
    </div>
  );
}

function FormAdicionarCusto({
  partidaId,
  onCriado,
}: {
  partidaId: string;
  onCriado: () => Promise<PartidaDetalhe>;
}) {
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<TipoCusto>('rateado');
  const [reais, setReais] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const valor = Number(reais.replace(',', '.'));
    if (!Number.isFinite(valor) || valor < 0) {
      setErro('Valor inválido');
      return;
    }
    setEnviando(true);
    try {
      const body: CriarCustoPartidaBody = {
        nome: nome.trim(),
        tipo,
        valorCentavos: Math.round(valor * 100),
      };
      await api.post(`/partidas/${partidaId}/custos`, body, { auth: true });
      setNome('');
      setReais('');
      await onCriado();
    } catch (e) {
      setErro(isApiError(e) ? e.mensagem : 'Erro ao adicionar');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form
      onSubmit={enviar}
      className="mt-6 border border-border bg-panel-2 p-4"
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
        Adicionar custo desta partida
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto_auto]">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Bola nova, juiz…"
          required
          minLength={1}
          maxLength={80}
          className="h-10 border border-border-strong bg-panel px-3 text-sm outline-none focus:border-accent"
        />
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoCusto)}
          className="h-10 border border-border-strong bg-panel px-3 text-sm outline-none focus:border-accent"
        >
          <option value="rateado">Rateado (total)</option>
          <option value="por_jogador">Por jogador</option>
        </select>
        <div className="flex items-stretch border border-border-strong bg-panel">
          <span className="grid place-items-center px-3 text-xs text-text-tertiary">R$</span>
          <input
            value={reais}
            onChange={(e) => setReais(e.target.value)}
            placeholder="30,00"
            inputMode="decimal"
            required
            className="h-10 w-24 bg-transparent pr-3 text-sm outline-none"
          />
        </div>
        <Botao type="submit" carregando={enviando}>
          Adicionar
        </Botao>
      </div>
      {erro && <p className="mt-2 text-sm text-coral">{erro}</p>}
    </form>
  );
}
