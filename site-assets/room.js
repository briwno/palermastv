import {PalermasP2P} from './p2p.js';
const el=s=>document.querySelector(s);
let endpoint=null,client=null,capture=null,joining=false;
const quality={balanced:{width:1280,height:720,frameRate:30,bitrate:3000000},high:{width:1920,height:1080,frameRate:30,bitrate:5000000},sports:{width:1920,height:1080,frameRate:60,bitrate:8000000}};
const status=text=>el('#room-status').textContent=text;
const video=el('#local-video');
function setVideo(media,local=false){video.srcObject=media;video.muted=local;video.hidden=!media;el('#player-placeholder').hidden=!!media;el('#player-badge').hidden=!media;el('#player-badge').textContent=local?'SUA TRANSMISSÃO':'AO VIVO · PALERMAS';if(media)video.play().catch(()=>{el('#enable-audio').hidden=false;status('Clique em “Reproduzir com som” para liberar o áudio no navegador.');});}
function refreshButtons(){
 const online=client&&!client.closed,watching=online&&client.publisher&&client.publisher!==client.id;
 el('#join-room').textContent=joining?'Entrando…':online?'Sair da sala':'Reconectar à sala';el('#join-room').disabled=!endpoint||joining;
 el('#share-screen').disabled=!!capture||!online||!!watching;el('#share-screen').textContent='Transmitir um jogo ↗';
 el('#stop-screen').disabled=!capture;el('#stop-screen').textContent='Encerrar transmissão';
 el('#room-connection-state').textContent=joining?'CONECTANDO':online?(client.publisher?'AO VIVO':'SALA ABERTA'):'DESCONECTADO';
 el('#page-sala').classList.toggle('watching',!!watching);
 if(!capture){el('#player-placeholder h2').textContent=watching?'Entrando na transmissão…':online?'Nenhuma transmissão':'Conectando à sala…';el('#player-placeholder p').textContent=watching?'A imagem de quem já está transmitindo vai aparecer aqui.':online?'Clique em Transmitir para compartilhar uma aba.':'Aguarde a conexão com a sala.';}
}
function renderPeople(room){
 const container=el('#room-members');container.replaceChildren();
 for(const member of room.members){const row=document.createElement('div');row.className='member';const avatar=document.createElement('span');avatar.className='avatar';avatar.textContent=member.name.charAt(0).toUpperCase();const text=document.createElement('div');const name=document.createElement('strong');name.textContent=member.name+(member.id===room.id?' (você)':'');const sub=document.createElement('small');sub.textContent=member.publishing?'Transmitindo':'Na sala';text.append(name,sub);row.append(avatar,text);container.append(row);}
 el('#room-count').textContent=room.members.length+' / 6';el('#empty-seats').hidden=room.members.length===6;el('#empty-seats p').textContent=(6-room.members.length)+' lugar(es) disponível(is).';
}
function disconnected(){stopCapture(false);setVideo(null);el('#room-count').textContent='— / 6';el('#room-members').replaceChildren();el('#empty-seats').hidden=false;el('#empty-seats p').textContent='Reconecte para ver quem está na sala.';refreshButtons();}
function stopCapture(release=true){const old=capture;capture=null;if(release)client?.stop();old?.getTracks().forEach(t=>t.stop());setVideo(null);refreshButtons();}
async function connectRoom(){
 if(!endpoint||joining||(client&&!client.closed))return;
 if(capture)stopCapture();joining=true;refreshButtons();status('Entrando na sala dos Palermas…');
 let name=el('#nickname').value.trim();if(!name){name='Palerma '+(100+crypto.getRandomValues(new Uint16Array(1))[0]%900);el('#nickname').value=name;try{localStorage.setItem('palermas-nickname',name)}catch{}}
 client=new PalermasP2P(endpoint);
 client.addEventListener('room',e=>{renderPeople(e.detail);refreshButtons();window.dispatchEvent(new CustomEvent('palermas:room',{detail:{publisher:e.detail.publisher,count:e.detail.members.length}}));if(!capture&&!e.detail.publisher){setVideo(null);status('Você já está na sala. Quem quiser pode começar a transmitir.');}else if(!capture&&e.detail.publisher)status('Uma transmissão está rolando. Conectando você ao jogo…');});
 client.addEventListener('media',e=>{if(!capture)setVideo(e.detail);});client.addEventListener('reaction',e=>window.dispatchEvent(new CustomEvent('palermas:reaction',{detail:e.detail})));
 client.addEventListener('peerstate',e=>{if(e.detail.state==='connected')status(capture?'Sua transmissão está conectada aos espectadores.':'Você está assistindo ao vivo. Ajuste o volume neste navegador.');});
 client.addEventListener('error',e=>status(e.detail));client.addEventListener('disconnected',()=>{disconnected();status('A sala desconectou. Clique em Reconectar à sala para voltar.');});
 try{await client.join(name);status('Você entrou na sala. Se já tiver transmissão, ela aparecerá automaticamente.');}
 catch(error){client?.leave();status(error.message);}
 finally{joining=false;refreshButtons();}
}
el('#join-room').addEventListener('click',()=>{if(client&&!client.closed){client.leave();disconnected();status('Você saiu da sala. Para voltar, clique em Reconectar à sala.');}else connectRoom();});
el('#share-screen').addEventListener('click',async()=>{
 if(capture)return;
 if(!navigator.mediaDevices?.getDisplayMedia){status('Para compartilhar, use Chrome ou Edge no Windows, em HTTPS.');return;}
 const q=quality[el('#stream-quality').value];el('#share-screen').disabled=true;
 try{
   capture=await navigator.mediaDevices.getDisplayMedia({video:{width:{ideal:q.width,max:q.width},height:{ideal:q.height,max:q.height},frameRate:{ideal:q.frameRate,max:q.frameRate}},audio:true,preferCurrentTab:false});
   const track=capture.getVideoTracks()[0];track.contentHint='motion';track.addEventListener('ended',()=>{stopCapture();status('Compartilhamento encerrado.');},{once:true});
   if(client&&!client.closed)await client.publish(capture,q.bitrate);
   setVideo(capture,true);const hasAudio=capture.getAudioTracks().length>0;
   status((client&&!client.closed?'Você está transmitindo para os participantes da sala.':'Prévia local: nenhum amigo está recebendo esta imagem.')+(hasAudio?' Som da aba capturado; sua prévia fica muda para evitar retorno.':' Sem áudio: encerre e escolha uma aba com a opção “Compartilhar áudio” marcada.'));
 }catch(error){stopCapture();status(error.name==='NotAllowedError'?'Captura cancelada ou não autorizada.':error.message||'Não foi possível compartilhar.');}
 finally{refreshButtons();}
});
el('#stop-screen').addEventListener('click',()=>{stopCapture();status('Compartilhamento encerrado.');});
el('#stream-quality').addEventListener('change',async()=>{if(!capture)return;const q=quality[el('#stream-quality').value];try{await capture.getVideoTracks()[0].applyConstraints({width:{ideal:q.width,max:q.width},height:{ideal:q.height,max:q.height},frameRate:{ideal:q.frameRate,max:q.frameRate}});await client?.limitBitrate(q.bitrate);status('Qualidade ajustada. A qualidade efetiva também depende da conexão de cada participante.');}catch{status('Não foi possível ajustar agora. Encerre e compartilhe novamente com a qualidade desejada.');}});
el('#volume').addEventListener('input',e=>{video.volume=Number(e.target.value);if(!capture)video.muted=video.volume===0;});
el('#enable-audio').addEventListener('click',async()=>{video.muted=!!capture;try{await video.play();el('#enable-audio').hidden=true;}catch{status('O navegador não conseguiu reproduzir a transmissão.');}});
window.addEventListener('pagehide',()=>client?.leave());
window.addEventListener('palermas:navigate',e=>{if(e.detail.page==='sala')connectRoom()});
el('#site-logout').addEventListener('click',async()=>{client?.leave();await fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});location.reload()});
try{const config=await fetch('room-config.json',{cache:'no-store'}).then(r=>r.json());if(config.signalingUrl){const u=new URL(config.signalingUrl);if(u.protocol==='https:'&&u.hostname.endsWith('.workers.dev'))endpoint=u.origin;}}catch{}
refreshButtons();
if(location.hash==='#sala')connectRoom();

window.addEventListener('palermas:sendreaction',e=>{if(client&&!client.closed){try{client.send({type:'reaction',emoji:e.detail.emoji})}catch{}}else status('Entre na sala para enviar reações.')});
