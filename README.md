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

Snapshot do projeto publicado: `5e3c60a158b268a7c962c2af2aba08defb8746a3`.
