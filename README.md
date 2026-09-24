# PeladaFC

Plataforma para descobrir e organizar peladas de futebol amador.

## Stack

- **Monorepo:** pnpm workspaces + Turborepo
- **Web:** Next.js 15 (App Router) + React 19 + Tailwind CSS
- **API:** Fastify 5 + TypeScript + Zod
- **Domínio:** TypeScript puro (sem framework)
- **DB:** PostgreSQL (via Docker)
- **Runtime:** Node 22

## Estrutura

```
pelada-fc/
├── apps/
│   ├── web/           # Next.js — UI pública
│   └── api/           # Fastify — HTTP API
├── packages/
│   ├── domain/        # Entidades, VOs e regras (Pelada, Jogador, Ranking, Temporada)
│   ├── contracts/     # Schemas Zod + DTOs (fronteira web↔api)
│   ├── ui/            # Design tokens, tailwind preset, componentes React
│   └── config/        # tsconfig e eslint compartilhados
├── infra/             # docker-compose (Postgres)
├── design-refs/       # Protótipos HTML estáticos (fonte da verdade visual)
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

### Regras de dependência

- `domain` não depende de nada (puro).
- `contracts` depende só de `domain` + Zod.
- `ui` só depende de React (nunca importa `domain` — é agnóstico ao produto).
- `api` e `web` consomem `domain` + `contracts`; `web` também consome `ui`.

## Começando

### Pré-requisitos

- Node 22 (`nvm use`)
- pnpm 10 (`corepack enable`)
- Docker (para o Postgres local)

### Setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

docker compose -f infra/docker-compose.yml up -d
```

### Rodar tudo

```bash
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3333 (`/health` para checagem)

### Comandos úteis

| Comando | O quê |
|---|---|
| `pnpm build` | Build de todos os workspaces |
| `pnpm typecheck` | TS sem emitir |
| `pnpm lint` | Lint em todos |
| `pnpm test` | Testes |
| `pnpm --filter @peladafc/api dev` | Só API |
| `pnpm --filter @peladafc/web dev` | Só web |

## Design

O visual segue os protótipos em [design-refs/](design-refs/). Ver [design-refs/README.md](design-refs/README.md) para tokens (cores, tipografia, componentes).

Regras não-óbvias:
- **Nenhum `border-radius`** exceto avatares circulares.
- Tipografia: `Anton` (display/números), `Manrope` (UI).
- Accent editável (lima/dourado/ciano/coral); dourado fixo para MVP/1º lugar.
