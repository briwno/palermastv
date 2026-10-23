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

Para testar a sala, crie `signaling/.dev.vars`, ignorado pelo Git:

```dotenv
ROOM_CODE=mesmo-valor-de-env-local
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```

Mantenha `SIGNALING_URL=http://127.0.0.1:8787` em `.env.local` e execute `npm run dev:signal` em outro terminal. A sala comporta um transmissor e cinco espectadores.

## Onde editar

- `site-assets/`: interface, player, PWA e WebRTC.
- `server-auth.mjs`: senha, sessão e APIs privadas.
- `football.mjs`, `match-center.mjs`, `club-hub.mjs`, `ge-feed.mjs`: futebol.
- `app/`: adaptação para Next.js/Vercel.
- `signaling/`: Worker e Durable Object da sala, enquetes e palpites.
- `vendor/`: parser do Brasileirão e licença MIT.

`server-assets.ts` é gerado automaticamente. Edite os arquivos de `site-assets/`.

## Testar e publicar

```sh
npm test
npm run build
npm start
```

Produção: https://palermastv.vercel.app

A integração GitHub/Vercel acompanha a branch `main`. Configure SITE_PASSWORD e ROOM_CODE como segredos na Vercel; ROOM_CODE deve coincidir com o Worker. SIGNALING_URL é opcional em produção: o padrão é o Worker existente. API_FOOTBALL_KEY é opcional para notas e depende da cobertura do plano.

Mudanças no Worker exigem publicação separada com `npm run deploy:signal` e conta Cloudflare autorizada. Ao adicionar domínio, inclua a origem exata em ALLOWED_ORIGINS de `signaling/wrangler.jsonc` e publique o Worker.

Nunca versione `.env.local`, `.dev.vars`, `.vercel/` ou credenciais. O endereço anterior do Sites continua independente. Esta migração partiu do snapshot publicado 55680e004fa50a482d7cf972a93213db188c658a.

Fontes esportivas e widgets dependem de disponibilidade externa. Teste vídeo e áudio entre computadores reais após mudanças na transmissão.

## Colaborar

O dono concede acesso em GitHub → Settings → Collaborators. Cada amigo clona o projeto, cria uma branch e abre um pull request. Execute testes e build antes de integrar à main. O responsável pela hospedagem acompanha os deploys; permissões de previews dependem do plano Vercel. Usem segredos locais e contas individuais.
