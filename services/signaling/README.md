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

Os testes de sinalização usam mocks do runtime Cloudflare. Não substituem a validação da implantação do Worker e da mídia entre navegadores reais. A reconexão da sala é automática enquanto a aba estiver ativa. A captura é preservada para tentar republicar; há até três tentativas de ICE restart quando a conexão de mídia falha.

## Diagnóstico de quedas e travamentos

Na sala, abra **Diagnóstico da transmissão**. As métricas são atualizadas a cada cinco segundos: upload total e teto escolhido, FPS, perda, RTT, banda de saída estimada pelo navegador, limitação por CPU/banda e congelamentos quando disponíveis. Dois intervalos sem quadros novos geram um aviso, inclusive quando o WebRTC ainda indica conexão ativa. Isso não detecta o conteúdo de uma tela preta: uma captura pode continuar enviando quadros pretos normalmente.

**Baixar diagnóstico** exporta os últimos 200 eventos da aba, preservados em sessionStorage durante reconexões e recargas. O painel mostra os 80 mais recentes. Estados de ICE, captura, player, conexão WebSocket (com código de fechamento) e mudanças de qualidade observada ficam no histórico; métricas são registradas nas mudanças de estado e a cada 30 segundos. Não há envio automático desses relatórios ao servidor. Compare os arquivos do transmissor e de um espectador no mesmo horário. Incluem apelidos, mas não tickets, códigos pessoais, senha, SDP, candidatos ICE completos ou IPs.

No Cloudflare, os logs estruturados com `service: signaling` registram conexões, saída do transmissor, código de fechamento e bloqueios por tamanho ou taxa de mensagens. Um `rate-limit` seguido de remoção do transmissor explica uma interrupção coletiva por esse limite. A sinalização não transporta vídeo; CPU e upload de mídia devem ser observados no computador do transmissor. Cinco espectadores têm teto agregado de vídeo de 25 Mb/s em 720p30, 60 Mb/s em 1080p30 ou 80 Mb/s em 1080p60, além de áudio e overhead. Esses são tetos configurados, não medições de consumo.

As correções e novos eventos exigem publicação da interface e do Worker. Para verificar limites da conta Cloudflare ou incidentes históricos, consulte as métricas da conta: o código e os testes locais não comprovam sobrecarga em produção.

Falhas nas consultas do site aparecem em avisos com recurso, status HTTP, código e referência quando disponível. Avisos iguais são agrupados por um minuto, com até três visíveis e fechamento manual. Consultas que falham usam espera crescente, de 10 a 120 segundos, sem bloquear o envio de formulários. O proxy registra erros como `service: group-proxy`, com a mesma referência exibida no aviso. Uma leitura de chat/jogo rejeitada por um Worker incompatível como `invalid_game`, `unknown_action` ou `invalid_identity` vira `503 service_outdated`: é necessário publicar o Worker atual, além do site, para corrigir a incompatibilidade.

Jogos e classificação são fornecidos pelas integrações esportivas de `src/server/` e dependem da disponibilidade dos serviços externos.

## Verificação

`node --test services/signaling/worker.test.mjs`
