# Plano — Partidas com múltiplos times (2+ em campo, resto na fila)

**Data:** 2026-09-22
**Autor:** lucas@autoforce.com
**Status:** rascunho pra revisão

---

## 1. Contexto

Essa doc surgiu ao criar uma partida avulsa com 3 times no wizard `/pelada/iniciar` e cair na tela `/partidas/[id]/ao-vivo`. Três dores apareceram:

1. **Parece que os 3 times vão jogar ao mesmo tempo** — o placar mostra os 3 empilhados, sem indicação de quem está em campo agora.
2. **"Iniciar cronômetro" não deixa escolher quais 2 começam** — não existe conceito de escalação inicial pra racha de 3+ times.
3. **A ação de sortear é one-shot** — no ao-vivo agendado só existe o botão "Iniciar cronômetro"; se o usuário quiser re-sortear, precisa recriar a partida.

O gap é conceitual: **o modelo atual trata todos os N times como "jogando simultaneamente"**, mas o mental model do usuário é a mecânica clássica de racha (2 em campo + resto na fila, vencedor fica). Essa doc mapeia o que já existe, o gap, e propõe um plano pra fechar sem retrabalho.

---

## 2. Telas de partida hoje

| Rota | Arquivo | Função |
|---|---|---|
| `/pelada/iniciar` | `apps/web/src/app/pelada/iniciar/page.tsx` | Wizard 4-steps (Regras → Times → Jogadores → Sorteio-preview) pra criar partida avulsa. Cria `Partida` em `agendada` via `POST /partidas`. |
| `/partidas/[id]` | `apps/web/src/app/partidas/[id]/page.tsx` | Detalhe "tradicional" (presença/sorteio/resultado manual). Redireciona pra `/ao-vivo` ou `/resumo` se for avulsa/live. |
| `/partidas/[id]/ao-vivo` | `.../ao-vivo/page.tsx` | Tela principal ao vivo. Placar, cronômetro, tap = gol, long-press = menu (gol contra, expulsão). |
| `/partidas/[id]/rotacionar` | `.../rotacionar/page.tsx` | Redistribui **jogadores entre times** (swap). Não mexe em placar/eventos. |
| `/partidas/[id]/substituir` | (sheet no ao-vivo, endpoint `POST /partidas/:id/substituir`) | Troca reserva ↔ titular via `Attendance.status`. |
| `/partidas/[id]/desempate` | `.../desempate/page.tsx` | Resolve empate (par-ímpar, pênaltis/shootout, gol de ouro). |
| `/partidas/[id]/gols` | `.../gols/page.tsx` | Fluxo offline: registrar gols retroativamente, sem cronômetro. |
| `/partidas/[id]/resumo` | `.../resumo/page.tsx` | Placar final, artilheiros, share, "Nova pelada" (duplica). |

Componentes-chave no ao-vivo:
- `PlacarGigante` (2 times) vs `PlacarPorTime` (3+ times).
- `ColunaTime` — cards de jogadores por time; `BotaoJogador` recebe tap/long-press.
- `SheetReservas`, `SheetAdicionarJogador`, `MenuJogador`, `SheetAssist`.

---

## 3. Modelo de dados hoje

### 3.1 `Partida` (contract + Prisma)

Campos relevantes:
- `status`: `agendada | em_andamento | finalizada | cancelada`.
- `metaGols`, `duracaoMinutos`, `modoDesempate` — regras da partida.
- `iniciadoEm`, `pausadoEm`, `finalizadoEm`, `duracaoPausadaSegundos` — timer.
- `placarTimeA`, `placarTimeB` — **legado**: só usado pros 2 primeiros times por ordem alfabética. Placar real é derivado de `EventoPartida` (via `recalcularPlacarEFinalizarSeAtingiuMeta`, [partidas.ts:131-191](apps/api/src/routes/partidas.ts#L131-L191)).
- `desempateVencedorTeamId` — quando resolvido por desempate.
- `peladaId`, `temporadaId` — `null` = standalone.

### 3.2 `Team` / `TeamPlayer`
- `Team { id, partidaId, nome, cor }`.
- `TeamPlayer { teamId, jogadorId }` (unique). Ao rotacionar, o backend deleta e recria os `TeamPlayer` afetados; `EventoPartida` continua apontando pro `Team.id` original.

### 3.3 `Attendance`
- Presença por (partida, jogador). Campo `status` = `confirmado | lista_espera | recusado`.
- Hoje é o único proxy pra "titular vs reserva": `confirmado` = joga, `lista_espera` = reserva.

### 3.4 `EventoPartida`
- `{ partidaId, teamId, jogadorId?, assistenteJogadorId?, tipo, minutoJogo, criadoPorUserId }`.
- `tipo` ∈ `gol | gol_contra | penalti_desempate | expulsao`.
- É a fonte de verdade do placar. `gol_contra` já vira "gol pró-time beneficiado" no cliente.

### 3.5 `EstatisticaPartida`
- Agregado por jogador (gols, assist, mvp), criado ao finalizar.

### 3.6 O que **não existe** hoje
- Nenhum campo tipo `emCampo: [teamId, teamId]` — não há noção de "quem tá jogando agora" vs "quem espera".
- Nenhum ranking acumulado no dia: uma partida = um placar, sem histórico de mini-rodadas.
- Nenhuma mecânica "vencedor fica, perdedor sai".

---

## 4. Jornadas do usuário

Três jornadas: como funciona hoje pra partida simples (2 times), como funciona hoje pra racha com 3+ times (que é o que confunde), e como queremos que funcione depois da mudança.

### 4.1 Jornada A — Partida entre 2 times (hoje, funciona bem)

O usuário chega no app decidido a criar um racha. Toca no botão flutuante "Iniciar pelada" e cai no wizard. Passa pelos 3 passos: define nome do racha, quantos jogadores por time, meta de gols, duração, como resolve empate; nomeia os dois times (Time A verde, Time B vermelho); cadastra a galera que chegou marcando os goleiros.

Ele escolhe "sortear" — digita a lista, vê o preview dos dois times já montados com 1 goleiro e 5 na linha em cada, e ainda tem chance de re-sortear ou editar antes de confirmar. Toca em "Começar partida!" e é levado pra tela ao vivo.

Na tela ao vivo ele vê o placar gigante `0 × 0` no topo, os dois times lado a lado com os nomes dos jogadores, e um único botão amarelão "Iniciar cronômetro". A partida ainda está `agendada` — o cronômetro só começa a andar quando ele apertar. Isso é intencional: o usuário digita tudo em casa e só ativa o timer quando a bola realmente rolar.

Toca em "Iniciar cronômetro", o cronômetro começa a correr. Quando alguém faz um gol, ele toca no nome do jogador; sobe uma sheet perguntando "Gol de X?", ele confirma, e em seguida uma segunda sheet pergunta "Quem deu a assistência?" com os outros jogadores do mesmo time como opções. Ele escolhe (ou "sem assistência") e o placar já sobe. Cada gol atualiza o placar em tempo real.

Se um time chega na meta (por exemplo, 2 gols), a partida finaliza sozinha e ele é levado pra tela de resumo. Se o tempo estourar sem ninguém chegar na meta e ele quiser encerrar, toca em "Finalizar" na barra inferior. Se der empate, o app abre a tela de desempate (par ou ímpar / pênaltis / gol de ouro, dependendo do que ele escolheu no wizard).

**Essa jornada funciona bem.** O modelo mental do usuário e o modelo do app estão alinhados: dois times, um placar, um vencedor.

### 4.2 Jornada B — Racha com 3 times (hoje, é onde quebra)

Agora o mesmo usuário quer um racha de 3 times, mecânica clássica: dois times jogam, o terceiro espera, quem perde sai, quem vence fica.

Ele passa pelo mesmo wizard, mas dessa vez adiciona um terceiro time (FLA, FLU, VAS). Sorteia os jogadores, os 3 times ficam formados com 5 na linha + goleiro cada. Toca em "Começar partida!" e cai na tela ao vivo.

**Aqui vem a estranheza.** Em vez do placar gigante `0 × 0` que ele viu antes, aparecem **três linhas empilhadas**, uma pra cada time: FLA 0, FLU 0, VAS 0. Logo abaixo, o card de reservas. Embaixo, o mesmo botão "Iniciar cronômetro".

O usuário para e pensa: "Uai. Vai começar assim, os 3 times ao mesmo tempo? Onde eu escolho quem entra primeiro?". Não tem essa opção. O app está tratando os 3 times como se todos fossem jogar juntos, e o botão de iniciar não pergunta nada — só liga o cronômetro.

Se ele tocar em "Iniciar cronômetro" mesmo assim, a tela continua com os 3 times, todos com colunas de jogadores clicáveis, e o gol pode ser marcado por qualquer jogador de qualquer time a qualquer momento. Não existe restrição de "só quem está em campo pode marcar". O app não sabe que dois times deveriam estar em campo e um esperando.

Piora quando alguém faz gol: se FLA chega em 2 e FLU e VAS estão em 0, a partida finaliza sozinha (porque FLA atingiu a meta sozinho). Mas se FLA e FLU ambos chegam em 2 no mesmo momento, o app **não finaliza** — porque o código só finaliza quando um único time atinge a meta. E se FLA e FLU terminam empatados 2-2 e VAS em 0, ao tocar em "Finalizar" o app pode retornar erro de empate (a lógica de empate só compara os dois primeiros times por ordem alfabética, ignorando o terceiro), mandando o usuário pra tela de desempate mesmo tendo um cenário 3 vias.

Já existe uma tela `/rotacionar` no app, e o usuário pode achar que ela resolve isso. **Mas não resolve.** `/rotacionar` só serve pra trocar **jogadores entre times** (ex: mover o Pedro do FLA pro VAS). Ela não muda quais times estão em campo — porque esse conceito nem existe.

**Resumo da jornada B:** o usuário criou um racha de 3 times imaginando a mecânica clássica, mas o app entrega uma partida "aberta" onde os 3 times somam gols simultaneamente, sem fila, sem rotação por resultado, sem ranking. É confuso já na primeira tela e vai piorando conforme o jogo anda.

### 4.3 Jornada C — Racha com 3 times (proposta, como queremos)

Depois da mudança, o mesmo cenário passa a fluir assim:

**Antes do jogo começar.** O usuário faz o wizard igual (nome, formato, times, jogadores). Uma linha nova aparece nos textos explicativos: **"Vocês vão jogar em rodadas: 2 times em campo, o resto espera. Quem vence fica, quem perde sai."** Isso alinha a expectativa antes de ele chegar no ao-vivo.

Ao chegar na tela ao-vivo com a partida ainda `agendada`, o layout é diferente do de hoje. **No topo, o placar principal exibe só dois times** — dois cards lado a lado, `FLA 0 × 0 FLU`, do jeito familiar de uma partida de 2 times. Logo abaixo dos cards, uma linhazinha discreta indica **"⏳ VAS aguardando"**. Ao lado de cada time em campo tem um pequeno botão "trocar" — se o usuário tocar, sobe uma lista dos times aguardando pra ele escolher outro pra entrar no lugar. Se ele quer que o app decida, tem um "🎲 sortear quem começa".

Na barra de baixo, dois botões: à esquerda **"🎲 Sortear novamente"** (refaz a distribuição de jogadores entre os times sem sair da tela) e à direita **"▶ Iniciar cronômetro"** (só fica ativo com os 2 times em campo definidos, o que já vem por default).

**Durante a rodada.** Ele confirma que FLA e FLU começam (VAS espera) e toca em iniciar. A tela ao vivo agora se comporta como uma partida de 2 times: placar principal só de FLA × FLU, colunas de jogadores só desses dois times. O time que espera (VAS) some do foco visual; o único indicador é aquela linhinha "VAS aguardando".

**Substituição no meio da rodada.** A qualquer momento, o usuário pode tocar num jogador do time em campo e ver, além das opções de gol/gol contra/expulsão, uma nova opção: **"↻ Substituir"**. Ao tocar, sobe uma sheet listando **todos os jogadores fora de campo** — reservas do próprio time (como já é hoje) **mais os jogadores do time aguardando** (VAS, no exemplo). Ele escolhe quem entra, e o app faz a troca: o jogador que estava em campo sai, o de fora entra. Isso destrava a mecânica de "meu goleiro tá cansado, empresta o goleiro do VAS por essa rodada" — comum em racha de fim de tarde. (Semântica exata de o jogador "voltar" ou não pro time original na próxima rodada tá em aberto — ver §7.2.)

**Fim da rodada e sequência de vitórias.** FLA marca, o placar vai pra `FLA 1 × 0 FLU`. FLA marca de novo — meta atingida. O app **não finaliza a partida inteira**; em vez disso, entende que a **rodada** acabou e abre uma sheet: **"Rodada 1 encerrada — FLA venceu (2 × 0 FLU). VAS entra no lugar de FLU. Confirma?"**. O usuário pode trocar quem entra antes de confirmar. Ao confirmar, o placar zera, os cards passam pra `FLA × VAS`, a rodada 2 começa.

FLA ganha de novo — venceu 2 seguidas. A partir daí, **um pequeno 🔥 aparece ao lado do nome do FLA no placar**. Se emplacar uma terceira vitória, vira 🔥🔥 (ou o ícone cresce, dependendo do que ficar melhor visualmente). Basta FLA perder uma rodada pra sequência zerar. É um detalhe visual barato que dá "vibe" de racha — todo mundo sabe qual time tá invicto.

**Estatísticas escondidas atrás de um botão.** Em vez de um bloco de "ranking do dia" ocupando espaço permanente no topo, a tela tem um botão discreto na barra superior: **"🏆 Estatísticas"** (ou um ícone de troféu). Ao tocar, abre uma sheet/tela dedicada com:

- **Ranking dos times** — vitórias, empates, derrotas, saldo de gols; times com 🔥 destacados; time atual em campo marcado.
- **Artilharia do dia** — jogadores ordenados por gols na sessão inteira, independente de que time estavam.
- **Rodadas jogadas** — lista das rodadas anteriores com "Time X 2 × 0 Time Y" e horário.
- Se der pra encaixar sem poluir: assistências, expulsões do dia.

Assim o placar principal fica limpo (só quem tá jogando agora), e quem quiser conferir "quem tá ganhando o dia?" ou "quem é o artilheiro?" tem um lugar único pra olhar.

**Fim do racha.** A qualquer momento o usuário toca em "Encerrar racha" na barra inferior — aí sim a partida inteira fecha. A tela de resumo mostra o mesmo conteúdo daquela sheet de estatísticas, agora como resultado final: pódio dos times, artilheiros consolidados, e o botão "Nova pelada" pra recomeçar com os mesmos jogadores.

**Comparação em uma frase:** hoje, o app trata um racha de 3 times como "uma partida onde todo mundo joga junto"; depois da mudança, trata como "várias mini-partidas em série, com fila entre times, empréstimo de jogadores, sequência de vitórias e estatísticas do dia" — que é o que o usuário sempre quis dizer com "racha".

---

## 5. Proposta

### 5.1 Princípio
Representar explicitamente **"partida em curso" vs "fila de times"** dentro de uma **sessão de racha**. A `Partida` do modelo atual continua sendo uma unidade de "duelo" (2 times × placar × meta). O que muda é: quando o usuário cria um racha com 3+ times, ele cria uma **Sessão** que agenda várias `Partida`s em série.

Duas opções de nível de mudança:

#### Opção A — Sessão explícita (correta, maior impacto)
- Novo modelo `Sessao` (ou reaproveitar `Pelada` como container) que agrupa `Partida`s e `Team`s.
- `Team` sobe pra `Sessao` (times persistem entre partidas do dia).
- Cada `Partida` referencia 2 `teamId`s.
- Ranking = agregado de resultados das `Partida`s da sessão.
- Prós: modelo limpo, ranking é derivado natural, rotação = criar nova `Partida` com os teamIds certos.
- Contras: schema muda em várias tabelas, migração, mexe em telas existentes.

#### Opção B — Estado dentro da `Partida` existente (mais leve, escopo do quick-win)
- Manter `Partida` como "container do dia" (com N times).
- Adicionar em `Partida`: `emCampoTeamIds: string[2]`, `rankingSnapshot: { teamId, vitorias, saldoGols }[]` (JSON), `rodadaAtual: number`.
- Placar/eventos da rodada atual continuam em `EventoPartida`, mas cada nova rodada adiciona uma "âncora" (evento tipo `rodada_encerrada` com vencedorTeamId) e zera o "placar da rodada" derivado.
- Prós: sem novo modelo, migração é aditiva.
- Contras: a `Partida` deixa de ser um "duelo" e vira um "container de duelos" (mistura de conceitos); dificulta consultas de estatísticas históricas depois.

**Recomendação:** começar pela **Opção B** pra desbloquear a UX rápido, aceitando o débito, com plano de migrar pra Opção A quando tivermos sessão recorrente (peladas) usando a mesma feature.

### 5.2 Mudanças (Opção B)

**Contract (`packages/contracts/src/schemas/partida.ts`)**
- Adicionar em `PartidaDTO`:
  - `emCampoTeamIds: [string, string] | null` — nulo em `agendada` sem escolha; sempre 2 elementos em `em_andamento`.
  - `rodadaAtual: number` (default 1).
  - `ranking: { teamId, vitorias, empates, derrotas, saldoGols, streakVitorias }[]` — deriva de eventos + rodadas encerradas; enviado read-only pelo backend. `streakVitorias` = quantas vitórias consecutivas na sessão atual (0 se última rodada foi derrota/empate).
- Novos/estendidos endpoints:
  - `POST /partidas/:id/em-campo` body `{ emCampoTeamIds: [string, string] }` — define quem está em campo; só permitido em `agendada` ou entre rodadas.
  - `POST /partidas/:id/resortear` body `{ jogadoresLinha: number }` — refaz o sorteio dos jogadores entre os times (pool = todos os `Attendance` da partida). Só permitido em `agendada`.
  - `POST /partidas/:id/encerrar-rodada` body `{ vencedorTeamId, entraTeamId? }` — encerra a rodada atual, troca `emCampoTeamIds`, incrementa `rodadaAtual`. Se `entraTeamId` for omitido, backend pega o próximo da fila.
  - **`POST /partidas/:id/substituir`** (já existe, **estender**) — hoje só troca reserva ↔ titular do mesmo time. Passa a aceitar `entraJogadorId` de qualquer jogador da partida (reserva do próprio time OU jogador do time aguardando) e `saiJogadorId` de qualquer jogador em campo. Backend faz a troca ajustando `TeamPlayer` (jogador que entra é reatribuído ao time em campo) — ver §7.2 sobre a semântica de "voltar" pro time original.
- Novo tipo de evento: `rodada_encerrada` em `TIPO_EVENTO`, com `teamId` = vencedor.

**DB (`packages/db/prisma/schema.prisma`)**
- `Partida`: `emCampoTeamIds String[] @db.Uuid` (Postgres array, tamanho 2), `rodadaAtual Int @default(1)`.
- `EventoPartida`: aceitar novo `tipo=rodada_encerrada` — sem mudança de schema, só validação.
- Se a substituição for "empréstimo" (jogador volta pro time original), precisa de tabela auxiliar tipo `TeamPlayerSubstituicao { partidaId, rodada, entraTeamPlayerId, saiTeamPlayerId, criadoEm }` pra rastrear. Se for "definitiva" (jogador muda de time pra sempre), basta reatribuir `TeamPlayer` como já é feito no `/rotacionar` — sem tabela nova.
- Migração aditiva; partidas legadas ficam com `emCampoTeamIds=[]`.

**Backend (`apps/api/src/routes/partidas.ts`)**
- Ajustar `POST /partidas` (criação avulsa): se `times.length > 2`, seta `emCampoTeamIds = [times[0].id, times[1].id]` como default.
- `POST /partidas/:id/iniciar`: validar que `emCampoTeamIds` está definido (retornar 422 se não).
- Novo cálculo de "placar da rodada atual" na função `recalcularPlacarEFinalizarSeAtingiuMeta`: contar só eventos após o último `rodada_encerrada`.
- Finalização automática de rodada quando o time em campo atinge `metaGols` sozinho: em vez de finalizar a `Partida`, dispara "encerrar rodada" automático (backend abre sheet no cliente? ou faz sozinho? — ver questão aberta em §7).
- Cálculo do `streakVitorias`: percorre `rodada_encerrada` do mais recente pro mais antigo; conta enquanto o `teamId` (vencedor) for o mesmo do time em análise; para na primeira rodada em que ele perdeu ou não estava em campo.

**Frontend (`apps/web/src/app/partidas/[id]/ao-vivo/page.tsx` + `iniciar/page.tsx`)**
- No ao-vivo `agendada` com 3+ times:
  - Placar principal já mostra só os 2 times `emCampoTeamIds` (visual de partida 2 vs 2).
  - Linhazinha discreta "⏳ Times aguardando: VAS" abaixo dos cards.
  - Botão "trocar" ao lado de cada time em campo (picker dos times aguardando).
  - Bottom bar com **2 botões**: "Sortear novamente" (`POST /resortear`) e "Iniciar cronômetro".
- No ao-vivo `em_andamento` com 3+ times:
  - Placar principal só dos 2 `emCampoTeamIds`. Se `streakVitorias >= 2` num deles, mostra 🔥 (ou 🔥🔥/🔥🔥🔥 conforme cresce) ao lado do nome.
  - Colunas de jogadores só dos 2 em campo.
  - Sem "ranking do dia" visível — substituído por botão **"🏆 Estatísticas"** na barra superior.
  - **Menu do jogador (long-press ou tap) ganha opção "↻ Substituir"** — abre sheet listando reservas do time + jogadores do time aguardando. Toque em quem entra chama `POST /substituir`.
  - Sheet de estatísticas (nova, `SheetEstatisticasDoDia`): 3 abas ou seções — ranking dos times (com streaks), artilharia, rodadas jogadas.
  - Ao registrar gol que fecha rodada → sheet "Rodada encerrada — vencedor Time X. Quem entra?" com lista dos times aguardando (default = próximo na fila).
- No `/rotacionar` — mantém como está (troca jogadores entre times); talvez adicionar botão "trocar quem está em campo".
- No `/resumo` — reusa o layout da `SheetEstatisticasDoDia` como conteúdo principal, agora estático (racha finalizado).

### 5.3 Bloco de UX específico do wizard
- No `/pelada/iniciar`, quando o usuário escolher 3+ times, adicionar step opcional ou texto explicativo: "Vocês vão jogar em rodadas: 2 times em campo, o resto espera. Vencedor fica, perdedor sai — mas dá pra emprestar jogador entre times a qualquer momento."

---

## 6. Chamadas de API por momento da jornada C

Referência rápida pra amarrar cada beat da jornada em §4.3 com o que o backend precisa expor.

| Momento na jornada | Chamada backend | Efeito |
|---|---|---|
| Criar racha (3 times) | `POST /partidas` (já existe, ajustado) | Cria `Partida` com `emCampoTeamIds` default = 2 primeiros times. |
| Escolher/trocar quem começa | `POST /partidas/:id/em-campo` (novo) | Atualiza `emCampoTeamIds`. Só permitido em `agendada` ou entre rodadas. |
| Sortear novamente | `POST /partidas/:id/resortear` (novo) | Redistribui os jogadores dos `Attendance` pelos times existentes. Só em `agendada`. |
| Iniciar cronômetro | `POST /partidas/:id/iniciar` (já existe, ajustado) | Valida que `emCampoTeamIds` está setado; status vira `em_andamento`. |
| Marcar gol | `POST /partidas/:id/eventos` (já existe) | Grava evento; backend detecta se atingiu meta da rodada. |
| Substituir jogador (reserva **ou** time aguardando) | `POST /partidas/:id/substituir` (já existe, **estendido**) | Reatribui `TeamPlayer`: quem entra vai pro time em campo, quem sai vai pro banco. Opcionalmente registra o empréstimo. |
| Ver estatísticas do dia | (leitura, sem chamada nova) | Frontend lê `ranking` + `eventos` do `PartidaAoVivo` e renderiza sheet. |
| Encerrar rodada (auto ou manual) | `POST /partidas/:id/encerrar-rodada` (novo) | Grava evento âncora `rodada_encerrada`; atualiza `emCampoTeamIds`, `rodadaAtual`, ranking. |
| Encerrar racha | `POST /partidas/:id/finalizar` (já existe, ajustado) | Só encerra depois do usuário confirmar; ranking do dia entra no resumo. |

---

## 7. Escopo, faseamento e questões abertas

### 7.1 Faseamento sugerido

**Fase 1 — Fix imediato (só frontend, sem model change):**
- No ao-vivo `agendada` com 3+ times, adicionar label "Ranking do dia" + botão placeholder "Sortear novamente" (por enquanto redireciona pra `/pelada/iniciar` com dados preenchidos) + botão "Iniciar cronômetro".
- Deixa claro visualmente que os 3 times não jogam ao mesmo tempo, mesmo sem backend suportar a mecânica.
- Custo: pequeno. Ganho: reduz confusão imediata.

**Fase 2 — Opção B minimal (backend + frontend):**
- Migração aditiva (`emCampoTeamIds`, `rodadaAtual`).
- Endpoints `/em-campo`, `/resortear`, `/encerrar-rodada`.
- Ao-vivo com toggle real de quem está em campo.
- Ainda sem ranking derivado — só rotação manual.

**Fase 3 — Ranking + finalização automática de rodada:**
- Derivação do ranking a partir de `rodada_encerrada`.
- Sheet automática ao atingir `metaGols`.
- `/resumo` com ranking do dia.

**Fase 4 (opcional) — migrar pra Opção A (Sessão explícita):**
- Só se aparecer necessidade de peladas recorrentes com múltiplas rodadas persistidas.

### 7.2 Questões pra você revisar
1. **Opção B agora ou pular direto pra Opção A?** Se você já sabe que peladas recorrentes vão precisar disso, talvez valha investir em A logo.
2. **"Sortear novamente" no ao-vivo agendado deve:**
   - (a) só redistribuir jogadores entre os times existentes, OU
   - (b) também re-embaralhar quais 2 times começam, OU
   - (c) as duas ações em botões separados?
3. **Ao atingir `metaGols`**, a rodada encerra automaticamente ou o usuário confirma?
4. **Empate com meta atingida** (ex.: os 2 times em campo estão 2 × 2 e a meta é 2): mantemos a lógica de desempate atual ou "gol de ouro" fica sendo o default pra racha?
5. **O que acontece com jogadores** quando os times rotacionam entre rodadas? Ficam fixos por time (o time que entra mantém seus jogadores), ou re-embaralha?
6. **Semântica da substituição cross-time (item novo):** quando o Pedro, do time VAS aguardando, entra no lugar do João no FLA em campo:
   - (a) **Empréstimo por rodada** — Pedro joga essa rodada pelo FLA, mas volta pro VAS quando o VAS entrar de fato na próxima rodada. Precisa de tabela auxiliar de "substituições" pra rastrear origem.
   - (b) **Definitivo** — Pedro passa a ser do FLA pra sempre nessa sessão. João vai pro banco. Se o VAS entrar depois, joga sem o Pedro. Sem tabela nova; comportamento igual ao `/rotacionar` atual.
   - (c) **Empréstimo, com opção "confirmar transferência"** — default é (a), mas o usuário pode marcar "transferência definitiva" no momento da substituição.
7. **Foguinho de streak:** como escalar visualmente? Uma opção: `🔥` a partir de 2 vitórias seguidas; `🔥🔥` a partir de 4; `🔥🔥🔥` a partir de 6. Ou o ícone cresce em tamanho. Confirmar tresholds.
8. **Sheet de estatísticas:** rende como bottom-sheet dentro do ao-vivo (sobreposição) ou como tela cheia navegando em `/partidas/[id]/estatisticas`? Bottom-sheet mantém a partida acessível no fundo; tela cheia dá mais espaço mas exige voltar.
9. **Duração:** hoje `duracaoMinutos` é só display. Em modo rodadas, deveria funcionar como "tempo máximo de rodada" (encerra rodada por tempo se ninguém atingir a meta)?

Sinaliza qual direção você quer e a gente refina o plano antes de qualquer código.
