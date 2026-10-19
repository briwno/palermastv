/* Host makes one peer connection per viewer. No camera or microphone is requested. */
export class PalermasP2P extends EventTarget {
  constructor(endpoint){super();this.endpoint=endpoint.replace(/\/$/,'');this.peers=new Map();this.id=null;this.publisher=null;this.members=[];this.stream=null;this.iceServers=[];this.socket=null;this.timer=null;this.closed=true;this.queue=Promise.resolve();this.pendingClaim=null;this.offerJobs=new Set();}
  emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}));}
  send(value){if(this.socket?.readyState!==WebSocket.OPEN)throw Error('A sala está desconectada.');this.socket.send(JSON.stringify(value));}
  async join(name){
    if(!this.closed)throw Error('Você já está conectado.');
    const url=new URL(this.endpoint);if(url.protocol!=='https:')throw Error('O serviço da sala precisa usar HTTPS.');
    const res=await fetch('/api/room/join',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({name}),signal:AbortSignal.timeout(12000)});
    const data=await res.json();if(!res.ok)throw Error(({unauthorized:'Sua entrada expirou. Atualize a página para entrar novamente.',room_full:'Os seis lugares já estão ocupados.',try_later:'Aguarde um minuto antes de tentar novamente.',not_configured:'A sala ainda não foi configurada.'})[data.error]||'Não foi possível entrar na sala.');
    const socketURL=new URL(this.endpoint+'/ws');socketURL.protocol='wss:';
    this.closed=false;this.socket=new WebSocket(socketURL,['palermas-v1','ticket.'+data.ticket]);
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{reject(Error('Tempo de conexão esgotado.'));this.leave();},15000);
      this.socket.onmessage=e=>{if(e.data==='pong')return;let message;try{message=JSON.parse(e.data)}catch{return;}
        if(message.type==='welcome'){this.id=message.id;this.iceServers=message.iceServers;clearTimeout(timer);this.timer=setInterval(()=>{if(this.socket?.readyState===WebSocket.OPEN)this.socket.send('ping')},25000);resolve();}
        this.queue=this.queue.then(()=>this.handle(message)).catch(error=>this.emit('error',error.message));
      };
      this.socket.onerror=()=>{clearTimeout(timer);reject(Error('Não foi possível conectar ao serviço da sala.'));};
      this.socket.onclose=()=>{clearTimeout(timer);reject(Error('Conexão com a sala encerrada.'));this.cleanup();this.emit('disconnected');};
    });
  }
  peer(id){
    const existing=this.peers.get(id);if(existing)return existing;
    const pc=new RTCPeerConnection({iceServers:this.iceServers});
    const entry={pc,candidates:[],received:new MediaStream(),failedTimer:null,restarts:0};this.peers.set(id,entry);
    pc.onicecandidate=e=>{if(e.candidate){try{this.send({type:'signal',to:id,payload:{type:'candidate',candidate:e.candidate.toJSON()}})}catch{}}};
    pc.ontrack=e=>{if(!entry.received.getTracks().some(t=>t.id===e.track.id))entry.received.addTrack(e.track);this.emit('media',entry.received);};
    pc.onconnectionstatechange=()=>{
      this.emit('peerstate',{id,state:pc.connectionState});
      if(pc.connectionState==='failed'){
        if(this.stream&&entry.restarts++<1)this.offer(id,true).catch(e=>this.emit('error',e.message));
        else this.emit('error','A conexão direta falhou. Esta rede pode precisar de um servidor TURN.');
      }
    };
    return entry;
  }
  async offer(id,restart=false){
    if(this.offerJobs.has(id)||!this.stream)return;this.offerJobs.add(id);
    try{const {pc}=this.peer(id);if(!pc.getSenders().some(s=>s.track))for(const track of this.stream.getTracks())pc.addTrack(track,this.stream);
      await pc.setLocalDescription(await pc.createOffer({iceRestart:restart}));
      this.send({type:'signal',to:id,payload:{type:'offer',sdp:pc.localDescription.sdp}});
      await this.limitBitrate(this.bitrate||5000000);
    }finally{this.offerJobs.delete(id);}
  }
  async handle(data){
    if(data.type==='reaction'){if(['⚽','🔥','👏','😂','😱','🤡'].includes(data.emoji))this.emit('reaction',{emoji:data.emoji,name:String(data.name||'').slice(0,24)});return;}
    if(data.type==='room'){
      const old=this.publisher;this.publisher=data.publisher;this.members=data.members;
      if(old!==this.publisher){this.closePeers();this.emit('media',null);}
      for(const id of this.peers.keys())if(!this.members.some(m=>m.id===id))this.closePeer(id);
      this.emit('room',{members:this.members,publisher:this.publisher,id:this.id});
      if(this.stream&&this.publisher===this.id)for(const m of this.members)if(m.id!==this.id&&!this.peers.has(m.id))await this.offer(m.id);
      return;
    }
    if(data.type==='claimed'){this.pendingClaim?.resolve();return;}
    if(data.type==='error'){this.pendingClaim?.reject(Error(data.message));this.emit('error',data.message);return;}
    if(data.type!=='signal'||!data.from)return;
    const signal=data.payload;
    if(signal.type==='offer'){
      if(data.from!==this.publisher||this.stream)return;
      const entry=this.peer(data.from);await entry.pc.setRemoteDescription({type:'offer',sdp:signal.sdp});
      for(const c of entry.candidates.splice(0))await entry.pc.addIceCandidate(c);
      await entry.pc.setLocalDescription(await entry.pc.createAnswer());
      this.send({type:'signal',to:data.from,payload:{type:'answer',sdp:entry.pc.localDescription.sdp}});
    }else if(signal.type==='answer'){
      const entry=this.peers.get(data.from);if(!entry||entry.pc.signalingState!=='have-local-offer')return;
      await entry.pc.setRemoteDescription({type:'answer',sdp:signal.sdp});
      for(const c of entry.candidates.splice(0))await entry.pc.addIceCandidate(c);
    }else if(signal.type==='candidate'){
      if(this.publisher!==this.id&&data.from!==this.publisher)return;
      const entry=this.peer(data.from);if(entry.pc.remoteDescription)await entry.pc.addIceCandidate(signal.candidate);else if(entry.candidates.length<128)entry.candidates.push(signal.candidate);
    }
  }
  async publish(stream,bitrate){
    if(this.publisher&&this.publisher!==this.id)throw Error('Já tem um Palerma transmitindo.');
    if(this.stream)throw Error('Sua transmissão já está ativa.');
    this.stream=stream;this.bitrate=bitrate;
    try{
      await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Não foi possível assumir a transmissão.')),7000);this.pendingClaim={resolve:()=>{clearTimeout(timeout);resolve()},reject:e=>{clearTimeout(timeout);reject(e)}};this.send({type:'claim'});});
    }catch(error){this.stream=null;throw error}finally{this.pendingClaim=null;}
  }
  async limitBitrate(bitrate){this.bitrate=bitrate;for(const {pc}of this.peers.values())for(const sender of pc.getSenders())if(sender.track?.kind==='video'){
    const p=sender.getParameters();if(!p.encodings?.length)continue;p.encodings[0].maxBitrate=bitrate;await sender.setParameters(p);
  }}
  stop(){this.stream=null;this.closePeers();if(this.publisher===this.id){try{this.send({type:'release'})}catch{}}}
  closePeer(id){const e=this.peers.get(id);if(e){e.pc.onconnectionstatechange=null;e.pc.close();this.peers.delete(id)}}
  closePeers(){for(const id of this.peers.keys())this.closePeer(id);this.offerJobs.clear();}
  cleanup(){this.closed=true;clearInterval(this.timer);this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.closePeers();this.id=null;this.publisher=null;this.members=[];this.pendingClaim?.reject(Error('A sala foi desconectada.'));this.pendingClaim=null;}
  leave(){this.cleanup();this.socket?.close(1000,'Saiu da sala');this.socket=null;}
}
