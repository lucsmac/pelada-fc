# Plano de Implementação — PeladaFC

Checklist organizado por etapa. Marcações: `[ ]` pendente · `[~]` em progresso · `[x]` feito.

---

## Etapa 0 — Fundação técnica

- [x] Escolher ORM — **Prisma** (decidido)
- [x] Estratégia de IDs — **UUID v7** gerado na aplicação (`gerarId()` em `@peladafc/db`)
- [x] Configurar Prisma + `packages/db` (`schema.prisma`, client singleton)
- [x] Criar schema Prisma inicial (Pelada, Jogador, Temporada, Partida, EstatisticaPartida)
- [x] Wire de `DATABASE_URL` no Fastify (plugin `plugins/prisma.ts` — decora `app.prisma`)
- [x] Seed script mínimo (1 pelada, 1 temporada, 3 jogadores) — `packages/db/prisma/seed.ts`
- [x] Setup de testes (Vitest) em `apps/api` e `packages/domain` — 4 testes passando
- [x] Rodar `prisma migrate dev --name init` — migration aplicada em Postgres 16 (porta **5433** para evitar conflito com outro projeto)
- [x] Executar seed — pelada + temporada + 3 jogadores inseridos
- [x] API sobe e responde `/health` 200 com Prisma decorado

## Etapa 1 — Autenticação

- [x] Entidade `User` (id, email, senhaHash, nome, criadoEm, atualizadoEm)
- [x] Relação `User 1:1 Jogador` opcional — `Jogador.userId` nullable → cadastro simples (só nome, sem conta) permanece possível
- [x] Contratos Zod: `signupBody`, `loginBody`, `authResponse`, `meResponse`, `erroResponse`
- [x] JWT (access 15m + refresh 30d) via `jsonwebtoken` — segredos separados
- [x] Refresh token em cookie httpOnly assinado (`peladafc_rt`, path `/v1/auth`)
- [x] Plugin `authPlugin` — decora `app.authenticate`, `signAccessToken`, `verifyRefreshToken`, etc.
- [x] Rotas: `POST /v1/auth/signup`, `login`, `refresh`, `logout` e `GET /me`
- [x] Seed com usuário de teste — `lucas@peladafc.dev` / `peladafc123`
- [x] Verificado ponta-a-ponta: signup 201 · me 200 · me sem token 401 · login 200 · refresh 200 · senha errada 401 · email duplicado 409
- [x] `Jogador.telefone` (único, nullable) como âncora de identificação — permite reivindicação
- [x] Signup com telefone: se número já pertence a Jogador órfão (`userId=null`) → **linka** ao existente e retorna `reivindicou:true` (histórico preservado); se já tem dono → 409
- [x] CORS com `credentials: true` para cookie de refresh cross-origin (`:3000` ↔ `:3333`)
- [x] Tela de login `/entrar` no `apps/web`
- [x] Tela de cadastro `/cadastrar` (nome, telefone com máscara, e-mail, senha) + tela de boas-vindas quando reivindicou
- [x] `AuthContext` React + `apiFetch` com refresh automático em 401
- [x] Cabeçalho global com estado logado/anônimo
- [x] Verificado: signup 201 · reivindicação 201 + Jogador antigo herdado · telefone duplicado 409 · telefone <10 dígitos 400 (Zod)

## Etapa 2 — Modelagem de Local (novo requisito)

- [x] Enum `TipoLocal`: `arena_society | campo_futebol_11 | campo_futebol_7 | campo_areia | quadra_coberta | quadra_aberta`
- [x] Enum `Superficie`: `grama_sintetica | grama_natural | areia | piso`
- [x] Entidade `Local` (nome, tipo, cidade/uf, bairro, endereço, lat/lng, superficies[], modalidadesSuportadas[], verificado, criadoPor)
- [x] Expandir `Modalidade`: `fut7 | campo_7 | campo_11 | society | futsal | beach_soccer | futevolei` (removeu `campo` ambíguo)
- [x] Refatorar `Pelada` para referenciar `localId` obrigatório (removidas colunas cidade/uf/bairro)
- [x] Contratos Zod: `criarLocalBodySchema`, `listarLocaisQuerySchema`, `localSchema` + rótulos PT-BR
- [x] Rotas `POST /v1/locais` (autenticada), `GET /v1/locais` (com filtros: cidade, uf, tipo, modalidade, busca), `GET /v1/locais/:id`
- [x] UI: página `/locais` (listagem com busca) e `/locais/novo` (formulário completo com chips multi-select)
- [x] Seletor de local no formulário de "criar pelada" (implementado em `/peladas/nova`)
- [x] Aplicar todas as migrations + rodar seed + validar ponta-a-ponta

## Etapa 3 — Peladas (CRUD completo)

- [x] Entidade `GroupMember` (peladaId, jogadorId, papel: admin/membro, entrouEm) + unique(peladaId, jogadorId)
- [x] Enum `PapelMembro` = `admin | membro`
- [x] Campos em Pelada: `descricao`, `limiteMembros`, `aprovacaoObrigatoria`, `criadoPorUserId` (FK obrigatório)
- [x] `POST /v1/peladas` (criar) — cria admin automaticamente via GroupMember
- [x] `PUT /v1/peladas/:id` (editar) — só admin
- [x] `DELETE /v1/peladas/:id` — só criador
- [x] `GET /v1/peladas/:idOrSlug` (detalhe) — respeita `publica`
- [x] `GET /v1/peladas/:id/membros` — lista membros com dados do jogador
- [x] `POST /v1/peladas/:id/membros` (admin adiciona) — **dois modos:** `existente` (jogadorId) ou `novo` (nome + telefone opcional → cria Jogador simples sem User; se telefone bater com Jogador órfão/existente, linka em vez de duplicar)
- [x] `DELETE /v1/peladas/:id/membros/:jogadorId` — admin remove outros ou membro se auto-remove; criador é protegido
- [x] Respeita `limiteMembros` ao adicionar
- [x] Filtros reais em `GET /v1/peladas` (cidade, uf, modalidade, dia, aberta, busca) sobre `publica: true`
- [x] UI `/peladas` — listagem pública com busca
- [x] UI `/peladas/nova` — formulário completo (auto-slug, seletor de local, dia/hora, regras)
- [x] UI `/peladas/[slug]` — detalhe (modalidade em destaque, tiles quando/onde/formato, lista de jogadores, botão "Gerenciar" só pra admin)
- [x] UI `/peladas/[slug]/gerenciar` — cadastro simples inline (nome + telefone opcional) + lista de membros com badge "sem conta" + remover
- [x] Cabeçalho global: links Peladas e Locais
- [x] Home page com CTAs para logado (Ver peladas / Criar pelada)

## Etapa 4 — Partidas e organização de jogo

- [x] Entidade `Partida` refinada (status, criadoEm) + `Attendance` (partidaId, jogadorId, status: confirmado/recusado/lista_espera)
- [x] Entidades `Team` + `TeamPlayer`
- [x] Enums `StatusPartida` e `StatusPresenca`
- [x] `POST /v1/peladas/:id/partidas` (criar partida — usa temporada ativa se não passada)
- [x] `POST /v1/partidas/:id/presenca` (confirmar/recusar; admin pode marcar terceiros)
- [x] `POST /v1/partidas/:id/sorteio` (Fisher–Yates entre confirmados; 2-6 times)
- [x] `POST /v1/partidas/:id/resultado` (placar + eventos em transação; muda status → finalizada)
- [x] `GET /v1/partidas/:id` (detalhe completo: presenças, times, eventos)
- [x] Eventos (gols/assist/MVP) via `EstatisticaPartida`
- [x] UI: fluxo de partida — `/peladas/[slug]/partidas` (lista + agendar) e `/partidas/[id]` (presença → sorteio → resultado com stepper de gols/assist e toggle MVP)

## Etapa 5 — Estatísticas e Rankings persistidos

- [x] Serviço `calcularRanking` em `apps/api/src/services/estatisticas.ts` — agrega gols/assist/MVP + vitórias/empates/derrotas (derivados do placar e do time em que o jogador estava)
- [x] `ordenarRanking()` do domain conectado a queries reais
- [x] `GET /v1/peladas/:id/rankings?categoria=&temporadaId=` — 6 categorias (geral, artilharia, vitorias, assistencias, mvp, aproveitamento)
- [x] `GET /v1/rankings` (global) e `GET /v1/jogadores/:id/estatisticas?peladaId=` (contextual)
- [x] UI `/peladas/[slug]/ranking` — tabs por categoria, destaque dourado 1º lugar

## Etapa 6 — Temporadas

- [x] Campos em `Temporada`: `nome`, `encerradaEm` (config inline; SeasonConfiguration separado adiado — não é bloqueante)
- [x] Entidade `SeasonRanking` (snapshot Jsonb congelado ao encerrar)
- [x] `POST /v1/peladas/:id/temporadas` (unique ano+numero por pelada, ativa como atual)
- [x] `PUT /v1/temporadas/:id` (bloqueia se encerrada)
- [x] `POST /v1/temporadas/:id/encerrar` — snapshot + desvincula da pelada
- [x] `POST /v1/temporadas/:id/ativar` — troca a temporada atual
- [x] Regra: `POST /peladas/:id/partidas` usa `temporadaAtualId` quando não passa `temporadaId` (422 se não há temporada ativa)
- [x] UI `/peladas/[slug]/temporadas` — criar, ativar, encerrar; badge "Atual" / "Encerrada"

## Etapa 7 — Descoberta

- [x] `GET /v1/cidades` — deriva de `Local.groupBy(cidadeNome, cidadeUf)` com `totalLocais`
- [x] `GET /v1/peladas` filtrando `publica: true` + filtros cidade, uf, modalidade, dia, aberta, busca
- [x] Página pública `/peladas/:slug` (pública se `pelada.publica`; se privada, exige membership; senão 404 pra não vazar existência)
- [x] UI `/peladas` — filtros: busca, cidade (select carregado de `/cidades`), modalidade, dia, chip "abertas para novos"
- [x] UI `/peladas/[slug]` — hero com modalidade, tiles quando/onde/formato, lista de jogadores

## Etapa 8 — Candidaturas e convites

- [x] Entidade `GroupApplication` (peladaId, userId, mensagem, status, criadoEm, respondidoEm)
- [x] Entidade `GroupInvitation` (peladaId, jogadorId, criadoPorUserId, status, expiraEm)
- [x] Enum `StatusSolicitacao` = `pendente | aceito | recusado | cancelado | expirado`
- [x] `POST /v1/peladas/:id/candidaturas` (user; valida publica + abertaParaNovos + não é membro)
- [x] `GET /v1/peladas/:id/candidaturas` (admin lista)
- [x] `POST /v1/candidaturas/:id/aprovar` / `recusar` (admin; aprovar cria GroupMember em transação)
- [x] `POST /v1/peladas/:id/convites` (admin; valida não-duplicado)
- [x] `GET /v1/convites/meus` (jogador vê próprios convites pendentes)
- [x] `POST /v1/convites/:id/aceitar` / `recusar` — aceitar cria GroupMember; expira se `expiraEm` já passou
- [x] UI: botão "Candidatar-se" na página pública (com mensagem opcional)
- [x] UI `/peladas/[slug]/candidaturas` — admin aprova/recusa
- [x] UI `/convites` — inbox do jogador

## Etapa 9 — Perfil e privacidade

- [x] Campos no `Jogador`: `perfilPublico`, `mostrarEstatisticas`, `mostrarPeladas`, `mostrarHistorico`, `posicao`
- [x] `GET /v1/jogadores/:id` respeita privacidade: 403 se `perfilPublico=false` e não é dono; oculta campos conforme flags; dono vê tudo
- [x] `PUT /v1/jogadores/:id` — editar próprio perfil (nome, apelido, posição, cidade)
- [x] `PUT /v1/jogadores/:id/privacidade` — toggles individuais
- [x] UI `/jogadores/[id]` — perfil público com métricas em tiles
- [x] UI `/perfil` — meus dados + toggles de privacidade

## Etapa 10 — Componentes UI

- [x] Biblioteca em `packages/ui/src/components`: `Botao`, `Campo`, `Card`+`CardHeader`, `Chip`, `Avatar`, `PlayerBadge`
- [x] Barrel `packages/ui/src/index.ts` exporta tokens + componentes
- [x] `apps/web/src/components/{botao,campo}.tsx` viraram re-exports do `@peladafc/ui` (compat)
- [ ] `RankingTable` — tabela ainda inline em `/peladas/[slug]/ranking`; extração futura quando surgir 2º uso

## Etapa 11 — Futuros (§23)

Detalhes de design + o que exige credenciais externas estão em [ROADMAP.md](ROADMAP.md).

- [x] **Feed / seguir peladas e jogadores** — entidades `PeladaFollow` e `JogadorFollow`; rotas `POST/DELETE /peladas/:id/follow`, `POST/DELETE /jogadores/:id/follow`, `GET /feed`; botão "Seguir" na página da pelada
- [x] **Rating de jogador (carta)** — `calcularRating()` no domain (0-99, mínimo 3 partidas); retornado em `GET /jogadores/:id` e exibido no perfil
- [ ] **Campeonatos e copas** — plano de design escrito em ROADMAP; falta implementação
- [ ] **Pagamentos e rateio** — bloqueado por credenciais (Mercado Pago / Stripe)
- [ ] **Integração WhatsApp** — bloqueado por credenciais (WhatsApp Business API / Twilio)
- [ ] **Reservas de quadra** — depende de arena piloto ou integração de terceiros

---

**Ordem recomendada:** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11.
**Marco de MVP jogável:** conclusão até etapa 5. ✅
**Marco de MVP com descoberta:** conclusão até etapa 8. ✅

---

## Migrations acumuladas (rodar todas com Docker ligado)

Ordem cronológica em `packages/db/prisma/migrations/`:

1. `20260918150839_init` — schema base (Pelada, Jogador, Temporada, Partida, EstatisticaPartida)
2. `20260918172832_add_user` — User + Jogador.userId
3. `20260918175750_add_telefone` — Jogador.telefone único
4. `20260918201914_locais_e_refactor_pelada` — enum Modalidade expandido, TipoLocal, Superficie, Local, refactor Pelada → localId
5. `20260918205346_peladas_crud` — GroupMember + PapelMembro + criadoPor + descricao + limiteMembros + aprovacaoObrigatoria
6. `20260918213209_partidas_presenca_times` — Attendance, Team, TeamPlayer, StatusPartida, StatusPresenca
7. `20260919144157_temporadas_snapshot` — Temporada.nome/encerradaEm + SeasonRanking
8. `20260919145105_candidaturas_convites` — GroupApplication + GroupInvitation + StatusSolicitacao
9. `20260919153441_jogador_privacidade_posicao` — flags de privacidade + Jogador.posicao
10. `20260919181838_follows` — PeladaFollow + JogadorFollow

Comandos:

```bash
docker compose -f infra/docker-compose.yml up -d
cd packages/db && pnpm exec prisma migrate deploy && pnpm db:seed
```

---

## Rotas da API (estado atual)

```
POST   /v1/auth/{signup,login,refresh,logout}
GET    /v1/auth/me

GET    /v1/cidades

GET    /v1/locais                       POST /v1/locais              GET /v1/locais/:id

GET    /v1/peladas                      POST /v1/peladas
GET    /v1/peladas/:idOrSlug            PUT/DELETE /v1/peladas/:id
GET    /v1/peladas/:id/membros          POST /v1/peladas/:id/membros
DELETE /v1/peladas/:id/membros/:jogadorId

GET    /v1/peladas/:id/partidas         POST /v1/peladas/:id/partidas
GET    /v1/partidas/:id
POST   /v1/partidas/:id/presenca
POST   /v1/partidas/:id/sorteio
POST   /v1/partidas/:id/resultado

GET    /v1/peladas/:id/temporadas       POST /v1/peladas/:id/temporadas
PUT    /v1/temporadas/:id
POST   /v1/temporadas/:id/encerrar      POST /v1/temporadas/:id/ativar

GET    /v1/rankings                     GET /v1/peladas/:id/rankings
GET    /v1/jogadores/:id/estatisticas

GET    /v1/jogadores/:id                PUT /v1/jogadores/:id
PUT    /v1/jogadores/:id/privacidade

POST   /v1/peladas/:id/candidaturas     GET /v1/peladas/:id/candidaturas
POST   /v1/candidaturas/:id/{aprovar,recusar}
POST   /v1/peladas/:id/convites         GET /v1/convites/meus
POST   /v1/convites/:id/{aceitar,recusar}

POST/DELETE /v1/peladas/:id/follow
POST/DELETE /v1/jogadores/:id/follow
GET    /v1/feed
```

## Páginas web (estado atual)

```
/                          home (CTA para logado / anônimo)
/entrar    /cadastrar      auth
/perfil                    meus dados + privacidade
/convites                  inbox

/locais                    listagem com busca
/locais/novo               formulário completo

/peladas                   descoberta com filtros (busca, cidade, modalidade, dia, aberta)
/peladas/nova              formulário (auto-slug, seletor de local, regras)
/peladas/[slug]            detalhe público (segue/candidata/vê jogadores)
/peladas/[slug]/gerenciar        admin: cadastro simples de jogador + remover
/peladas/[slug]/partidas         lista + agendar
/peladas/[slug]/candidaturas     admin: aprovar/recusar
/peladas/[slug]/ranking          tabela por categoria
/peladas/[slug]/temporadas       criar/ativar/encerrar

/partidas/[id]             presença → sorteio → resultado
/jogadores/[id]            perfil com rating (0-99) e carreira
```
