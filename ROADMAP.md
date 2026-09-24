# Roadmap — features futuras (Etapa 11 do PLANO)

Features que exigem integrações externas ou decisões de produto ainda não
tomadas ficam aqui, com um plano de design que pode ser executado quando
houver contexto.

---

## Feed / seguir peladas e jogadores — **implementado (MVP)**

- `PeladaFollow` e `JogadorFollow` no schema (Etapa 11).
- Rotas `POST/DELETE /peladas/:id/follow`, `POST/DELETE /jogadores/:id/follow`.
- `GET /feed` — lista peladas seguidas com última partida.

**Próximos passos:** feed com eventos (novas partidas, resultados, rankings)
via cursor pagination; ping/notification quando pelada seguida agenda partida.

---

## Rating do jogador (carta) — **implementado (MVP)**

- `calcularRating(estatisticas)` em `@peladafc/domain` — retorna 0–99.
- Retornado em `GET /jogadores/:id` como `rating`.
- Requer mínimo de 3 partidas.

**Próximos passos:** carta visual no perfil; histórico de rating ao longo do
tempo; comparações entre jogadores.

---

## Campeonatos e copas — **planejado**

Design:
- Entidade `Campeonato` (nome, peladaId, formato: pontos_corridos | mata_mata | grupos_playoffs, criadoEm)
- Entidade `Fase` (campeonatoId, ordem, tipo: grupo | quartas | semis | final)
- Entidade `ConfrontoCampeonato` (fase, timeA, timeB, partidaId?)
- Partida existente ganha campo opcional `campeonatoId`
- Estatísticas de campeonato reaproveitam `calcularRanking` com filtro por `campeonatoId`

Decisões pendentes:
- Times fixos por temporada ou por campeonato?
- Fase de grupos: cabeça-de-chave manual ou por rating?

---

## Pagamentos e rateio — **exige integração externa**

Design:
- Entidade `Cobranca` (partidaId, valorCentavos, criadoPorUserId, status)
- Entidade `CobrancaParticipante` (cobrancaId, jogadorId, valorCentavos, pago: bool, pagoEm?)
- Rateio proporcional aos confirmados na `Attendance`

Integração necessária:
- Provedor de pagamento — recomendado **Mercado Pago Pix** ou **Stripe**
  (para MVP no Brasil, Pix via Mercado Pago é o menor atrito).
- Requer conta no provedor + credenciais (`MP_ACCESS_TOKEN` ou `STRIPE_SECRET`)
- Webhook para confirmar pagamento → marca `pago: true`

**Bloqueio:** decidir provedor + conta habilitada + credenciais em .env.

---

## Integração WhatsApp — **exige integração externa**

Design:
- Notificar membros da pelada sobre nova partida, resultado, MVP
- Confirmar presença por link direto

Integração necessária:
- **WhatsApp Business API** (Meta) — precisa de:
  - Conta Business verificada
  - Número de telefone dedicado
  - Templates aprovados pela Meta (não pode enviar mensagem livre para número novo)
- Alternativa mais leve: **Twilio WhatsApp API** (sandbox de dev grátis; produção paga)
- Alternativa não-oficial: bot `whatsapp-web.js` (frágil, não recomendado em produção)

**Bloqueio:** conta Business + templates aprovados + `WA_ACCESS_TOKEN` no .env.

Preparação neutra que pode ser feita agora:
- Adicionar `preferenciasNotificacao` no `Jogador` (whatsapp: bool, email: bool)
- Fila de notificações genérica (redis + BullMQ) que abstrai o provedor

---

## Reservas de quadra — **exige integração externa ou schema próprio**

Duas abordagens:

### A) Reserva interna (SaaS PeladaFC controla horários)
- Entidade `HorarioLocal` (localId, diaSemana, inicio, fim, precoCentavos)
- Entidade `Reserva` (localId, data, horaInicio, horaFim, criadoPorUserId, status: pendente | confirmada | cancelada)
- Precisa de dono do local (nova relação `Local.dono` + fluxo de aprovação)
- Rota `POST /locais/:id/reservas`

### B) Integração com sistema de reservas de terceiros
- Cada arena tem seu sistema (Radar Sports, Reservas.io, etc.)
- Precisa integração por API por sistema — inviável no MVP

**Recomendação:** implementar A) só quando houver arena disposta a piloto.
Por enquanto, `Local` só serve como catálogo de referência.

---

## Notificações push / e-mail — **planejado**

- Trigger: nova partida agendada, resultado registrado, candidatura aprovada
- Push: Web Push (service worker) — sem integração externa paga
- E-mail: Resend, SendGrid ou AWS SES

**Bloqueio para e-mail:** credenciais do provedor.
