# Arquitetura e guia de edição

## Estrutura

```text
src/
  app/                      Adaptador Next.js: layout e entrada HTTP
  client/
    main.js                 Inicialização explícita das funcionalidades
    auth/                   Tela de login: HTML, CSS e envio do formulário
    shell/                  Moldura da aplicação e navegação por hash
    features/
      home/                 Visão geral
      football/             Agenda, classificação, rodada e cache de jogos
      clubs/                Notícias, perfis e próximos jogos
      match/                Central da partida, formação, notas e widget
      group/                Palpites, ranking e reações
      lounge/               Enquetes e mural social
      room/                 Transmissão, WebRTC e preferências do player
      alerts/               Avisos de jogos e da transmissão
    shared/                 DOM, datas, feedback, armazenamento e cliente HTTP
    integrations/           Associação de links do Sofascore
    styles/                 CSS base e entrada das folhas por funcionalidade
    pwa/                    Instalação e service worker
  server/
    auth/                   Senha, sessão assinada e limite de login
    http/                   Roteamento, respostas e página de entrada
    config/                 Validação do endereço de sinalização
    features/
      football/             Agenda, classificação e rotas esportivas
      clubs/                Perfis e notícias
      match/                Detalhes e notas profissionais
      group/                Proxy autenticado de enquetes e palpites
      room/                 Entrada autenticada na transmissão
    integrations/           Clientes de ESPN e ge
    vendor/                 Parser de terceiros e licença
  generated/                Resultado do build, ignorado pelo Git
services/
  signaling/                Worker Cloudflare, estado da sala e testes próprios
public/                     Logo, ícone e manifest públicos
scripts/                    Build da interface e execução local
tests/
  client/                   Inicialização das telas e comportamento de transmissão
  server/                   Regras de futebol e segurança HTTP
  integration/              Limites de arquitetura e configuração de hospedagem
```

## Por onde começar

| Quero alterar       | Arquivos de entrada                                                   |
| ------------------- | --------------------------------------------------------------------- |
| Menu ou navegação   | `src/client/shell/index.html`, `navigation.js`                        |
| Visão geral         | `src/client/features/home/home.html`                                  |
| Agenda              | `features/football/games.html`, `dashboard.js`, `football.css`        |
| Classificação       | `features/football/standings.html`, `standings.js`                    |
| Notícias dos clubes | `features/clubs/clubs.html`, `club-hub.js`, `clubs.css`               |
| Central de partida  | `features/match/match.html`, `match-center.js`, `match.css`           |
| Notas ou escalação  | `features/match/ratings.js`, `lineup-widget.js`, `formation.js`       |
| Enquetes ou mural   | `features/lounge/polls.js`, `social.js`, `controller.js`              |
| Transmissão         | `features/room/room.html`, `room-controller.js`, `peer-connection.js` |
| Login               | `src/client/auth/` e `src/server/auth/`                               |
| Adicionar endpoint  | `src/server/http/handler.mjs` e a respectiva pasta de funcionalidade  |

Os caminhos `features/` desta tabela são relativos a `src/client/`.

## Interface

A interface usa HTML, CSS e ES modules, sem variáveis globais compartilhadas. Cada funcionalidade exporta uma função `init…` para registrar seus eventos. `main.js` é a única entrada carregada pelo HTML. Para entender uma tela, comece pelo HTML da funcionalidade e siga os imports do seu controlador.

O shell inclui os HTMLs das telas com comentários `<!-- include: caminho -->`, expandidos por `scripts/lib/render-shell.mjs` durante o build. Um único ID de tela fica visível por vez. A navegação preserva as rotas `#inicio`, `#jogos`, `#tabelas`, `#clubes`, `#sala` e `#partida/liga/id`.

`game-store.js` concentra os jogos consultados para localização por ID. O estado específico de cada funcionalidade permanece no seu módulo. Imports nomeados expõem apenas as dependências necessárias. Comandos como `setRoomGame()` alteram o estado do player; outros módulos não escrevem nas suas variáveis.

Eventos desacoplam funcionalidades:

| Evento                                       | Uso                                                 |
| -------------------------------------------- | --------------------------------------------------- |
| `palermas:navigate`                          | Abertura de uma tela                                |
| `football:games`                             | Agenda consultada; atualiza avisos e placar da sala |
| `football:openmatch`                         | Abre os detalhes de um jogo selecionado             |
| `football:match`, `football:matchtab`        | Atualiza os recursos da central da partida          |
| `palermas:room`                              | Mudança do estado da transmissão                    |
| `palermas:sendreaction`, `palermas:reaction` | Reações entre interface e sala                      |

## Servidor e build

O Next encaminha requisições de `src/app/[[...path]]/route.js` para `src/server/http/handler.mjs`. O handler valida método, origem e sessão antes de delegar às funcionalidades. Credenciais ficam no servidor; o navegador recebe somente o ingresso temporário para entrar na sala.

`scripts/prepare-assets.mjs` usa esbuild para seguir os imports, combinar JS e CSS e montar os HTMLs. O resultado fica em `src/generated/site-assets.js`. Esse arquivo é gerado e nunca deve ser editado ou versionado. Os bundles principais continuam protegidos pelo handler HTTP; apenas os recursos necessários ao login e os arquivos de `public/` são públicos.

`npm run dev` recompila a interface quando `src/client/` muda. Depois da compilação, atualize a página. Mudanças no servidor são observadas pelo Next. A sinalização tem processo e publicação próprios: `npm run dev:signal` e `npm run deploy:signal`.

## Regras para novas alterações

### Perfis, chat e votação pós-jogo

`features/group/identity.js` contém a identidade persistente compartilhada pelos palpites, perfis, chat e votos. O servidor guarda apenas o hash do código pessoal. `features/group/api.js` acessa as rotas autenticadas de comunidade; `profile.js` e `awards.js` cuidam das telas. `services/signaling/community.mjs` persiste esses dados no mesmo Durable Object da sala, sob o bloqueio de concorrência existente. Contadores de palpites e votos são derivados dos registros mantidos; mensagens possuem contador acumulado e histórico limitado.

O proxy `server/features/group/proxy.mjs` obtém da ESPN o estado da partida e os jogadores elegíveis antes de encaminhar uma votação. Campos de partida ou escalação enviados pelo navegador não são usados como fonte. O vínculo de transmissão exige que o hash do ingresso de reconexão corresponda a um participante que esteja transmitindo.

`room/miniplayer.js` move o mesmo player entre a sala e o contêiner flutuante, preservando seu stream. `room/chat.js` consulta mensagens apenas com a sala visível; `room/match-context.js` sincroniza o vínculo a cada dez segundos e consulta os detalhes por minuto apenas com o painel aberto. O chat é comum à sala, independente da partida vinculada.

`server/features/clubs/athletiba.mjs` consulta o calendário do Athletico de três temporadas. Os confrontos são reconhecidos pelos IDs de ambos os times e deduplicados por evento. A interface distingue ausência de jogos retornados, falha de consulta e recorte parcial. Curiosidades reutilizam os dados editoriais dos perfis dos clubes.

As rotas incluem `#perfil`, `#clubes/noticias`, `#clubes/classico` e `#clubes/historia`; `#athletiba` redireciona para o clássico dentro de CAP & CFC. A aba de votação é `awards` na central da partida. O Worker e a interface precisam ser publicados juntos para disponibilizar essas funções.

### Enriquecimento esportivo

`integrations/fotmob.mjs` consulta JSON público com cache e timeout. `features/match/insights.mjs` associa os jogos por equipes normalizadas, horário e competição, sem confundir IDs entre provedores. Dados ausentes mantêm a experiência ESPN. `probabilities.mjs` calcula uma distribuição de Poisson apenas com jogos anteriores ao início da partida e pelo menos cinco resultados por equipe. A interface identifica a estimativa como pré-jogo e distingue o consenso do grupo.

`integrations/ge-news.mjs` extrai somente arrays JSON de matérias das páginas dos clubes, sem executar scripts. Valida domínio, caminho específico do time, relevância textual e imagens; deduplica as matérias. A tabela recebe zonas da legenda do provedor e forma recente, sem posições de classificação fixadas no código. A montagem do shell resolve includes relativos recursivamente e rejeita ciclos.

### Convenções de edição

- Coloque código de uma funcionalidade junto do HTML e CSS correspondente. Evite novas pastas chamadas `extras` ou arquivos com funções sem relação entre si.
- Compartilhe código em `shared/` somente quando ele não depender de uma funcionalidade.
- Não importe código do servidor no navegador. Não crie imports circulares nem variáveis globais como forma de comunicação.
- Mantenha detalhes de provedores externos em `integrations/` e preserve os arquivos e licenças de `vendor/`.
- Execute `npm run check`. Os testes de arquitetura validam os limites entre navegador e servidor e rejeitam ciclos. Os testes de DOM inicializam cada rota com respostas simuladas; transmissão entre redes reais exige validação com navegadores reais.
