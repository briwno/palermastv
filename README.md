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

Mantenha `SIGNALING_URL=http://127.0.0.1:8787` em `.env.local` e execute `npm run dev:signal` em outro terminal. A sala comporta um transmissor e cinco espectadores.

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

## Colaborar

O dono concede acesso em GitHub → Settings → Collaborators. Cada amigo clona o projeto, cria uma branch e abre um pull request. Execute testes e build antes de integrar à main. O responsável pela hospedagem acompanha os deploys; permissões de previews dependem do plano Vercel. Usem segredos locais e contas individuais.
