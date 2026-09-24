'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import type {
  AdicionarMembroBody,
  EditarJogadorBody,
  EditarPeladaBody,
  FuncaoPartida,
  JogadorDTO,
  LinkConvitePublicoDTO,
  ListarMembrosResponse,
  MembroDTO,
  PeladaDTO,
  PosicaoLinha,
} from '@peladafc/contracts';
import { POSICOES_LINHA, ROTULOS_POSICAO_LINHA } from '@peladafc/contracts';
import { Botao } from '@/components/botao';
import { Campo } from '@/components/campo';
import { IconeGoleiro, IconeInterrogacao, IconeLinha } from '@/components/icones-funcao';
import { api, ApiError, formatarTelefone, soDigitos } from '@/lib/api';
import { isApiError, useAuth } from '@/lib/auth-context';

export default function GerenciarPeladaPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { estado } = useAuth();

  const [pelada, setPelada] = useState<PeladaDTO | null>(null);
  const [membros, setMembros] = useState<MembroDTO[] | null>(null);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);

  // Form: adicionar novo jogador (modo simples)
  const [nome, setNome] = useState('');
  const [telefoneMascarado, setTelefoneMascarado] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    if (estado.status === 'anonimo') router.replace('/entrar');
  }, [estado.status, router]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const p = await api.get<PeladaDTO>(`/peladas/${slug}`, { auth: true });
        if (cancelado) return;
        setPelada(p);
        const m = await api.get<ListarMembrosResponse>(`/peladas/${p.id}/membros`);
        if (!cancelado) setMembros(m.itens);
      } catch (e) {
        if (cancelado) return;
        setErroCarregar(
          e instanceof ApiError && e.status === 404
            ? 'Pelada não encontrada'
            : e instanceof Error
              ? e.message
              : 'Erro ao carregar',
        );
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [slug]);

  const adicionar = async (e: FormEvent) => {
    e.preventDefault();
    if (!pelada) return;
    setErroForm(null);
    setSucesso(null);
    setEnviando(true);
    try {
      const body: AdicionarMembroBody = {
        modo: 'novo',
        nome: nome.trim(),
        ...(telefoneMascarado.trim() && { telefone: soDigitos(telefoneMascarado) }),
        papel: 'membro',
      };
      const novo = await api.post<MembroDTO>(`/peladas/${pelada.id}/membros`, body, {
        auth: true,
      });
      setMembros((atuais) => (atuais ? [...atuais, novo] : [novo]));
      setSucesso(`${novo.jogador.nome} adicionado`);
      setNome('');
      setTelefoneMascarado('');
    } catch (err) {
      setErroForm(isApiError(err) ? err.mensagem : 'Erro ao adicionar');
    } finally {
      setEnviando(false);
    }
  };

  const remover = async (jogadorId: string, nomeJogador: string) => {
    if (!pelada) return;
    if (!confirm(`Remover ${nomeJogador} da pelada?`)) return;
    try {
      await api.delete(`/peladas/${pelada.id}/membros/${jogadorId}`, { auth: true });
      setMembros((atuais) => atuais?.filter((m) => m.jogadorId !== jogadorId) ?? null);
    } catch (err) {
      alert(isApiError(err) ? err.mensagem : 'Erro ao remover');
    }
  };

  if (erroCarregar) {
    return (
      <main className="mx-auto max-w-container px-16 py-16">
        <h1 className="font-display text-4xl uppercase">{erroCarregar}</h1>
        <Link href="/peladas" className="mt-4 inline-block text-accent hover:underline">
          ← Voltar
        </Link>
      </main>
    );
  }

  if (!pelada) {
    return (
      <main className="mx-auto max-w-container px-16 py-16 text-text-tertiary">Carregando…</main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div>
        <Link
          href={{ pathname: `/peladas/${pelada.slug}` }}
          className="text-xs text-text-tertiary hover:text-text"
        >
          ← Voltar para a pelada
        </Link>
        <h1 className="mt-2 font-display text-5xl uppercase leading-none">Gerenciar</h1>
        <p className="mt-2 text-sm text-text-secondary">{pelada.nome}</p>
      </div>

      <LinkConvite pelada={pelada} />

      <FormatoPelada
        pelada={pelada}
        onAtualizado={(p) => setPelada(p)}
      />

      <section className="mt-10">
        <h2 className="border-b border-dotted border-border-strong pb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
          Adicionar jogador
        </h2>
        <p className="mt-3 text-sm text-text-tertiary">
          Cadastro simples — só nome e (opcionalmente) telefone. Se essa pessoa criar conta depois
          usando o mesmo telefone, o histórico será automaticamente vinculado.
        </p>
        <form onSubmit={adicionar} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Campo
            rotulo="Nome"
            name="nomeJogador"
            required
            minLength={2}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Rodrigo"
          />
          <Campo
            rotulo="Telefone (opcional)"
            type="tel"
            name="telefoneJogador"
            inputMode="numeric"
            value={telefoneMascarado}
            onChange={(e) => setTelefoneMascarado(formatarTelefone(e.target.value))}
            placeholder="(84) 99999-0000"
            auxiliar="Recomendado — permite vincular conta depois."
          />
          {erroForm && <p className="md:col-span-2 text-sm text-coral">{erroForm}</p>}
          {sucesso && <p className="md:col-span-2 text-sm text-accent">{sucesso}</p>}
          <div className="md:col-span-2">
            <Botao type="submit" carregando={enviando}>
              Adicionar
            </Botao>
          </div>
        </form>
      </section>

      <section className="mt-12">
        <h2 className="border-b border-dotted border-border-strong pb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
          Membros ({membros?.length ?? 0})
        </h2>
        {membros && (
          <ListasPorFuncao
            membros={membros}
            peladaCriadorUserId={pelada.criadoPorUserId}
            onRemover={(jogadorId, nome) => remover(jogadorId, nome)}
            onAtualizado={(mid, atualizado) =>
              setMembros((atuais) =>
                atuais
                  ? atuais.map((x) =>
                    x.id === mid ? { ...x, jogador: { ...x.jogador, ...atualizado } } : x,
                  )
                  : atuais,
              )
            }
          />
        )}
      </section>
    </main>
  );
}

function FormatoPelada({
  pelada,
  onAtualizado,
}: {
  pelada: PeladaDTO;
  onAtualizado: (p: PeladaDTO) => void;
}) {
  const [quantidadeTimes, setQuantidadeTimes] = useState(pelada.quantidadeTimes);
  const [jogadoresPorTime, setJogadoresPorTime] = useState(pelada.jogadoresPorTime);
  const [goleirosPorTime, setGoleirosPorTime] = useState(pelada.goleirosPorTime);
  const [tamanhoReserva, setTamanhoReserva] = useState(pelada.tamanhoReserva);
  const [goleirosPagam, setGoleirosPagam] = useState(pelada.goleirosPagam);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const alterou =
    quantidadeTimes !== pelada.quantidadeTimes ||
    jogadoresPorTime !== pelada.jogadoresPorTime ||
    goleirosPorTime !== pelada.goleirosPorTime ||
    tamanhoReserva !== pelada.tamanhoReserva ||
    goleirosPagam !== pelada.goleirosPagam;

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setSucesso(null);
    setEnviando(true);
    try {
      const body: EditarPeladaBody = {
        quantidadeTimes,
        jogadoresPorTime,
        goleirosPorTime,
        tamanhoReserva,
        goleirosPagam,
      };
      const atualizada = await api.put<PeladaDTO>(`/peladas/${pelada.id}`, body, { auth: true });
      onAtualizado(atualizada);
      setSucesso('Formato atualizado.');
    } catch (e) {
      setErro(isApiError(e) ? e.mensagem : 'Erro');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="mt-10">
      <h2 className="border-b border-dotted border-border-strong pb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
        Formato da partida
      </h2>
      <form onSubmit={salvar} className="mt-5 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Campo
            rotulo="Quantidade de times"
            type="number"
            name="quantidadeTimes"
            required
            min={2}
            max={8}
            value={quantidadeTimes}
            onChange={(e) => setQuantidadeTimes(Number(e.target.value))}
          />
          <Campo
            rotulo="Jogadores por time (incluindo goleiro)"
            type="number"
            name="jogadoresPorTime"
            required
            min={3}
            max={15}
            value={jogadoresPorTime}
            onChange={(e) => setJogadoresPorTime(Number(e.target.value))}
            auxiliar="Goleiro + Jogadores da linha"
          />
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
              Time com goleiro
            </span>
            <label className="flex h-11 items-center gap-2 border border-border-strong bg-panel px-3 text-sm">
              <input
                type="checkbox"
                checked={goleirosPorTime > 0}
                onChange={(e) => setGoleirosPorTime(e.target.checked ? 1 : 0)}
                className="h-4 w-4 accent-accent"
              />
              Cada time tem 1 goleiro
            </label>
          </div>
          <Campo
            rotulo="Tamanho da lista de espera"
            type="number"
            name="tamanhoReserva"
            required
            min={0}
            max={30}
            value={tamanhoReserva}
            onChange={(e) => setTamanhoReserva(Number(e.target.value))}
            auxiliar="Máximo na lista de espera"
          />
        </div>
        <p className="text-xs text-text-tertiary">
          Total por partida:{' '}
          <span className="font-bold text-text">
            {quantidadeTimes * jogadoresPorTime}
          </span>{' '}
          jogadores ({quantidadeTimes * goleirosPorTime} goleiros +{' '}
          {quantidadeTimes * Math.max(0, jogadoresPorTime - goleirosPorTime)} linha)
        </p>
        <label className="flex items-center gap-3 text-sm text-text">
          <input
            type="checkbox"
            checked={goleirosPagam}
            onChange={(e) => setGoleirosPagam(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Goleiros pagam custos (desmarcar se quem tá no gol não paga)
        </label>
        {erro && <p className="text-sm text-coral">{erro}</p>}
        {sucesso && <p className="text-sm text-accent">{sucesso}</p>}
        <div>
          <Botao type="submit" carregando={enviando} disabled={!alterou}>
            Salvar formato
          </Botao>
        </div>
      </form>
    </section>
  );
}

const LIMITE_PREVIEW_MEMBROS = 5;

function BlocoMembros({
  titulo,
  icone,
  cor,
  vazioTexto,
  membros,
  peladaCriadorUserId,
  onRemover,
  onAtualizado,
}: {
  titulo: string;
  icone: React.ReactNode;
  cor: 'dourado' | 'accent' | 'muted';
  vazioTexto: string;
  membros: MembroDTO[];
  peladaCriadorUserId: string;
  onRemover: (jogadorId: string, nome: string) => void;
  onAtualizado: (
    membroId: string,
    patch: { funcaoPreferida: FuncaoPartida | null; posicaoLinha: PosicaoLinha | null },
  ) => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const paleta =
    cor === 'dourado'
      ? { borda: 'border-dourado/40', header: 'bg-dourado/10', texto: 'text-dourado' }
      : cor === 'accent'
        ? { borda: 'border-accent/40', header: 'bg-accent/10', texto: 'text-accent' }
        : {
          borda: 'border-border-strong border-dashed',
          header: 'bg-panel-2',
          texto: 'text-text-tertiary',
        };
  const podeColapsar = membros.length > LIMITE_PREVIEW_MEMBROS;
  const visiveis =
    expandido || !podeColapsar ? membros : membros.slice(0, LIMITE_PREVIEW_MEMBROS);
  const ocultos = membros.length - visiveis.length;

  return (
    <div className={`border ${paleta.borda} bg-panel`}>
      <div className={`flex items-center gap-2 border-b border-border ${paleta.header} px-3 py-2`}>
        <span className={paleta.texto}>{icone}</span>
        <span className={`text-[11px] font-bold uppercase tracking-wider ${paleta.texto}`}>
          {titulo}
        </span>
        <span className={`ml-auto font-display text-sm ${paleta.texto}`}>{membros.length}</span>
      </div>
      {membros.length === 0 ? (
        <p className="px-3 py-3 text-xs text-text-tertiary">{vazioTexto}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {visiveis.map((m) => (
            <LinhaMembro
              key={m.id}
              membro={m}
              podeRemover={m.jogador.userId !== peladaCriadorUserId}
              podeEditarFuncao
              onRemover={() => onRemover(m.jogador.id, m.jogador.nome)}
              onAtualizado={(patch) => onAtualizado(m.id, patch)}
            />
          ))}
        </ul>
      )}
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

function ListasPorFuncao({
  membros,
  peladaCriadorUserId,
  onRemover,
  onAtualizado,
}: {
  membros: MembroDTO[];
  peladaCriadorUserId: string;
  onRemover: (jogadorId: string, nome: string) => void;
  onAtualizado: (
    membroId: string,
    patch: { funcaoPreferida: FuncaoPartida | null; posicaoLinha: PosicaoLinha | null },
  ) => void;
}) {
  const goleiros = membros.filter((m) => m.jogador.funcaoPreferida === 'goleiro');
  const linha = membros.filter((m) => m.jogador.funcaoPreferida === 'linha');
  const semFuncao = membros.filter((m) => m.jogador.funcaoPreferida === null);
  const propsComuns = { peladaCriadorUserId, onRemover, onAtualizado };

  return (
    <div className="mt-4 flex flex-col gap-4">
      <BlocoMembros
        {...propsComuns}
        titulo="Goleiros"
        icone={<IconeGoleiro />}
        cor="dourado"
        vazioTexto="Nenhum goleiro fixo definido."
        membros={goleiros}
      />
      <BlocoMembros
        {...propsComuns}
        titulo="Linha"
        icone={<IconeLinha />}
        cor="accent"
        vazioTexto="Nenhum jogador de linha definido."
        membros={linha}
      />
      {semFuncao.length > 0 && (
        <BlocoMembros
          {...propsComuns}
          titulo="Sem função definida"
          icone={<IconeInterrogacao />}
          cor="muted"
          vazioTexto=""
          membros={semFuncao}
        />
      )}
    </div>
  );
}

function LinhaMembro({
  membro,
  podeRemover,
  podeEditarFuncao,
  onRemover,
  onAtualizado,
}: {
  membro: MembroDTO;
  podeRemover: boolean;
  podeEditarFuncao: boolean;
  onRemover: () => void;
  onAtualizado: (patch: { funcaoPreferida: FuncaoPartida | null; posicaoLinha: PosicaoLinha | null }) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [funcao, setFuncao] = useState<FuncaoPartida | ''>(
    membro.jogador.funcaoPreferida ?? '',
  );
  const [posicao, setPosicao] = useState<PosicaoLinha | ''>(
    membro.jogador.posicaoLinha ?? '',
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async () => {
    setErro(null);
    setSalvando(true);
    try {
      const body: EditarJogadorBody = {
        funcaoPreferida: funcao || null,
        posicaoLinha: funcao === 'linha' && posicao ? posicao : null,
      };
      const atualizado = await api.put<JogadorDTO>(
        `/jogadores/${membro.jogador.id}`,
        body,
        { auth: true },
      );
      onAtualizado({
        funcaoPreferida: atualizado.funcaoPreferida,
        posicaoLinha: atualizado.posicaoLinha,
      });
      setEditando(false);
    } catch (e) {
      setErro(isApiError(e) ? e.mensagem : 'Erro');
    } finally {
      setSalvando(false);
    }
  };

  const detalhePosicao =
    membro.jogador.funcaoPreferida === 'linha' && membro.jogador.posicaoLinha
      ? ROTULOS_POSICAO_LINHA[membro.jogador.posicaoLinha]
      : null;

  return (
    <li className="flex flex-col gap-3 px-3 py-3">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-[#1C2027] font-display text-sm">
          {membro.jogador.avatarInicial}
        </span>
        <div className="flex-1">
          <p className="text-sm text-text">
            {membro.jogador.nome}
            {membro.papel === 'admin' && (
              <span className="ml-2 text-[10px] font-bold uppercase text-accent">dono</span>
            )}
            {membro.jogador.userId === null && (
              <span className="ml-2 text-[10px] font-bold uppercase text-text-tertiary">
                sem conta
              </span>
            )}
            {detalhePosicao && (
              <span className="ml-2 text-[10px] font-bold uppercase text-text-tertiary">
                {detalhePosicao}
              </span>
            )}
          </p>
          <p className="text-xs text-text-tertiary">
            {membro.jogador.telefone ? formatarTelefone(membro.jogador.telefone) : '—'}
          </p>
        </div>
        {podeEditarFuncao && !editando && (
          <button
            onClick={() => setEditando(true)}
            className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary hover:text-accent"
          >
            Função
          </button>
        )}
        {podeRemover && (
          <button
            onClick={onRemover}
            className="text-xs font-bold uppercase tracking-wider text-text-tertiary hover:text-coral"
          >
            Remover
          </button>
        )}
      </div>
      {editando && (
        <div className="ml-13 flex flex-wrap items-center gap-2 border border-border-strong bg-panel-2 p-3">
          <div className="flex overflow-hidden border border-border-strong">
            {(['', 'linha', 'goleiro'] as const).map((f) => (
              <button
                key={f || 'nenhuma'}
                type="button"
                onClick={() => setFuncao(f)}
                className={`px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider ${funcao === f ? 'bg-accent text-black' : 'bg-panel text-text-secondary'
                  }`}
              >
                {f === '' ? '—' : f === 'linha' ? 'Linha' : 'Goleiro'}
              </button>
            ))}
          </div>
          {funcao === 'linha' && (
            <select
              value={posicao}
              onChange={(e) => setPosicao(e.target.value as PosicaoLinha | '')}
              className="h-8 border border-border-strong bg-panel px-2 text-xs outline-none focus:border-accent"
            >
              <option value="">Posição (opcional)</option>
              {POSICOES_LINHA.map((p) => (
                <option key={p} value={p}>
                  {ROTULOS_POSICAO_LINHA[p]}
                </option>
              ))}
            </select>
          )}
          <Botao onClick={salvar} carregando={salvando}>
            Salvar
          </Botao>
          <button
            type="button"
            onClick={() => {
              setEditando(false);
              setFuncao(membro.jogador.funcaoPreferida ?? '');
              setPosicao(membro.jogador.posicaoLinha ?? '');
              setErro(null);
            }}
            className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary hover:text-coral"
          >
            Cancelar
          </button>
          {erro && <p className="w-full text-xs text-coral">{erro}</p>}
        </div>
      )}
    </li>
  );
}

function LinkConvite({ pelada }: { pelada: PeladaDTO }) {
  const [token, setToken] = useState<string | null>(pelada.tokenConvitePublico);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const origem = typeof window === 'undefined' ? '' : window.location.origin;
  const url = token ? `${origem}/c/${token}` : null;

  const gerar = async () => {
    setErro(null);
    setGerando(true);
    try {
      const r = await api.post<LinkConvitePublicoDTO>(
        `/peladas/${pelada.id}/link-convite`,
        undefined,
        { auth: true },
      );
      setToken(r.token);
    } catch (e) {
      setErro(isApiError(e) ? e.mensagem : 'Erro ao gerar link');
    } finally {
      setGerando(false);
    }
  };

  const copiar = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      setErro('Não foi possível copiar');
    }
  };

  const whatsapp = url
    ? `https://wa.me/?text=${encodeURIComponent(`Você foi convidado para a ${pelada.nome}: ${url}`)}`
    : null;

  return (
    <section className="mt-10">
      <h2 className="border-b border-dotted border-border-strong pb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">
        Link de convite
      </h2>
      <p className="mt-3 text-sm text-text-tertiary">
        Compartilhe esse link no WhatsApp ou Instagram. Quem clicar vê uma tela de convite e entra
        na pelada (com aprovação se você exigir).
      </p>

      {!token && (
        <div className="mt-5">
          <Botao onClick={gerar} carregando={gerando}>
            Gerar link
          </Botao>
          {erro && <p className="mt-2 text-sm text-coral">{erro}</p>}
        </div>
      )}

      {token && url && (
        <div className="mt-5 flex flex-col gap-3">
          <div className="flex items-stretch border border-border-strong bg-panel-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 bg-transparent px-3 py-3 font-mono text-xs text-text outline-none"
            />
            <button
              onClick={copiar}
              className="border-l border-border-strong bg-panel px-4 text-xs font-bold uppercase tracking-wider hover:border-accent hover:text-accent"
            >
              {copiado ? 'Copiado ✓' : 'Copiar'}
            </button>
          </div>
          <div className="flex gap-2">
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center border border-border-strong bg-panel px-4 text-xs font-bold uppercase tracking-wider hover:border-accent"
              >
                Enviar no WhatsApp
              </a>
            )}
          </div>
          {erro && <p className="text-sm text-coral">{erro}</p>}
        </div>
      )}
    </section>
  );
}
