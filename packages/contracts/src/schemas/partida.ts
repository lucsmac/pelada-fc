import { z } from 'zod';
import { eventoPartidaDTOSchema, tipoEventoSchema } from './evento-partida.js';

export const STATUS_PARTIDA = ['agendada', 'em_andamento', 'finalizada', 'cancelada'] as const;
export const statusPartidaSchema = z.enum(STATUS_PARTIDA);
export type StatusPartida = z.infer<typeof statusPartidaSchema>;

export const STATUS_PRESENCA = ['confirmado', 'recusado', 'lista_espera'] as const;
export const statusPresencaSchema = z.enum(STATUS_PRESENCA);
export type StatusPresenca = z.infer<typeof statusPresencaSchema>;

export const FUNCOES_PARTIDA = ['goleiro', 'linha'] as const;
export const funcaoPartidaSchema = z.enum(FUNCOES_PARTIDA);
export type FuncaoPartida = z.infer<typeof funcaoPartidaSchema>;

export const POSICOES_LINHA = ['zagueiro', 'lateral', 'volante', 'meia', 'atacante'] as const;
export const posicaoLinhaSchema = z.enum(POSICOES_LINHA);
export type PosicaoLinha = z.infer<typeof posicaoLinhaSchema>;

export const ROTULOS_POSICAO_LINHA: Record<PosicaoLinha, string> = {
  zagueiro: 'Zagueiro',
  lateral: 'Lateral',
  volante: 'Volante',
  meia: 'Meia',
  atacante: 'Atacante',
};

// Modos de desempate suportados quando uma partida ao vivo termina empatada.
// `par_impar` e `gol_de_ouro` são resolvidos fora do server (offline / próximo
// gol); `penaltis` e `shootout` gravam eventos `penalti_desempate` no log.
export const MODOS_DESEMPATE = ['par_impar', 'penaltis', 'shootout', 'gol_de_ouro'] as const;
export const modoDesempateSchema = z.enum(MODOS_DESEMPATE);
export type ModoDesempate = z.infer<typeof modoDesempateSchema>;

export const ROTULOS_MODO_DESEMPATE: Record<ModoDesempate, string> = {
  par_impar: 'Par ou ímpar',
  penaltis: 'Pênaltis',
  shootout: 'Shootout',
  gol_de_ouro: 'Gol de ouro',
};

// ---------------------------------------------------------------------------
// Partida

export const partidaSchema = z.object({
  id: z.string().uuid(),
  // peladaId/temporadaId são nulos em partidas standalone (pelada rápida).
  peladaId: z.string().uuid().nullable(),
  temporadaId: z.string().uuid().nullable(),
  criadoPorUserId: z.string().uuid().nullable(),
  nome: z.string().nullable(),
  data: z.coerce.date(),
  status: statusPartidaSchema,
  placarTimeA: z.number().int().nonnegative(),
  placarTimeB: z.number().int().nonnegative(),
  // Modo ao vivo (todos nullable — presença indica partida em modo live)
  metaGols: z.number().int().positive().nullable(),
  duracaoMinutos: z.number().int().positive().nullable(),
  iniciadoEm: z.coerce.date().nullable(),
  finalizadoEm: z.coerce.date().nullable(),
  pausadoEm: z.coerce.date().nullable(),
  duracaoPausadaSegundos: z.number().int().nonnegative(),
  modoDesempate: modoDesempateSchema.nullable(),
  desempateVencedorTeamId: z.string().uuid().nullable(),
  criadoEm: z.coerce.date(),
  // Racha de 3+ times: quais 2 times estão em campo agora (`[teamA, teamB]`).
  // Nas partidas novas sempre populado com 2 elementos; array vazio `[]` só
  // em partidas legadas anteriores à feature (frontend faz fallback pros 2
  // primeiros times). Placar/jogadores da UI são projetados só desses 2
  // durante em_andamento.
  emCampoTeamIds: z.array(z.string().uuid()).max(2),
  // Rodada atual dentro da sessão. Cada `rodada_encerrada` incrementa. Começa
  // em 1. Em partida de 2 times, permanece 1 pelo ciclo de vida inteiro.
  rodadaAtual: z.number().int().positive(),
});
export type PartidaDTO = z.infer<typeof partidaSchema>;

// Ranking derivado (não persistido): agregado por time dentro da sessão.
// Enviado read-only pelo backend em `partidaAoVivoSchema`.
export const rankingTimeSchema = z.object({
  teamId: z.string().uuid(),
  vitorias: z.number().int().nonnegative(),
  derrotas: z.number().int().nonnegative(),
  saldoGols: z.number().int(),
  // Vitórias consecutivas na sessão atual. Zera na primeira derrota. Usado
  // pelo frontend pra exibir o foguinho de streak (🔥 a partir de 2, 🔥🔥 a
  // partir de 4, 🔥🔥🔥 a partir de 6).
  streakVitorias: z.number().int().nonnegative(),
});
export type RankingTime = z.infer<typeof rankingTimeSchema>;

export const criarPartidaBodySchema = z.object({
  data: z.coerce.date(),
  temporadaId: z.string().uuid().optional(), // se omitido, usa a temporada ativa
});
export type CriarPartidaBody = z.infer<typeof criarPartidaBodySchema>;

export const listarPartidasResponseSchema = z.object({
  itens: z.array(partidaSchema),
  total: z.number().int().nonnegative(),
});
export type ListarPartidasResponse = z.infer<typeof listarPartidasResponseSchema>;

// ---------------------------------------------------------------------------
// Presença

export const presencaJogadorSchema = z.object({
  id: z.string().uuid(),
  jogadorId: z.string().uuid(),
  status: statusPresencaSchema,
  funcao: funcaoPartidaSchema,
  posicaoLinha: posicaoLinhaSchema.nullable(),
  respondidoEm: z.coerce.date(),
  jogador: z.object({
    id: z.string().uuid(),
    nome: z.string(),
    avatarInicial: z.string().length(1),
    userId: z.string().uuid().nullable(),
  }),
});
export type PresencaJogador = z.infer<typeof presencaJogadorSchema>;

// funcao é obrigatória quando status = confirmado ou lista_espera; para
// `recusado` é irrelevante mas mantemos default = 'linha' pra simplificar.
// posicaoLinha só faz sentido com funcao=linha e é opcional.
export const registrarPresencaBodySchema = z
  .object({
    status: statusPresencaSchema,
    // Se admin registra presença de terceiro, passa jogadorId; senão infere pelo user.
    jogadorId: z.string().uuid().optional(),
    funcao: funcaoPartidaSchema.default('linha'),
    posicaoLinha: posicaoLinhaSchema.nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.funcao === 'goleiro' && val.posicaoLinha) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['posicaoLinha'],
        message: 'Goleiro não escolhe posição de linha',
      });
    }
  });
export type RegistrarPresencaBody = z.infer<typeof registrarPresencaBodySchema>;

// ---------------------------------------------------------------------------
// Time

export const timeSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  cor: z.string().nullable(),
  jogadores: z.array(
    z.object({
      id: z.string().uuid(),
      jogadorId: z.string().uuid(),
      jogador: z.object({
        id: z.string().uuid(),
        nome: z.string(),
        avatarInicial: z.string().length(1),
      }),
    }),
  ),
});
export type TimeDTO = z.infer<typeof timeSchema>;

// Sorteio automático: distribui confirmados em N times aleatoriamente.
// Se `quantidadeTimes` for omitido, usa o configurado na pelada.
export const sortearTimesBodySchema = z.object({
  quantidadeTimes: z.number().int().min(2).max(8).optional(),
  nomes: z.array(z.string().min(1).max(30)).optional(),
});
export type SortearTimesBody = z.infer<typeof sortearTimesBodySchema>;

// ---------------------------------------------------------------------------
// Detalhe + resultado

// Estatística agregada por jogador enviada no fim da partida (fluxo clássico
// de resultado). Renomeado de `eventoPartidaSchema` para não colidir com o
// EventoPartida (jogada individual) do modo ao vivo em ./evento-partida.ts.
export const eventoEstatisticaSchema = z.object({
  jogadorId: z.string().uuid(),
  gols: z.number().int().min(0).max(30),
  assistencias: z.number().int().min(0).max(30),
  foiMvp: z.boolean(),
});
export type EventoEstatistica = z.infer<typeof eventoEstatisticaSchema>;

export const registrarResultadoBodySchema = z.object({
  placarTimeA: z.number().int().min(0).max(50),
  placarTimeB: z.number().int().min(0).max(50),
  eventos: z.array(eventoEstatisticaSchema).default([]),
});
export type RegistrarResultadoBody = z.infer<typeof registrarResultadoBodySchema>;

export const convidadoPartidaSchema = z.object({
  id: z.string().uuid(),
  jogadorId: z.string().uuid(),
  criadoEm: z.coerce.date(),
  jogador: z.object({
    id: z.string().uuid(),
    nome: z.string(),
    avatarInicial: z.string().length(1),
    userId: z.string().uuid().nullable(),
  }),
});
export type ConvidadoPartidaDTO = z.infer<typeof convidadoPartidaSchema>;

export const partidaDetalheSchema = partidaSchema.extend({
  presencas: z.array(presencaJogadorSchema),
  times: z.array(timeSchema),
  convidados: z.array(convidadoPartidaSchema),
  estatisticas: z.array(
    z.object({
      id: z.string().uuid(),
      jogadorId: z.string().uuid(),
      gols: z.number().int().nonnegative(),
      assistencias: z.number().int().nonnegative(),
      foiMvp: z.boolean(),
      jogador: z.object({
        id: z.string().uuid(),
        nome: z.string(),
        avatarInicial: z.string().length(1),
      }),
    }),
  ),
});
export type PartidaDetalhe = z.infer<typeof partidaDetalheSchema>;

// Body para convidar: jogador existente, com opção de replicar em partidas
// futuras da mesma pelada (próximas N ocorrências agendadas).
export const convidarParaPartidaBodySchema = z.object({
  jogadorId: z.string().uuid(),
  proximasPartidas: z.number().int().min(1).max(20).default(1),
});
export type ConvidarParaPartidaBody = z.infer<typeof convidarParaPartidaBodySchema>;

export const convidarParaPartidaResponseSchema = z.object({
  criados: z.array(convidadoPartidaSchema),
});
export type ConvidarParaPartidaResponse = z.infer<typeof convidarParaPartidaResponseSchema>;

// ---------------------------------------------------------------------------
// Modo ao vivo — schemas para partida standalone e eventos por jogada.

// Detalhe + eventos do log. É a resposta padrão de qualquer mutation do modo
// live (start/pause/gol/finalizar/desempate/rotacionar) — o cliente sempre
// recebe o estado completo pra dispensar re-fetch.
export const partidaAoVivoSchema = partidaDetalheSchema.extend({
  eventos: z.array(eventoPartidaDTOSchema),
  // Derivado: um item por time, ordenado pela ordem dos times na partida.
  // Vazio quando `status=finalizada` sem rodadas (partida 2 times).
  ranking: z.array(rankingTimeSchema),
});
export type PartidaAoVivo = z.infer<typeof partidaAoVivoSchema>;

// Jogador titular ou reserva geral: nome livre + função (goleiro ou linha,
// default linha). Cria Jogador com userId=null no server + Attendance pra
// manter a informação de função e status (confirmado/lista_espera).
const jogadorStandaloneSchema = z.object({
  nome: z.string().min(1).max(60),
  funcao: funcaoPartidaSchema.default('linha'),
});

// Time inicial da partida standalone: nome + cor opcional + lista de titulares.
// Reservas são separados (top-level em criarPartidaStandaloneBody) porque não
// pertencem a nenhum time — entram em qualquer time via substituição.
const timeStandaloneSchema = z.object({
  nome: z.string().min(1).max(30),
  cor: z.string().max(20).nullable().default(null),
  jogadores: z.array(jogadorStandaloneSchema).min(1).max(30),
});

// Máximo de times por partida. 2 é o padrão de jogo (A vs B); 3+ suporta
// rachas com times rotativos ("quem vence continua" — todos jogam no mesmo
// racha, contabilizados juntos).
export const MAX_TIMES_STANDALONE = 6;

export const criarPartidaStandaloneBodySchema = z.object({
  nome: z.string().min(1).max(60).nullable().default(null),
  metaGols: z.number().int().min(1).max(20).default(2),
  duracaoMinutos: z.number().int().min(1).max(240).nullable().default(null),
  modoDesempate: modoDesempateSchema.default('par_impar'),
  times: z.array(timeStandaloneSchema).min(2).max(MAX_TIMES_STANDALONE),
  // Jogadores que sobraram fora dos times — reservas gerais. Podem entrar
  // em qualquer time via substituição. No server: cria Jogador + Attendance
  // ('lista_espera'), NÃO cria TeamPlayer.
  reservas: z.array(jogadorStandaloneSchema).max(30).default([]),
});
export type CriarPartidaStandaloneBody = z.infer<typeof criarPartidaStandaloneBodySchema>;

// Body opcional do POST /partidas/:id/iniciar. Usado quando o admin dispara
// o modo ao vivo em uma partida já agendada (tradicional) e precisa passar
// as regras do live que ainda não existem naquela Partida.
export const iniciarPartidaAoVivoBodySchema = z
  .object({
    metaGols: z.number().int().min(1).max(20).optional(),
    duracaoMinutos: z.number().int().min(1).max(240).nullable().optional(),
    modoDesempate: modoDesempateSchema.optional(),
  })
  .default({});
export type IniciarPartidaAoVivoBody = z.infer<typeof iniciarPartidaAoVivoBodySchema>;

// Body para registrar um evento (gol, gol contra, expulsão…). `minutoJogo`
// é opcional: se omitido, o server calcula a partir de `iniciadoEm` menos
// pausas. `assistenteJogadorId` só é lido pra tipo=gol.
export const criarEventoBodySchema = z.object({
  teamId: z.string().uuid(),
  jogadorId: z.string().uuid().nullable().default(null),
  assistenteJogadorId: z.string().uuid().nullable().default(null),
  tipo: tipoEventoSchema.default('gol'),
  minutoJogo: z.number().int().nonnegative().nullable().default(null),
});
export type CriarEventoBody = z.infer<typeof criarEventoBodySchema>;

// Finalizar manualmente. `forcado` reservado para futuro override (ex: fim
// por tempo esgotado) — no MVP o server rejeita se estiver empatado.
export const finalizarPartidaBodySchema = z
  .object({
    forcado: z.boolean().default(false),
  })
  .default({});
export type FinalizarPartidaBody = z.infer<typeof finalizarPartidaBodySchema>;

// Declaração de vencedor no desempate. `golsPenaltis*` só é lido quando o
// modo é `penaltis` ou `shootout` — nesses casos, o server grava um evento
// `penalti_desempate` por gol pra manter o histórico.
export const declararDesempateBodySchema = z.object({
  vencedorTeamId: z.string().uuid(),
  golsPenaltisTimeA: z.number().int().nonnegative().max(50).default(0),
  golsPenaltisTimeB: z.number().int().nonnegative().max(50).default(0),
});
export type DeclararDesempateBody = z.infer<typeof declararDesempateBodySchema>;

// Nova composição de times por rotação. Substitui completamente os
// TeamPlayers dos times listados — eventos históricos ficam intactos
// (teamId original preservado).
export const rotacionarTimesBodySchema = z.object({
  times: z
    .array(
      z.object({
        teamId: z.string().uuid(),
        jogadores: z.array(z.string().uuid()),
      }),
    )
    .min(2),
});
export type RotacionarTimesBody = z.infer<typeof rotacionarTimesBodySchema>;

// Body para adicionar um jogador durante a partida (ex: alguém chega
// atrasado). Se `teamId` é passado, entra direto no time como titular.
// Se `teamId` é null (reserva geral), o jogador fica no banco sem time
// vinculado — entra depois via substituição escolhendo o time.
export const adicionarJogadorPartidaBodySchema = z.object({
  teamId: z.string().uuid().nullable().default(null),
  nome: z.string().min(1).max(60),
  funcao: funcaoPartidaSchema.default('linha'),
});
export type AdicionarJogadorPartidaBody = z.infer<typeof adicionarJogadorPartidaBodySchema>;

// Body pra substituição:
// - `entraId`: jogador reserva que vai a campo
// - `saiId`: titular que sai (opcional — se null, `entra` só entra)
// - `teamId`: destino de `entra`. Obrigatório se `saiId=null`. Se ambos
//   presentes, `teamId` precisa bater com o time atual de `sai`.
export const substituirJogadorBodySchema = z.object({
  entraId: z.string().uuid(),
  saiId: z.string().uuid().nullable().default(null),
  teamId: z.string().uuid().nullable().default(null),
});
export type SubstituirJogadorBody = z.infer<typeof substituirJogadorBodySchema>;

// Racha de 3+ times: define quais dois times estão em campo agora. Só pode
// ser chamado com a partida em `agendada` ou entre rodadas (não durante).
export const definirEmCampoBodySchema = z.object({
  emCampoTeamIds: z.array(z.string().uuid()).length(2),
});
export type DefinirEmCampoBody = z.infer<typeof definirEmCampoBodySchema>;

// Refaz o sorteio dos jogadores entre os times existentes. Preserva os
// times (nomes/cores), redistribui os Attendances. Só em `agendada`.
export const resortearJogadoresBodySchema = z.object({
  jogadoresLinha: z.number().int().min(1).max(15).default(5),
});
export type ResortearJogadoresBody = z.infer<typeof resortearJogadoresBodySchema>;

// Encerra a rodada atual (grava evento âncora `rodada_encerrada` com o
// vencedor), rotaciona os times em campo (perdedor sai, `entraTeamId` entra;
// se omitido, próximo da fila entra) e incrementa `rodadaAtual`. Placar da
// próxima rodada começa em 0 × 0.
export const encerrarRodadaBodySchema = z.object({
  vencedorTeamId: z.string().uuid(),
  entraTeamId: z.string().uuid().nullable().default(null),
});
export type EncerrarRodadaBody = z.infer<typeof encerrarRodadaBodySchema>;
