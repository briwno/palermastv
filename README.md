# PalermasTV

Site privado do grupo Palermas para acompanhar futebol e assistir a uma transmissão de tela com até cinco espectadores.

## Recursos

- Agenda e classificação com pontos provisórios durante as partidas.
- Central da partida: escalações, reservas, estatísticas e lances.
- Notícias e informações do Athletico Paranaense e Coritiba.
- Sala WebRTC P2P com áudio da aba, modo jogo e reações.
- Palpites por apelido e ranking do grupo.
- Acesso ao site protegido por senha no servidor.

## Estrutura

- `site-assets/`: interface em HTML, CSS e JavaScript.
- `server-auth.mjs`: autenticação e rotas privadas.
- `football.mjs`, `match-center.mjs`, `club-hub.mjs`: consultas esportivas à ESPN.
- `signaling/`: Cloudflare Worker com Durable Object para a sala, reações e palpites.
- `app/`, `build/`: aplicação Vinext e integração com Sites.

## Configuração

Requer Node.js 22.13 ou superior. Instale as dependências com `npm install`.

Defina `SITE_PASSWORD` e `ROOM_CODE` como segredos do servidor. `ROOM_CODE` também deve estar configurado no Worker de sinalização. Não coloque esses valores no código, no navegador ou no GitHub.

Para preparar os arquivos e compilar:

```sh
node scripts/prepare-assets.mjs
npm run build
```

Testes:

```sh
node --test football.test.mjs club-hub.test.mjs match-center.test.mjs server-auth.test.mjs signaling/worker.test.mjs signaling/group.test.mjs
```

## Hospedagem e domínio

O site usa hospedagem Sites e um Worker separado na Cloudflare. GitHub armazena o código; GitHub Pages sozinho não executa a autenticação, as APIs privadas e o Durable Object.

Ao alterar o domínio, atualize os endereços permitidos em `signaling/worker.mjs` e confirme a conexão da sala pelo novo endereço antes de divulgar.

Dados esportivos e notícias dependem da disponibilidade da ESPN. Este repositório não contém as senhas, credenciais, dados dos palpites nem arquivos de configuração locais.

Snapshot do projeto publicado: `bc8ce6699da666ff5f2f66f345ce0cd12e4be3df`.

## Expansão da sala e central

- Qualidade automática por espectador, diagnóstico e tentativas de reconexão.
- Troca de transmissor aprovada por quem está transmitindo.
- Aplicativo instalável no navegador, sem cache de conteúdo privado.
- Campo esquemático de escalações e comentário minuto a minuto da ESPN.
- Enquetes persistentes por partida e na sala.
- Busca no X por jogo ou jogador e mural de posts compartilhados.
- Integração de notas API-Football e associação manual do widget oficial gratuito de escalações/notas do Sofascore.

Defina `API_FOOTBALL_KEY` como segredo opcional no servidor. O plano gratuito consultado só liberou temporadas de 2022 a 2024; notas indisponíveis são sinalizadas, sem dados substitutos.

Verificação desta expansão: 40 testes automatizados, compilação e revisão no navegador. A qualidade de mídia entre seis computadores e a instalação no Windows dependem de teste com o grupo.

## Dados ge e widgets Sofascore

- Classificação das Séries A e B pelo ge, com ESPN como alternativa automática.
- Jogos da rodada atual na página Jogos, com CAP e CFC destacados.
- Parser MIT de ezefranca/campeonato-brasileiro-api fixado no commit c4080b7c7b2647bea73caf7713103cf48cb71edf, com licença em vendor/.
- Widgets oficiais de escalações e notas do Sofascore na aba Notas. Dez partidas da rodada 31/2026 verificadas e associadas por mandante, visitante e data de Brasília.
- Para outras partidas, cole o link público completo do jogo no Sofascore ou o iframe oficial. O vínculo é compartilhado com o grupo. A descoberta automática de novas partidas ainda não está disponível.
- Notícias e central da partida continuam pela ESPN. Nenhuma chave é enviada ao navegador.

Validado com 40 testes, build e navegador; widgets do Athletico e Coritiba conferidos com notas reais.

## Correção de qualidade

Padrão 1080p/30 até 12 Mb/s por espectador; modo 60 fps até 16 Mb/s. Ajuste automático só reduz após dificuldade medida e persistente, recupera mesmo com o indicador de banda ativo e preserva resolução em sobrecarga de CPU. Preferência H.264 com demais codecs mantidos como alternativa. Parâmetros reaplicados após negociação. Diagnóstico de captura, codec e upload total; botão para restaurar limites.

Validação: 44 testes e conexão WebRTC local real em 1920×1080, H.264, cerca de 28 fps. Desempenho na rede dos amigos ainda depende de teste com o grupo.
