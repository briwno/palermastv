# Sinalização P2P do PalermasTV

O Worker organiza uma sala com até seis pessoas. Ele troca descrições WebRTC e candidatos ICE, sem receber o vídeo ou o áudio. Uma pessoa publica, as outras assistem.

## Estado da implantação

Serviço publicado em https://palermastv-sinalizacao.brunoalvesbezerra-ba.workers.dev. Binding PALERMAS_ROOM registrado com SQLite. ROOM_CODE configurado como segredo. O site tem acesso público autorizado pelo proprietário; apenas os participantes com o código podem conectar à sala. Nenhum valor de segredo faz parte deste repositório.

O teste do serviço publicado validou duas conexões WebSocket, entrada autenticada, bloqueio de transmissor concorrente e troca de oferta/resposta. A mídia entre computadores e redes diferentes ainda precisa de teste com o grupo.

## Recriar ou atualizar

1. Publicar `worker.mjs` com as vinculações e a migração de `wrangler.jsonc`, em uma conta Cloudflare Workers Free. A classe `PalermasRoom` usa Durable Objects com SQLite e WebSocket Hibernation.
2. Configurar `ROOM_CODE` como segredo de execução, com uma frase aleatória de pelo menos 16 caracteres. Não colocar seu valor no código, no Git ou em conversas.
3. Configurar `SIGNALING_URL` na Vercel com a origem HTTPS retornada pela Cloudflare (domínio workers.dev). Para desenvolvimento, seguir o [README do projeto](../../README.md).
4. Publicar a interface na Vercel pela integração com a branch `main`.
5. Configurar `SITE_PASSWORD` e `ROOM_CODE` na Vercel. O código da sala deve coincidir com o segredo do Worker; a sessão do site autoriza o acesso à sala.
6. Testar de dois computadores e redes distintas, depois com seis participantes.

O código privado da sala é enviado via HTTPS para obter um ingresso de conexão de uso único, válido por 30 segundos. Não fica em localStorage nem em links de convite. O ingresso aparece no cabeçalho de protocolo da conexão WebSocket, em vez da URL, e não pode ser reutilizado. O Worker não registra o código nem as mensagens de sinalização em logs.

Há controle de origem, limite de seis tentativas de entrada por IP por minuto, teto de participantes, bloqueio de transmissor concorrente e validação dos sinais encaminhados. O código não usa uma sala sem segredo: falta de configuração retorna erro 503.

## Limites desta etapa

STUN configurado, TURN ainda não configurado. Redes com NAT/firewall restritivo podem não conectar. A tela explica essa falha em vez de prometer transmissão em qualquer rede. O plano gratuito de sinalização não oferece retransmissão de mídia. Verificar uso e limites da conta antes de ativar recursos pagos.

Os testes de sinalização usam mocks do runtime Cloudflare. Não substituem a validação da implantação do Worker e da mídia entre navegadores reais. Reconectar após queda de sinalização exige entrar novamente na sala; há uma tentativa de ICE restart quando a conexão de mídia do transmissor falha.

Jogos e classificação são fornecidos pelas integrações esportivas de `src/server/` e dependem da disponibilidade dos serviços externos.

## Verificação

`node --test services/signaling/worker.test.mjs`
