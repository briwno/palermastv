import {nextQuality,connectionLabel} from './stream-health.mjs';
/* Host makes one peer connection per viewer. No camera or microphone is requested. */
export class PalermasP2P extends EventTarget {
  constructor(endpoint){super();this.endpoint=endpoint.replace(/\/$/,'');this.peers=new Map();this.id=null;this.publisher=null;this.members=[];this.stream=null;this.iceServers=[];this.socket=null;this.timer=null;this.closed=true;this.queue=Promise.resolve();this.pendingClaim=null;this.offerJobs=new Set();this.adaptive=true;this.lastPong=0;}
  emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}));}
  send(value){if(this.socket?.readyState!==WebSocket.OPEN)throw Error('A sala está desconectada.');this.socket.send(JSON.stringify(value));}
  async join(name,resumeToken){
    if(!this.closed)throw Error('Você já está conectado.');
    const url=new URL(this.endpoint);if(url.protocol!=='https:')throw Error('O serviço da sala precisa usar HTTPS.');
    const res=await fetch('/api/room/join',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,resumeToken}),signal:AbortSignal.timeout(12000)});
    const data=await res.json();if(!res.ok)throw Error(({unauthorized:'Sua entrada expirou. Atualize a página para entrar novamente.',room_full:'Os seis lugares já estão ocupados.',try_later:'Aguarde um minuto antes de tentar novamente.',not_configured:'A sala ainda não foi configurada.'})[data.error]||'Não foi possível entrar na sala.');
    const socketURL=new URL(this.endpoint+'/ws');socketURL.protocol='wss:';
    this.closed=false;this.socket=new WebSocket(socketURL,['palermas-v1','ticket.'+data.ticket]);
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{reject(Error('Tempo de conexão esgotado.'));this.leave();},15000);
      this.socket.onmessage=e=>{this.lastPong=Date.now();if(e.data==='pong')return;let message;try{message=JSON.parse(e.data)}catch{return;}
        if(message.type==='welcome'){this.id=message.id;this.iceServers=message.iceServers;clearTimeout(timer);this.lastPong=Date.now();this.timer=setInterval(()=>{if(Date.now()-this.lastPong>60000){this.socket?.close();return}if(this.socket?.readyState===WebSocket.OPEN)this.socket.send('ping')},20000);this.statsTimer=setInterval(()=>this.collectStats(),5000);resolve();}
        this.queue=this.queue.then(()=>this.handle(message)).catch(error=>this.emit('error',error.message));
      };
      this.socket.onerror=()=>{clearTimeout(timer);reject(Error('Não foi possível conectar ao serviço da sala.'));};
      this.socket.onclose=()=>{clearTimeout(timer);reject(Error('Conexão com a sala encerrada.'));this.cleanup(false);this.emit('disconnected');};
    });
  }
  peer(id){
    const existing=this.peers.get(id);if(existing)return existing;
    const pc=new RTCPeerConnection({iceServers:this.iceServers});
    const entry={pc,candidates:[],received:new MediaStream(),failedTimer:null,restarts:0,previous:null,quality:null};this.peers.set(id,entry);
    pc.onicecandidate=e=>{if(e.candidate){try{this.send({type:'signal',to:id,payload:{type:'candidate',candidate:e.candidate.toJSON()}})}catch{}}};
    pc.ontrack=e=>{if(!entry.received.getTracks().some(t=>t.id===e.track.id))entry.received.addTrack(e.track);this.emit('media',entry.received);};
    pc.onconnectionstatechange=()=>{
      this.emit('peerstate',{id,state:pc.connectionState});
      clearTimeout(entry.failedTimer);
      if(pc.connectionState==='connected')entry.restarts=0;
      if(['failed','disconnected'].includes(pc.connectionState))entry.failedTimer=setTimeout(()=>this.repair(id),pc.connectionState==='failed'?1000:7000);
    };
    return entry;
  }
  async repair(id){const e=this.peers.get(id);if(!e||this.closed||e.pc.connectionState==='connected')return;
    if(e.restarts++>=3){this.emit('error','A conexão direta não voltou. Esta rede pode precisar de um servidor TURN.');return;}
    try{if(this.stream&&this.publisher===this.id)await this.offer(id,true);else this.send({type:'repair'});}catch{}
    e.failedTimer=setTimeout(()=>this.repair(id),12000);
  }
  async offer(id,restart=false){
    if(this.offerJobs.has(id)||!this.stream)return;this.offerJobs.add(id);
    try{const {pc}=this.peer(id);if(pc.signalingState!=='stable')return;if(!pc.getSenders().some(s=>s.track))for(const track of this.stream.getTracks())pc.addTrack(track,this.stream);
      await pc.setLocalDescription(await pc.createOffer({iceRestart:restart}));
      this.send({type:'signal',to:id,payload:{type:'offer',sdp:pc.localDescription.sdp}});
      await this.applyQuality(id);
    }finally{this.offerJobs.delete(id);}
  }
  async handle(data){
    if(['handoff-request','handoff-declined'].includes(data.type)){this.emit(data.type,data);if(data.type==='handoff-declined')this.pendingClaim?.reject(Error('A troca de transmissor foi recusada.'));return;}
    if(data.type==='handoff-complete'){if(data.publisher!==this.id&&this.stream){const old=this.stream;this.stream=null;this.emit('replaced');old.getTracks().forEach(t=>t.stop());}return;}
    if(data.type==='repair'&&this.publisher===this.id){await this.offer(data.from,true);return;}

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
  async publish(stream,bitrate,takeover=false){
    if(this.publisher&&this.publisher!==this.id&&!takeover)throw Error('Já tem um Palerma transmitindo.');
    if(this.stream)throw Error('Sua transmissão já está ativa.');
    this.stream=stream;this.bitrate=bitrate;
    try{
      await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Não foi possível assumir a transmissão.')),45000);this.pendingClaim={resolve:()=>{clearTimeout(timeout);resolve()},reject:e=>{clearTimeout(timeout);reject(e)}};this.send({type:takeover?'request-handoff':'claim'});});
    }catch(error){this.stream=null;throw error}finally{this.pendingClaim=null;}
  }
  async applyQuality(id){const e=this.peers.get(id);if(!e)return;const q=this.adaptive?(e.quality||{bitrate:this.bitrate||5000000,scale:1}):{bitrate:this.bitrate||5000000,scale:1};
    for(const sender of e.pc.getSenders())if(sender.track?.kind==='video'){const p=sender.getParameters();if(!p.encodings?.length)p.encodings=[{}];p.encodings[0].maxBitrate=Math.min(q.bitrate,this.bitrate||5000000);p.encodings[0].scaleResolutionDownBy=q.scale;try{await sender.setParameters(p)}catch{}}
  }
  async limitBitrate(bitrate,adaptive=this.adaptive){this.bitrate=bitrate;this.adaptive=adaptive;for(const [id,e]of this.peers){e.quality=null;await this.applyQuality(id)}}
  async collectStats(){if(this.collecting||this.closed)return;this.collecting=true;const samples=[];
    try{for(const [id,e]of this.peers){try{const reports=await e.pc.getStats();let video,pair;
      for(const r of reports.values()){if(r.type===(this.stream?'outbound-rtp':'inbound-rtp')&&(r.kind==='video'||r.mediaType==='video'))video=r;if(r.type==='transport'&&r.selectedCandidatePairId)pair=reports.get(r.selectedCandidatePairId);}
      if(!pair)pair=[...reports.values()].find(r=>r.type==='candidate-pair'&&r.state==='succeeded'&&r.nominated);
      const remote=video?.remoteId?reports.get(video.remoteId):null,prev=e.previous,ms=prev&&video?video.timestamp-prev.timestamp:0;
      const packets=this.stream?remote?.packetsReceived:video?.packetsReceived,lost=this.stream?remote?.packetsLost:video?.packetsLost,bytes=this.stream?video?.bytesSent:video?.bytesReceived;
      const dp=prev&&Number.isFinite(packets)&&Number.isFinite(prev.packets)?Math.max(0,packets-prev.packets):null,dl=prev&&Number.isFinite(lost)&&Number.isFinite(prev.lost)?Math.max(0,lost-prev.lost):null;
      const sample={id,name:this.members.find(m=>m.id===id)?.name||'Participante',state:e.pc.connectionState,width:video?.frameWidth||null,height:video?.frameHeight||null,fps:video?.framesPerSecond??null,bitrate:ms>0&&Number.isFinite(bytes)&&Number.isFinite(prev.bytes)?Math.max(0,(bytes-prev.bytes)*8000/ms):null,loss:dp!==null&&dl!==null&&dp+dl>0?dl/(dp+dl):null,rtt:pair?.currentRoundTripTime??remote?.roundTripTime??null,jitter:video?.jitter??null,limited:video?.qualityLimitationReason||null,scale:e.quality?.scale||1};
      sample.label=connectionLabel(sample);samples.push(sample);if(video)e.previous={timestamp:video.timestamp,bytes,packets,lost};
      if(this.stream&&this.adaptive&&sample.state==='connected'&&(sample.loss!==null||sample.rtt!==null)){e.quality=nextQuality(e.quality,{...sample,loss:sample.loss??0},this.bitrate||5000000);await this.applyQuality(id);}
    }catch{}}this.emit('stats',samples);}finally{this.collecting=false;}
  }
  stop(){this.pendingClaim?.reject(Error('Compartilhamento encerrado.'));this.pendingClaim=null;this.stream=null;this.closePeers();if(this.publisher===this.id){try{this.send({type:'release'})}catch{}}}
  closePeer(id){const e=this.peers.get(id);if(e){clearTimeout(e.failedTimer);e.pc.onconnectionstatechange=null;e.pc.close();this.peers.delete(id)}}
  closePeers(){for(const id of this.peers.keys())this.closePeer(id);this.offerJobs.clear();}
  cleanup(stopMedia=true){this.closed=true;clearInterval(this.timer);clearInterval(this.statsTimer);if(stopMedia){this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;}this.closePeers();this.id=null;this.publisher=null;this.members=[];this.pendingClaim?.reject(Error('A sala foi desconectada.'));this.pendingClaim=null;}
  leave(){const ws=this.socket;this.socket=null;if(ws)ws.onclose=null;this.cleanup();ws?.close(1000,'Saiu da sala');}
}
