'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type {
  CriarPartidaStandaloneBody,
  FuncaoPartida,
  ModoDesempate,
  PartidaAoVivo,
} from '@peladafc/contracts';
import { MAX_TIMES_STANDALONE, ROTULOS_MODO_DESEMPATE } from '@peladafc/contracts';
import { Botao } from '@/components/botao';
import { Campo } from '@/components/campo';
import { IconeGoleiro, IconeLinha } from '@/components/icones-funcao';
import { api } from '@/lib/api';
import { isApiError, useAuth } from '@/lib/auth-context';

type Passo = 'regras' | 'times' | 'jogadores' | 'sorteio-preview';

const METAS = [1, 2, 3, 4, 5] as const;
const DURACOES_COMUNS: (number | null)[] = [5, 10, 15, 20, null];
const LINHAS_COMUNS = [3, 4, 5, 6] as const;
const MIN_LINHA = 1;
const MAX_LINHA = 15;
const MODOS: ModoDesempate[] = ['par_impar', 'penaltis', 'shootout', 'gol_de_ouro'];

// Paleta de cores selecionáveis. Números 1–6 têm rótulo natural; adicionei
// preto, amarelo e vermelho verdadeiro (o antigo #FF6B6B era rosa).
const CORES: { hex: string; nome: string }[] = [
  { hex: '#C7F23E', nome: 'Verde' },
  { hex: '#FDE047', nome: 'Amarelo' },
  { hex: '#F2A93C', nome: 'Dourado' },
  { hex: '#EF4444', nome: 'Vermelho' },
  { hex: '#4FD1FF', nome: 'Azul' },
  { hex: '#A78BFA', nome: 'Roxo' },
  { hex: '#F4F5F6', nome: 'Branco' },
  { hex: '#0F172A', nome: 'Preto' },
];

// Jogador no wizard. `reserva` só existe no modo manual (via lista separada
// `reservasGerais`) — no sortear a distribuição titular/reserva é decidida
// pelo próprio sorteio, não pelo cadastro.
interface JogadorEstado {
  nome: string;
  funcao: FuncaoPartida;
}

// Resultado do sorteio: titulares distribuídos por time + reservas gerais
// (excedente da formação `jogadoresLinha + 1 goleiro` por time).
interface SorteioResultado {
  times: JogadorEstado[][];
  reservas: JogadorEstado[];
}

interface TimeEstado {
  nome: string;
  cor: string | null;
  jogadores: JogadorEstado[];
}

// Time A = verde limão (accent), B = vermelho, C = azul, D+ = ciclam pela paleta.
const CORES_PADRAO: string[] = ['#C7F23E', '#EF4444', '#4FD1FF', '#FDE047', '#A78BFA', '#F2A93C'];

function timeInicial(indice: number): TimeEstado {
  return {
    nome: `Time ${String.fromCharCode(65 + indice)}`,
    cor: CORES_PADRAO[indice % CORES_PADRAO.length] ?? null,
    jogadores: [],
  };
}

// Fisher–Yates in-place; devolve nova array pra não mutar o state.
function embaralhar<T>(arr: readonly T[]): T[] {
  const copia = [...arr];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j]!, copia[i]!];
  }
  return copia;
}

// Distribui os jogadores respeitando a formação escolhida: até 1 goleiro +
// `linhaMax` na linha por time. Goleiros extras (> nTimes) e linhas extras
// (> linhaMax por time) viram reservas gerais compartilhadas — entram em
// qualquer time depois via substituição. Se faltar goleiro em algum time,
// não promove linha automaticamente: o time joga sem goleiro até o usuário
// mexer (troca manual no preview ou substituição ao vivo).
function sortearJogadores(
  pool: JogadorEstado[],
  nTimes: number,
  linhaMax: number,
): SorteioResultado {
  const goleiros = embaralhar(pool.filter((j) => j.funcao === 'goleiro'));
  const linhas = embaralhar(pool.filter((j) => j.funcao === 'linha'));
  const times: JogadorEstado[][] = Array.from({ length: nTimes }, () => []);
  const reservas: JogadorEstado[] = [];

  // 1 goleiro por time, round-robin. Excedente vai pras reservas.
  goleiros.forEach((g, i) => {
    if (i < nTimes) times[i]!.push(g);
    else reservas.push(g);
  });

  // Até `linhaMax` linhas por time, round-robin coluna-a-coluna pra manter
  // times equilibrados quando sobra pouco (ex.: 7 linhas em 2 times, linhaMax=4
  // → 4-3, não 4-2 com 1 na reserva).
  let li = 0;
  for (let slot = 0; slot < linhaMax; slot++) {
    for (let t = 0; t < nTimes; t++) {
      if (li >= linhas.length) break;
      times[t]!.push(linhas[li++]!);
    }
    if (li >= linhas.length) break;
  }
  while (li < linhas.length) reservas.push(linhas[li++]!);

  return { times, reservas };
}

export default function IniciarPeladaPage() {
  const router = useRouter();
  const { estado } = useAuth();

  const [passo, setPasso] = useState<Passo>('regras');
  const [nome, setNome] = useState('');
  const [metaGols, setMetaGols] = useState<number>(2);
  const [duracaoMinutos, setDuracaoMinutos] = useState<number | null>(null);
  const [modoDesempate, setModoDesempate] = useState<ModoDesempate>('par_impar');
  // Jogadores "na linha" por time (fora o goleiro). Formatos comuns são
  // 4/5/6; salvamos como número livre pra caber "outro".
  const [jogadoresLinha, setJogadoresLinha] = useState<number>(5);
  const [times, setTimes] = useState<TimeEstado[]>([timeInicial(0), timeInicial(1)]);
  // Modo "sortear": mantém uma lista única de jogadores (com goleiro marcado)
  // e o app distribui aleatoriamente entre os times na criação.
  // Default 'sortear' porque é o formato mais comum de racha (usuário digita
  // a lista de quem veio, marca os goleiros, e o app distribui). Modo manual
  // continua disponível pro caso de times fixos.
  const [modoJogadores, setModoJogadores] = useState<'por-time' | 'sortear'>('sortear');
  const [poolSorteio, setPoolSorteio] = useState<JogadorEstado[]>([]);
  // Reservas gerais no modo manual (não pertencem a nenhum time). No modo
  // sortear, reservas ficam em `sorteioAtual.reservas`.
  const [reservasGerais, setReservasGerais] = useState<JogadorEstado[]>([]);
  // Resultado do sorteio cacheado — regenerado ao clicar "Sortear de novo".
  // Guardado em state pra ser preservado entre re-renders e enviado no submit.
  // Também é editável no preview (mover jogador entre times ↔ reservas).
  const [sorteioAtual, setSorteioAtual] = useState<SorteioResultado | null>(null);
  // Swap no preview: qual jogador o usuário selecionou pra mover. Guarda a
  // origem (índice do time ou 'reservas') + posição na lista pra recolocar.
  const [movendo, setMovendo] = useState<
    | { origem: number | 'reservas'; index: number }
    | null
  >(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (estado.status === 'anonimo') router.replace('/entrar?redirect=/pelada/iniciar');
  }, [estado.status, router]);

  if (estado.status !== 'autenticado') {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <p className="text-sm text-text-secondary">Carregando…</p>
      </main>
    );
  }

  const podeAvancar =
    passo === 'regras'
      ? true
      : passo === 'times'
        ? times.every((t) => t.nome.trim().length > 0)
        : passo === 'sorteio-preview'
          ? sorteioAtual != null && sorteioAtual.times.every((jogs) => jogs.length >= 1)
          : modoJogadores === 'sortear'
            ? // Pelo menos 1 jogador por time no pool
              poolSorteio.length >= times.length
            : times.every((t) => t.jogadores.length >= 1);

  const atualizarTime = (indice: number, patch: Partial<TimeEstado>) => {
    setTimes((atual) => atual.map((t, i) => (i === indice ? { ...t, ...patch } : t)));
  };
  const adicionarTime = () => {
    setTimes((atual) =>
      atual.length >= MAX_TIMES_STANDALONE ? atual : [...atual, timeInicial(atual.length)],
    );
  };
  const removerTime = (indice: number) => {
    setTimes((atual) => (atual.length <= 2 ? atual : atual.filter((_, i) => i !== indice)));
  };

  // Submissão explícita — não uso <form onSubmit> pra evitar submits
  // acidentais (Enter no input, botão que muda de type entre renders, etc).
  const criar = async () => {
    if (!podeAvancar) return;
    setErro(null);
    setEnviando(true);
    // Reservas gerais são separadas do envio (top-level `reservas`):
    // - modo sortear: `sorteioAtual.reservas` (excedente da formação)
    // - modo por-time: `reservasGerais` state
    // Titulares vão em `times[i].jogadores`.
    const distribuidos = modoJogadores === 'sortear' ? sorteioAtual : null;
    const reservasParaEnviar =
      modoJogadores === 'sortear'
        ? distribuidos?.reservas ?? []
        : reservasGerais;
    const body: CriarPartidaStandaloneBody = {
      nome: nome.trim() ? nome.trim() : null,
      metaGols,
      duracaoMinutos,
      modoDesempate,
      times: times.map((t, i) => ({
        nome: t.nome.trim(),
        cor: t.cor,
        jogadores: (distribuidos ? distribuidos.times[i]! : t.jogadores).map((j) => ({
          nome: j.nome,
          funcao: j.funcao,
        })),
      })),
      reservas: reservasParaEnviar.map((j) => ({ nome: j.nome, funcao: j.funcao })),
    };
    try {
      // Não dispara /iniciar aqui — o usuário aperta "Iniciar cronômetro"
      // na tela ao vivo quando o pessoal estiver de fato no campo. Assim
      // o timer começa em 0:00 no momento certo.
      const criada = await api.post<PartidaAoVivo>('/partidas', body, { auth: true });
      router.replace(`/partidas/${criada.id}/ao-vivo`);
    } catch (err) {
      setErro(isApiError(err) ? err.mensagem : 'Erro ao criar partida');
      setEnviando(false);
    }
  };

  return (
    <main className="mx-auto min-h-[calc(100vh-76px)] max-w-md px-4 pb-32 pt-6">
      <header className="mb-6 flex items-center justify-between gap-3">
        <Link
          href="/"
          aria-label="Cancelar e voltar"
          className="grid h-10 w-10 flex-none place-items-center border border-border-strong bg-panel text-lg text-text-secondary transition-colors hover:border-coral hover:text-coral"
        >
          ✕
        </Link>
        <h1 className="flex-1 font-display text-2xl uppercase tracking-wider">
          {passo === 'sorteio-preview' ? 'Sorteio' : 'Iniciar pelada'}
        </h1>
        <span className="font-display text-sm uppercase tracking-wider text-text-tertiary">
          {passo === 'regras' ? '1' : passo === 'times' ? '2' : '3'} / 3
        </span>
      </header>

      <div className="flex flex-col gap-8">
        {passo === 'regras' && (
          <div className="flex flex-col gap-8">
            <Campo
              rotulo="Nome do racha (opcional)"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={60}
              placeholder="Racha de sexta"
            />

            <SeletorLinha valor={jogadoresLinha} onChange={setJogadoresLinha} />

            <fieldset className="flex flex-col gap-3">
              <legend className="font-display text-sm uppercase tracking-wider text-text-secondary">
                Termina em
              </legend>
              <div className="flex flex-wrap gap-2">
                {METAS.map((n) => (
                  <ChipEscolha
                    key={n}
                    ativo={metaGols === n}
                    onClick={() => setMetaGols(n)}
                    rotulo={`${n} gol${n > 1 ? 's' : ''}`}
                  />
                ))}
              </div>
            </fieldset>

            <SeletorDuracao valor={duracaoMinutos} onChange={setDuracaoMinutos} />

            <fieldset className="flex flex-col gap-3">
              <legend className="font-display text-sm uppercase tracking-wider text-text-secondary">
                Empate resolve com
              </legend>
              <div className="flex flex-col gap-2">
                {MODOS.map((m) => (
                  <OpcaoRadio
                    key={m}
                    ativo={modoDesempate === m}
                    onClick={() => setModoDesempate(m)}
                    rotulo={ROTULOS_MODO_DESEMPATE[m]}
                  />
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {passo === 'times' && (
          <div className="flex flex-col gap-6">
            {times.map((t, i) => (
              <BlocoTime
                key={i}
                rotulo={`Time ${i + 1}`}
                time={t}
                onChange={(patch) => atualizarTime(i, patch)}
                onRemover={times.length > 2 ? () => removerTime(i) : undefined}
              />
            ))}
            {times.length < MAX_TIMES_STANDALONE && (
              <Botao
                type="button"
                variante="secundario"
                onClick={adicionarTime}
                className="h-12"
              >
                + Adicionar time
              </Botao>
            )}
          </div>
        )}

        {passo === 'jogadores' && (
          <div className="flex flex-col gap-6">
            <fieldset className="flex flex-col gap-2">
              <legend className="font-display text-sm uppercase tracking-wider text-text-secondary">
                Como montar os times
              </legend>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setModoJogadores('sortear')}
                  aria-pressed={modoJogadores === 'sortear'}
                  className={[
                    'flex h-14 flex-col items-center justify-center border font-display uppercase tracking-wider transition-colors',
                    modoJogadores === 'sortear'
                      ? 'border-accent bg-accent text-[#0B0D10]'
                      : 'border-border-strong bg-panel text-text-tertiary hover:text-text',
                  ].join(' ')}
                >
                  <span className="text-sm">Sortear</span>
                  <span className="text-[10px] font-normal opacity-80">app divide os times</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModoJogadores('por-time')}
                  aria-pressed={modoJogadores === 'por-time'}
                  className={[
                    'flex h-14 flex-col items-center justify-center border font-display uppercase tracking-wider transition-colors',
                    modoJogadores === 'por-time'
                      ? 'border-accent bg-accent text-[#0B0D10]'
                      : 'border-border-strong bg-panel text-text-tertiary hover:text-text',
                  ].join(' ')}
                >
                  <span className="text-sm">Manual</span>
                  <span className="text-[10px] font-normal opacity-80">você monta cada time</span>
                </button>
              </div>
            </fieldset>

            {modoJogadores === 'por-time' && (
              <>
                {times.map((t, i) => (
                  <ListaJogadores
                    key={i}
                    rotulo={t.nome || `Time ${i + 1}`}
                    corRotulo={t.cor}
                    jogadores={t.jogadores}
                    onChange={(js) => atualizarTime(i, { jogadores: js })}
                  />
                ))}
                <ListaJogadores
                  rotulo="🪑 Reservas (fora dos times)"
                  corRotulo={null}
                  jogadores={reservasGerais}
                  onChange={setReservasGerais}
                />
              </>
            )}

            {modoJogadores === 'sortear' && (
              <>
                <p className="text-xs text-text-tertiary">
                  Cadastre todo mundo que veio ao racha e marque os goleiros na
                  luva. O sorteio distribui até {jogadoresLinha + 1} por time
                  ({jogadoresLinha} na linha + goleiro); o resto vai pra
                  reservas — você pode mover à mão no próximo passo.
                </p>
                <ListaJogadores
                  rotulo="Todos os jogadores"
                  corRotulo={null}
                  jogadores={poolSorteio}
                  onChange={setPoolSorteio}
                />
              </>
            )}
          </div>
        )}

        {passo === 'sorteio-preview' && sorteioAtual && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-text-tertiary">
              Confira o sorteio abaixo. Nada começa até você tocar{' '}
              <span className="text-text">Começar partida!</span> — dá pra{' '}
              sortear de novo, tocar num jogador pra trocar de time/reservas,
              ou editar tudo à mão antes.
            </p>
            {times.map((t, i) => (
              <PreviewTime
                key={i}
                nome={t.nome || `Time ${i + 1}`}
                cor={t.cor}
                jogadores={sorteioAtual.times[i] ?? []}
                onTocarJogador={(idx) => setMovendo({ origem: i, index: idx })}
              />
            ))}
            <PreviewReservas
              jogadores={sorteioAtual.reservas}
              onTocarJogador={(idx) => setMovendo({ origem: 'reservas', index: idx })}
            />
            <div className="flex flex-col gap-2 pt-2">
              <Botao
                type="button"
                variante="secundario"
                className="h-12"
                onClick={() =>
                  setSorteioAtual(sortearJogadores(poolSorteio, times.length, jogadoresLinha))
                }
                disabled={enviando}
              >
                🎲 Sortear de novo
              </Botao>
              <Botao
                type="button"
                variante="secundario"
                className="h-12"
                onClick={() => {
                  // Aplica o sorteio atual como composição manual e volta pro
                  // passo de jogadores. Reservas do sorteio viram reservas
                  // gerais do modo manual.
                  setTimes((atual) =>
                    atual.map((t, i) => ({
                      ...t,
                      jogadores: (sorteioAtual.times[i] ?? []).map((j) => ({
                        nome: j.nome,
                        funcao: j.funcao,
                      })),
                    })),
                  );
                  setReservasGerais(
                    sorteioAtual.reservas.map((j) => ({ nome: j.nome, funcao: j.funcao })),
                  );
                  setModoJogadores('por-time');
                  setPasso('jogadores');
                }}
                disabled={enviando}
              >
                ✎ Editar manualmente
              </Botao>
            </div>
          </div>
        )}

        {movendo && sorteioAtual && (
          <SheetMoverJogador
            jogador={
              movendo.origem === 'reservas'
                ? sorteioAtual.reservas[movendo.index]!
                : sorteioAtual.times[movendo.origem]![movendo.index]!
            }
            destinos={times.map((t, i) => ({
              tipo: 'time' as const,
              indice: i,
              rotulo: t.nome || `Time ${i + 1}`,
              cor: t.cor,
              disponivel: movendo.origem !== i,
            }))}
            reservasDisponivel={movendo.origem !== 'reservas'}
            onFechar={() => setMovendo(null)}
            onEscolher={(destino) => {
              // Move o jogador da origem pro destino, sem tocar em ninguém mais.
              // Se a formação ficar desequilibrada (time cheio ou vazio), o usuário
              // resolve — não impomos limite aqui, senão o swap trava.
              setSorteioAtual((atual) => {
                if (!atual) return atual;
                const times = atual.times.map((t) => [...t]);
                const reservas = [...atual.reservas];
                const j =
                  movendo.origem === 'reservas'
                    ? reservas.splice(movendo.index, 1)[0]!
                    : times[movendo.origem]!.splice(movendo.index, 1)[0]!;
                if (destino === 'reservas') reservas.push(j);
                else times[destino]!.push(j);
                return { times, reservas };
              });
              setMovendo(null);
            }}
          />
        )}

        {erro && <p className="text-sm text-coral">{erro}</p>}

        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-nav-bg px-4 pt-3
                     pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <div className="mx-auto flex max-w-md gap-2">
            {passo !== 'regras' && (
              <Botao
                type="button"
                variante="secundario"
                className="h-14 w-1/3 text-base"
                onClick={() => {
                  if (passo === 'sorteio-preview') setPasso('jogadores');
                  else if (passo === 'jogadores') setPasso('times');
                  else if (passo === 'times') setPasso('regras');
                }}
                disabled={enviando}
              >
                Voltar
              </Botao>
            )}
            {passo === 'regras' || passo === 'times' ? (
              <Botao
                type="button"
                className="h-14 flex-1 text-base"
                onClick={() => {
                  if (!podeAvancar) return;
                  setPasso(passo === 'regras' ? 'times' : 'jogadores');
                }}
                disabled={!podeAvancar}
              >
                Avançar
              </Botao>
            ) : passo === 'jogadores' && modoJogadores === 'sortear' ? (
              <Botao
                type="button"
                className="h-14 flex-1 text-base"
                onClick={() => {
                  if (!podeAvancar) return;
                  setSorteioAtual(sortearJogadores(poolSorteio, times.length, jogadoresLinha));
                  setPasso('sorteio-preview');
                }}
                disabled={!podeAvancar}
              >
                🎲 Sortear
              </Botao>
            ) : (
              <Botao
                type="button"
                className="h-14 flex-1 text-base"
                carregando={enviando}
                disabled={!podeAvancar}
                onClick={criar}
              >
                Começar partida!
              </Botao>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function PreviewTime({
  nome,
  cor,
  jogadores,
  onTocarJogador,
}: {
  nome: string;
  cor: string | null;
  jogadores: JogadorEstado[];
  onTocarJogador: (indice: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 border border-border bg-panel p-3">
      <div className="flex items-center gap-2">
        <span className="h-4 w-4 flex-none" style={{ backgroundColor: cor ?? '#5C6470' }} />
        <p className="font-display text-sm uppercase tracking-wider">
          {nome}
          <span className="ml-2 text-text-tertiary">({jogadores.length})</span>
        </p>
      </div>
      <ul className="flex flex-col gap-1">
        {jogadores.map((j, i) => (
          <LinhaPreviewJogador
            key={`${j.nome}-${i}`}
            jogador={j}
            onTocar={() => onTocarJogador(i)}
          />
        ))}
      </ul>
    </div>
  );
}

function PreviewReservas({
  jogadores,
  onTocarJogador,
}: {
  jogadores: JogadorEstado[];
  onTocarJogador: (indice: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 border border-border border-dashed bg-panel p-3">
      <p className="font-display text-sm uppercase tracking-wider">
        🪑 Reservas
        <span className="ml-2 text-text-tertiary">({jogadores.length})</span>
      </p>
      {jogadores.length === 0 ? (
        <p className="text-xs text-text-tertiary">
          Sem reservas — todo mundo é titular.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {jogadores.map((j, i) => (
            <LinhaPreviewJogador
              key={`${j.nome}-${i}`}
              jogador={j}
              onTocar={() => onTocarJogador(i)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function LinhaPreviewJogador({
  jogador,
  onTocar,
}: {
  jogador: JogadorEstado;
  onTocar: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onTocar}
        className="flex w-full items-center gap-2 border border-transparent px-1 py-1 text-left text-sm transition-colors hover:border-border-strong hover:bg-panel-2"
        aria-label={`Mover ${jogador.nome}`}
        title="Tocar pra trocar de time ou reservas"
      >
        {jogador.funcao === 'goleiro' ? (
          <span className="grid h-6 w-6 flex-none place-items-center bg-dourado text-[#0B0D10]">
            <span className="text-[10px] font-bold">G</span>
          </span>
        ) : (
          <span className="h-6 w-6 flex-none" />
        )}
        <span className="flex-1 truncate">{jogador.nome}</span>
        <span className="font-display text-[10px] uppercase tracking-wider text-text-tertiary">
          Mover
        </span>
      </button>
    </li>
  );
}

function SheetMoverJogador({
  jogador,
  destinos,
  reservasDisponivel,
  onFechar,
  onEscolher,
}: {
  jogador: JogadorEstado;
  destinos: {
    tipo: 'time';
    indice: number;
    rotulo: string;
    cor: string | null;
    disponivel: boolean;
  }[];
  reservasDisponivel: boolean;
  onFechar: () => void;
  onEscolher: (destino: number | 'reservas') => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-black/60"
      onClick={onFechar}
      role="dialog"
      aria-modal="true"
      aria-label={`Mover ${jogador.nome}`}
    >
      <div
        className="mx-auto flex w-full max-w-md flex-col gap-3 border-t border-border bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          {jogador.funcao === 'goleiro' ? (
            <span className="grid h-8 w-8 flex-none place-items-center bg-dourado text-[#0B0D10]">
              <span className="text-xs font-bold">G</span>
            </span>
          ) : (
            <span className="h-8 w-8 flex-none border border-border-strong" />
          )}
          <p className="flex-1 truncate font-display text-sm uppercase tracking-wider">
            Mover {jogador.nome}
          </p>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="grid h-8 w-8 flex-none place-items-center border border-border-strong text-text-tertiary hover:border-coral hover:text-coral"
          >
            ✕
          </button>
        </div>
        <p className="font-display text-[10px] uppercase tracking-wider text-text-tertiary">
          Escolha o destino
        </p>
        <div className="flex flex-col gap-2">
          {destinos.map(
            (d) =>
              d.disponivel && (
                <button
                  key={d.indice}
                  type="button"
                  onClick={() => onEscolher(d.indice)}
                  className="flex h-12 items-center gap-3 border border-border-strong bg-panel-2 px-3 text-left font-display text-sm uppercase tracking-wider hover:border-accent"
                >
                  <span
                    className="h-4 w-4 flex-none"
                    style={{ backgroundColor: d.cor ?? '#5C6470' }}
                  />
                  <span className="flex-1 truncate">{d.rotulo}</span>
                </button>
              ),
          )}
          {reservasDisponivel && (
            <button
              type="button"
              onClick={() => onEscolher('reservas')}
              className="flex h-12 items-center gap-3 border border-border-strong border-dashed bg-panel-2 px-3 text-left font-display text-sm uppercase tracking-wider hover:border-accent"
            >
              <span className="h-4 w-4 flex-none" />
              <span className="flex-1 truncate">🪑 Reservas</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ChipEscolha({
  ativo,
  onClick,
  rotulo,
}: {
  ativo: boolean;
  onClick: () => void;
  rotulo: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex h-12 min-w-[3.5rem] items-center justify-center px-4 font-display text-base uppercase tracking-wider transition-colors',
        ativo
          ? 'bg-accent text-[#0B0D10]'
          : 'border border-border-strong bg-panel text-text hover:border-accent',
      ].join(' ')}
    >
      {rotulo}
    </button>
  );
}

// Duração aceita valores comuns (chips) OU um número livre digitado em "Outro".
function SeletorDuracao({
  valor,
  onChange,
}: {
  valor: number | null;
  onChange: (v: number | null) => void;
}) {
  const outroAtivo =
    valor != null && !DURACOES_COMUNS.some((d) => d != null && d === valor);
  const [outroTexto, setOutroTexto] = useState<string>(outroAtivo && valor ? String(valor) : '');
  const [outroSelecionado, setOutroSelecionado] = useState<boolean>(outroAtivo);

  const escolherChip = (d: number | null) => {
    setOutroSelecionado(false);
    setOutroTexto('');
    onChange(d);
  };

  const escolherOutro = () => {
    setOutroSelecionado(true);
    // Não altera o valor até o usuário digitar um número válido.
    if (outroTexto) {
      const n = Number.parseInt(outroTexto, 10);
      if (!Number.isNaN(n) && n >= 1 && n <= 240) onChange(n);
    }
  };

  const atualizarOutro = (texto: string) => {
    // Aceita só dígitos, no máximo 3 (até 240 min).
    const limpo = texto.replace(/\D/g, '').slice(0, 3);
    setOutroTexto(limpo);
    setOutroSelecionado(true);
    if (limpo === '') {
      onChange(null);
      return;
    }
    const n = Number.parseInt(limpo, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= 240) onChange(n);
  };

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="font-display text-sm uppercase tracking-wider text-text-secondary">
        Duração (opcional)
      </legend>
      <div className="flex flex-wrap gap-2">
        {DURACOES_COMUNS.map((d) => (
          <ChipEscolha
            key={d ?? 'sem'}
            ativo={!outroSelecionado && valor === d}
            onClick={() => escolherChip(d)}
            rotulo={d ? `${d} min` : 'sem limite'}
          />
        ))}
        <ChipEscolha
          ativo={outroSelecionado}
          onClick={escolherOutro}
          rotulo={outroSelecionado ? 'Outro:' : 'Outro'}
        />
        {outroSelecionado && (
          <input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            value={outroTexto}
            onChange={(e) => atualizarOutro(e.target.value)}
            placeholder="min"
            className="h-12 w-20 border border-border-strong bg-panel-2 px-3 text-center text-base text-text placeholder:text-text-tertiary focus:border-accent focus:outline-none"
            aria-label="Duração customizada em minutos"
          />
        )}
      </div>
      {outroSelecionado && outroTexto === '' && (
        <p className="text-xs text-text-tertiary">Digite quantos minutos</p>
      )}
    </fieldset>
  );
}

// Posições relativas (viewBox 60x90) dos jogadores de linha para cada
// formação comum. Goleiro sempre no topo, no meio; time atacando pra baixo.
const POSICOES_LINHA: Record<number, ReadonlyArray<{ x: number; y: number }>> = {
  3: [
    { x: 30, y: 42 },
    { x: 15, y: 72 },
    { x: 45, y: 72 },
  ],
  4: [
    { x: 18, y: 40 },
    { x: 42, y: 40 },
    { x: 18, y: 72 },
    { x: 42, y: 72 },
  ],
  5: [
    { x: 18, y: 36 },
    { x: 42, y: 36 },
    { x: 30, y: 55 },
    { x: 18, y: 75 },
    { x: 42, y: 75 },
  ],
  6: [
    { x: 18, y: 32 },
    { x: 42, y: 32 },
    { x: 18, y: 54 },
    { x: 42, y: 54 },
    { x: 18, y: 76 },
    { x: 42, y: 76 },
  ],
};

// Meio-campo com goleiro fixo + N jogadores na linha, pra visualizar a
// formação escolhida (3/4/5/6 na linha).
function CampinhoFormacao({ linha }: { linha: number }) {
  const posicoes = POSICOES_LINHA[linha] ?? [];
  return (
    <svg
      viewBox="0 0 60 90"
      className="h-14 w-10"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Linhas do campo (goleira em cima, meio-campo embaixo) */}
      <g fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35">
        <rect x="2" y="2" width="56" height="86" />
        <rect x="18" y="2" width="24" height="8" />
        <line x1="2" y1="88" x2="58" y2="88" />
        <circle cx="30" cy="88" r="7" />
      </g>
      {/* Goleiro (dourado) */}
      <circle cx="30" cy="10" r="4" fill="#F2A93C" />
      {/* Jogadores de linha */}
      {posicoes.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="4" fill="currentColor" />
      ))}
    </svg>
  );
}

// Jogadores "na linha" por time (fora o goleiro). Um mini meio-campo por
// formação (3/4/5/6) + "Outro" com input livre pra formatos menos comuns.
function SeletorLinha({
  valor,
  onChange,
}: {
  valor: number;
  onChange: (v: number) => void;
}) {
  const outroAtivo = !LINHAS_COMUNS.some((n) => n === valor);
  const [outroTexto, setOutroTexto] = useState<string>(outroAtivo ? String(valor) : '');
  const [outroSelecionado, setOutroSelecionado] = useState<boolean>(outroAtivo);

  const escolherFormacao = (n: number) => {
    setOutroSelecionado(false);
    setOutroTexto('');
    onChange(n);
  };

  const escolherOutro = () => {
    setOutroSelecionado(true);
    if (outroTexto) {
      const n = Number.parseInt(outroTexto, 10);
      if (!Number.isNaN(n) && n >= MIN_LINHA && n <= MAX_LINHA) onChange(n);
    }
  };

  const atualizarOutro = (texto: string) => {
    const limpo = texto.replace(/\D/g, '').slice(0, 2);
    setOutroTexto(limpo);
    setOutroSelecionado(true);
    if (limpo === '') return;
    const n = Number.parseInt(limpo, 10);
    if (!Number.isNaN(n) && n >= MIN_LINHA && n <= MAX_LINHA) onChange(n);
  };

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="font-display text-sm uppercase tracking-wider text-text-secondary">
        Jogadores por time (na linha)
      </legend>
      <div className="grid grid-cols-4 gap-2">
        {LINHAS_COMUNS.map((n) => {
          const ativo = !outroSelecionado && valor === n;
          return (
            <button
              type="button"
              key={n}
              onClick={() => escolherFormacao(n)}
              aria-pressed={ativo}
              className={[
                'flex flex-col items-center justify-between gap-1 border py-2 transition-colors',
                ativo
                  ? 'border-accent bg-accent text-[#0B0D10]'
                  : 'border-border-strong bg-panel text-text-secondary hover:border-accent hover:text-text',
              ].join(' ')}
            >
              <CampinhoFormacao linha={n} />
              <span className="font-display text-xs uppercase tracking-wider">
                {n} na linha
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={escolherOutro}
        aria-pressed={outroSelecionado}
        className={[
          'flex items-center justify-between gap-3 border px-4 py-3 transition-colors',
          outroSelecionado
            ? 'border-accent bg-panel-2 text-text'
            : 'border-border-strong bg-panel text-text-secondary hover:border-accent hover:text-text',
        ].join(' ')}
      >
        <span className="font-display text-sm uppercase tracking-wider">Outro</span>
        <span className="flex items-center gap-2">
          <input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            value={outroSelecionado ? outroTexto : ''}
            onChange={(e) => atualizarOutro(e.target.value)}
            onFocus={escolherOutro}
            onClick={(e) => e.stopPropagation()}
            placeholder="nº"
            className="h-10 w-16 border border-border-strong bg-panel-2 px-2 text-center text-base text-text placeholder:text-text-tertiary focus:border-accent focus:outline-none"
            aria-label="Quantidade customizada de jogadores na linha"
          />
          <span className="text-xs text-text-tertiary">na linha</span>
        </span>
      </button>
      <p className="text-[10px] uppercase tracking-wider text-text-tertiary">
        Fora o goleiro.
      </p>
    </fieldset>
  );
}

function OpcaoRadio({
  ativo,
  onClick,
  rotulo,
}: {
  ativo: boolean;
  onClick: () => void;
  rotulo: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex h-14 items-center justify-between px-4 text-left transition-colors',
        ativo
          ? 'border border-accent bg-panel-2 text-text'
          : 'border border-border-strong bg-panel text-text-secondary hover:border-accent hover:text-text',
      ].join(' ')}
    >
      <span className="font-display text-base uppercase tracking-wider">{rotulo}</span>
      <span
        className={[
          'grid h-6 w-6 place-items-center border',
          ativo ? 'border-accent' : 'border-border-strong',
        ].join(' ')}
      >
        {ativo && <span className="h-3 w-3 bg-accent" />}
      </span>
    </button>
  );
}

function BlocoTime({
  rotulo,
  time,
  onChange,
  onRemover,
}: {
  rotulo: string;
  time: TimeEstado;
  onChange: (patch: Partial<TimeEstado>) => void;
  onRemover?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 border border-border bg-panel p-4">
      <div className="flex items-center justify-between">
        <p className="font-display text-xs uppercase tracking-wider text-text-tertiary">
          {rotulo}
        </p>
        {onRemover && (
          <button
            type="button"
            onClick={onRemover}
            className="font-display text-xs uppercase tracking-wider text-text-tertiary hover:text-coral"
          >
            Remover
          </button>
        )}
      </div>
      <Campo
        rotulo="Nome"
        value={time.nome}
        onChange={(e) => onChange({ nome: e.target.value })}
        maxLength={30}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="font-display text-xs uppercase tracking-wider text-text-tertiary">
          Cor
        </legend>
        <div className="flex flex-wrap gap-2">
          {CORES.map((c) => {
            const ativo = time.cor === c.hex;
            return (
              <button
                type="button"
                key={c.hex}
                aria-label={c.nome}
                aria-pressed={ativo}
                onClick={() => onChange({ cor: c.hex })}
                // Contorno permanente para o swatch preto ficar visível no bg escuro
                style={{
                  backgroundColor: c.hex,
                  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)',
                }}
                className={[
                  'h-10 w-10 border-2 transition-transform active:scale-95',
                  ativo ? 'border-text' : 'border-transparent',
                ].join(' ')}
              />
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

function ListaJogadores({
  rotulo,
  corRotulo,
  jogadores,
  onChange,
}: {
  rotulo: string;
  corRotulo: string | null;
  jogadores: JogadorEstado[];
  onChange: (js: JogadorEstado[]) => void;
}) {
  const [novo, setNovo] = useState('');
  // Se o novo já vira goleiro. Reseta pra 'linha' após adicionar.
  const [novoFuncao, setNovoFuncao] = useState<FuncaoPartida>('linha');

  const adicionar = () => {
    const t = novo.trim();
    if (!t) return;
    onChange([...jogadores, { nome: t, funcao: novoFuncao }]);
    setNovo('');
    setNovoFuncao('linha');
  };

  const alternarFuncao = (i: number) => {
    onChange(
      jogadores.map((j, idx) =>
        idx === i ? { ...j, funcao: j.funcao === 'goleiro' ? 'linha' : 'goleiro' } : j,
      ),
    );
  };

  return (
    <div className="flex flex-col gap-3 border border-border bg-panel p-4">
      <div className="flex items-center gap-2">
        {corRotulo && <span className="h-4 w-4" style={{ backgroundColor: corRotulo }} />}
        <p className="font-display text-sm uppercase tracking-wider">
          {rotulo}
          <span className="ml-2 text-text-tertiary">({jogadores.length})</span>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {jogadores.map((j, i) => {
          const isGol = j.funcao === 'goleiro';
          return (
            <div
              key={`${j.nome}-${i}`}
              className="flex items-center gap-2 border border-border bg-panel-2 px-3 py-2"
            >
              <button
                type="button"
                onClick={() => alternarFuncao(i)}
                aria-pressed={isGol}
                aria-label={isGol ? 'Marcado como goleiro' : 'Marcar como goleiro'}
                title={isGol ? 'Goleiro' : 'Linha — toque pra marcar goleiro'}
                className={[
                  'grid h-9 w-9 flex-none place-items-center transition-colors',
                  isGol
                    ? 'bg-dourado text-[#0B0D10]'
                    : 'border border-border-strong text-text-tertiary hover:text-text',
                ].join(' ')}
              >
                {isGol ? <IconeGoleiro /> : <IconeLinha />}
              </button>
              <span className="flex-1 truncate text-sm">
                {j.nome}
                {isGol && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-dourado">
                    Goleiro
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => onChange(jogadores.filter((_, idx) => idx !== i))}
                className="font-display text-xs uppercase tracking-wider text-text-tertiary hover:text-coral"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setNovoFuncao(novoFuncao === 'goleiro' ? 'linha' : 'goleiro')}
          aria-pressed={novoFuncao === 'goleiro'}
          aria-label="Novo jogador é goleiro"
          title={
            novoFuncao === 'goleiro'
              ? 'Próximo será goleiro'
              : 'Próximo será linha — toque pra marcar goleiro'
          }
          className={[
            'grid h-12 w-12 flex-none place-items-center transition-colors',
            novoFuncao === 'goleiro'
              ? 'bg-dourado text-[#0B0D10]'
              : 'border border-border-strong text-text-tertiary hover:text-text',
          ].join(' ')}
        >
          {novoFuncao === 'goleiro' ? <IconeGoleiro /> : <IconeLinha />}
        </button>
        <input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              adicionar();
            }
          }}
          placeholder="Nome do jogador"
          maxLength={60}
          className="h-12 flex-1 border border-border-strong bg-panel-2 px-3 text-base text-text placeholder:text-text-tertiary focus:border-accent focus:outline-none"
        />
        <Botao type="button" onClick={adicionar} className="h-12" disabled={!novo.trim()}>
          Add
        </Botao>
      </div>
      <p className="text-[10px] uppercase tracking-wider text-text-tertiary">
        Toque na luva pra marcar goleiro
      </p>
    </div>
  );
}
