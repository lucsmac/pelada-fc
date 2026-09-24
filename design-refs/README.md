# PeladaFC — referência visual para implementação

Este pacote é a referência de design do fluxo web do PeladaFC (Descobrir → Pelada → Perfil → Ranking),
exportada do protótipo feito no canvas de Design. São 4 páginas HTML **estáticas**, sem framework —
abra qualquer uma direto no navegador para ver o layout exato (cores, tipografia, espaçamentos em px).
Passe esta pasta para o Claude Code como referência e peça para ele implementar essas telas na stack
real do projeto (React, Next.js etc.) — o HTML aqui não é para usar em produção, é só a fonte da verdade
visual.

Arquivos:
- `01-descobrir.html` — lista de peladas da cidade, busca e filtros
- `02-pelada.html` — página pública de uma pelada (hero, estatísticas, rankings, candidatura)
- `03-perfil.html` — perfil do jogador (estatísticas, peladas, histórico por temporada)
- `04-ranking.html` — ranking da temporada com abas por categoria

## Sistema visual

**Tipografia** (Google Fonts, já linkada em cada arquivo):
- Display / títulos / números grandes: `Anton` (uppercase, peso único)
- Corpo / UI: `Manrope`, pesos 400–800

**Cores**
| Token | Hex | Uso |
|---|---|---|
| `--bg` | `#0B0D10` | fundo da página |
| `--nav-bg` | `#0E1013` | fundo da barra de navegação |
| `--panel` | `#14171C` | fundo de cards/painéis |
| `--panel-2` | `#1B1F26` | fundo de tiles internos (estatísticas), strip flutuante |
| `--border` | `#21252C` / `#262B32` | bordas de cards e divisores |
| `--text` | `#F4F5F6` | texto principal |
| `--text-secondary` | `#8A929D` | texto secundário, labels |
| `--text-tertiary` | `#5C6470` | legendas, texto de apoio |
| `--accent` (lima) | `#C7F23E` | cor de marca — CTA, links ativos, destaques (é um **design token editável**: no protótipo cada tela tem um seletor de cor com as opções `#C7F23E` lima, `#F2A93C` dourado, `#4FD1FF` ciano, `#FF6B6B` coral) |
| dourado (fixo) | `#F2A93C` | reservado para MVP / troféu / 1º lugar — não é o token de accent |

**Bordas**: nenhum elemento retangular usa `border-radius` (cards, botões, chips, badges, inputs, tiles,
tabela = `border-radius: 0`). As únicas formas circulares no sistema são os avatares com iniciais
(jogador, usuário) — de propósito, como identidade visual, não decoração.

**Padrões de componente**
- Card/painel: `background:#14171C; border:1px solid #21252C;` + cabeçalho pequeno em uppercase com
  `border-bottom: 1px dotted #262B32` (linha pontilhada como separador de seção).
- Tile de estatística: `background:#1B1F26`, rótulo uppercase com uma barra colorida de 3px embaixo
  (`border-bottom:3px solid var(--accent)`, ou dourado para métricas de MVP), número grande em Anton acima.
- Botão primário (CTA): fundo `var(--accent)`, texto `#0B0D10` (escuro sobre a cor viva, não branco).
- Chip/pill de filtro: fundo `#14171C`, borda `#262B32`; estado ativo usa o accent.
- Navegação: barra fixa 76px, logo quadrado (accent) + wordmark "PeladaFC" (FC em accent), item ativo
  com sublinhado de 2px na cor accent.

## Comportamento (não está no HTML estático — para implementar no código real)

1. **`01-descobrir.html`** — o chip "Abertas para novos jogadores" é um toggle (estado ligado/desligado
   muda o preenchimento do chip entre neutro e a cor accent). Está renderizado aqui no estado "ligado".
2. **`04-ranking.html`** — as abas (Geral / Artilharia / Vitórias / Assistências / MVP / Aproveitamento)
   reordenam a tabela pelo critério escolhido, do maior para o menor. "Aproveitamento" é calculado
   (vitórias ÷ jogos × 100), não é um campo salvo. A aba "Geral" mostra a ordem-base (sem reordenar).
   A linha do 1º colocado sempre ganha destaque dourado + ícone de troféu, seja qual for a aba ativa.
3. Navegação entre as 4 telas: cards de pelada → página da pelada; "Ver ranking"/pills de ranking →
   ranking; avatar/"Minhas Peladas" → perfil; breadcrumb no ranking → volta para a pelada.

## Dados de exemplo usados

Os números vêm do planejamento original do produto (não são inventados): Pelada dos Amigos com 37
partidas / 214 gols / 12 MVPs distribuídos; ranking da Temporada 2026–T2 com Lucas, João e Pedro;
perfil de Lucas com 42 partidas de carreira. Ao plugar dados reais, troque só os valores — a estrutura
dos componentes já está pronta.
