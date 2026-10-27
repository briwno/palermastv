# PalermasTV

Futebol e sala de transmissão dos Palermas. Next.js na Vercel, sinalização na Cloudflare e vídeo WebRTC entre participantes. Qualidade manual, com avisos de perda de pacotes.

## Rodar localmente

Requer Node.js 22 e acesso ao repositório privado.

```sh
git clone https://github.com/briwno/palermastv.git
cd palermastv
npm ci
```

Copie `.env.example` para `.env.local`, escolha uma senha local e um ROOM_CODE local. Rode `npm run dev` e abra http://localhost:3000. Interface e dados esportivos funcionam sem credenciais de produção.

Para testar a sala, crie `services/signaling/.dev.vars`, ignorado pelo Git:

```dotenv
ROOM_CODE=mesmo-valor-de-env-local
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

Mantenha `SIGNALING_URL=http://127.0.0.1:8787` em `.env.local` e execute `npm run dev:signal` em outro terminal. A sala comporta um transmissor e cinco espectadores. O usuário entra pela sessão do site, sem digitar código de sala. `ROOM_CODE` é apenas uma credencial interna entre o servidor Next e o Worker; não é um convite nem uma etapa de entrada para o usuário.

## Onde editar

- `src/client/features/`: telas e funcionalidades, com HTML, CSS e módulos próprios.
- `src/client/main.js`: entrada da interface e inicialização das funcionalidades.
- `src/client/shell/`: estrutura comum e navegação.
- `src/server/`: autenticação, HTTP, regras por funcionalidade e integrações externas.
- `src/app/`: adaptador Next.js/Vercel.
- `services/signaling/`: Worker Cloudflare, sala, enquetes e palpites.
- `public/`: imagens e manifest públicos.
- `tests/`: testes de interface, servidor e integração.
- `scripts/`: compilação, desenvolvimento e verificação de produção.

Veja o [guia de arquitetura e edição](docs/architecture.md) para localizar cada tela, entender os módulos e adicionar funcionalidades. O navegador usa imports explícitos; os testes impedem dependências circulares e imports de código do servidor.

`npm run dev` recompila a interface ao editar `src/client/`; atualize a página após a compilação. `src/generated/` contém apenas arquivos gerados e fica fora do Git. O parser de terceiros e sua licença ficam em `src/server/vendor/`.

No PowerShell, se a política de execução bloquear `npm.ps1`, use `npm.cmd` no lugar de `npm` (por exemplo, `npm.cmd run dev`).

## Testar e publicar

```sh
npm run check
npm run smoke
npm start
```

`check` executa ESLint, Prettier, testes e build. `smoke` inicia uma instância temporária da versão compilada, testa login e recursos protegidos e encerra o processo. Para formatar alterações, execute `npm run format`.

Produção: https://palermastv.vercel.app

A integração GitHub/Vercel acompanha a branch `main`. Configure SITE_PASSWORD e ROOM_CODE como segredos na Vercel; ROOM_CODE deve coincidir com o Worker. SIGNALING_URL é opcional em produção: o padrão é o Worker existente. API_FOOTBALL_KEY é opcional para notas e depende da cobertura do plano.

Mudanças no Worker exigem publicação separada com `npm run deploy:signal` e conta Cloudflare autorizada. Ao adicionar domínio, inclua a origem exata em ALLOWED_ORIGINS de `services/signaling/wrangler.jsonc` e publique o Worker.

Nunca versione `.env.local`, `.dev.vars`, `.vercel/` ou credenciais.

Fontes esportivas e widgets dependem de disponibilidade externa. Teste vídeo e áudio entre computadores reais após mudanças na transmissão.

## Recursos do grupo

- **Meu perfil:** apelido, avatar, time e contagem de palpites, votos pós-jogo e mensagens. A identificação existente dos palpites é preservada. O código pessoal permite levar o perfil para outro navegador; quem tiver esse código poderá usá-lo.
- **Craque e bagre:** na central de uma partida encerrada, cada pessoa escolhe dois jogadores diferentes que entraram em campo. O servidor consulta o estado e os participantes na ESPN. Alterar o voto substitui o anterior. Empates são exibidos sem desempate artificial; as parciais ficam no histórico do grupo.
- **Chat da sala:** mensagens recebidas pelo WebSocket, com sincronização de segurança a cada cinco segundos enquanto a sala estiver aberta. O envio confirmado aparece imediatamente; falhas preservam o rascunho. Enter envia, Shift+Enter quebra a linha. Mantém as últimas 100 mensagens; o contador pessoal registra todos os envios. O chat é compartilhado pelo grupo e pode conter spoilers.
- **Partida da transmissão:** depois de começar a transmitir, selecione um jogo e use **Vincular para a sala**. Só o transmissor atual pode alterar ou remover o vínculo. Mudanças são enviadas pelo WebSocket; consultas antigas não substituem um vínculo recém-salvo. Todos consultam o mesmo jogo; estatísticas e escalações são abertas por escolha do espectador.
- **Miniplayer:** ao navegar com o vídeo ativo, o mesmo player acompanha a navegação. Voltar à sala restaura sua posição. Picture-in-Picture também aparece quando o navegador oferece suporte.
- **CAP & CFC:** reúne panorama dos clubes, notícias, Athletiba e curiosidades. O clássico consulta calendários da ESPN das últimas três temporadas; os números descrevem apenas o recorte retornado. As notícias do ge passam por filtros de domínio, caminho do clube e conteúdo. O FotMob complementa forma recente, próximo compromisso e boletim do elenco quando disponíveis.
- **Central da partida:** os próximos jogos de CAP & CFC abrem dentro do PalermasTV, usando o calendário e os IDs da ESPN. A integração FotMob associa adversários, horário e competição antes de exibir xG, mapa de chutes, notas e confrontos. Também fornece titulares, reservas, formação e técnico quando falta a escalação da ESPN; esses jogadores não substituem os IDs usados nas votações. Falhas nessa fonte preservam os dados principais da ESPN.
- **Probabilidades:** estimativa pré-jogo do site por modelo de Poisson, usando até dez resultados anteriores de cada equipe, com mínimo de cinco. Não considera força dos adversários, mando ou escalações e não representa odds de apostas. O consenso dos palpites é mostrado separadamente.
- **Tabela e palpites:** faixas de classificação conforme a fonte, legenda e últimos cinco resultados; placares com botões de ajuste, sugestões, rascunho durante a navegação, consenso e ranking do grupo.

Perfis, votos, chat e vínculo da partida ficam no Durable Object do Worker. O armazenamento comporta 32 identidades e 400 partidas com votos pós-jogo. Nenhuma nova chave de API é necessária. Para ativar as alterações em produção, publique **o Worker e a interface**; publicar só a interface deixa as novas rotas do grupo indisponíveis. Os testes automatizados simulam provedores e conexões: ainda é necessário validar mídia, áudio e Picture-in-Picture com navegadores reais e dados esportivos ao vivo.

## Colaborar

O dono concede acesso em GitHub → Settings → Collaborators. Cada amigo clona o projeto, cria uma branch e abre um pull request. Execute testes e build antes de integrar à main. O responsável pela hospedagem acompanha os deploys; permissões de previews dependem do plano Vercel. Usem segredos locais e contas individuais.
