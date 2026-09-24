# Infra

Dependências locais para desenvolvimento.

## Postgres

```bash
docker compose -f infra/docker-compose.yml up -d
```

Conexão: `postgresql://peladafc:peladafc@localhost:5432/peladafc`

Parar:

```bash
docker compose -f infra/docker-compose.yml down
```

Zerar o volume:

```bash
docker compose -f infra/docker-compose.yml down -v
```
