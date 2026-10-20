export const qualityProfiles={
 auto:{width:1920,height:1080,frameRate:30,bitrate:12000000},
 balanced:{width:1280,height:720,frameRate:30,bitrate:5000000},
 high:{width:1920,height:1080,frameRate:30,bitrate:12000000},
 sports:{width:1920,height:1080,frameRate:60,bitrate:16000000}
};
// WebRTC handles brief congestion. Never lower our cap on the bandwidth flag alone.
export function nextQuality(state,sample,ceiling=12000000){
 const floor=Math.min(1500000,ceiling),current={bitrate:ceiling,scale:1,good:0,bad:0,...state};
 const loss=Number.isFinite(sample.loss)?sample.loss:null,rtt=Number.isFinite(sample.rtt)?sample.rtt:null;
 const available=Number.isFinite(sample.available)&&sample.available>0?sample.available:null;
 const lossTrouble=loss!==null&&loss>.08;
 const capacityTrouble=sample.limited==='bandwidth'&&available!==null&&available<current.bitrate*.65;
 const queueTrouble=rtt!==null&&rtt>.9&&Number.isFinite(sample.previousRtt)&&rtt>sample.previousRtt+.15;
 const cpu=sample.limited==='cpu';
 const poor=!cpu&&(lossTrouble||capacityTrouble||queueTrouble);
 const healthy=!cpu&&!poor&&(loss===null||loss<.025)&&(rtt===null||rtt<.6)&&(loss!==null||rtt!==null||available!==null);
 current.bad=poor?current.bad+1:0;current.good=healthy?current.good+1:0;
 if(current.bad>=3){current.bitrate=Math.max(floor,Math.round(current.bitrate*.8));current.bad=0;current.good=0;}
 else if(current.good>=4){current.bitrate=Math.min(ceiling,Math.max(current.bitrate+500000,Math.round(current.bitrate*1.25)));current.good=0;}
 current.bitrate=Math.max(floor,Math.min(current.bitrate,ceiling));
 if(current.bitrate<1800000)current.scale=2;
 else if(current.bitrate<3000000)current.scale=current.scale===2&&current.bitrate<2400000?2:1.5;
 else if(current.scale>1&&current.bitrate<4000000)current.scale=1.5;
 else current.scale=1;
 return current;
}
export function connectionLabel(sample){
 if(sample.state!=='connected')return sample.state==='failed'?'Sem conexão':'Reconectando';
 if(sample.loss===null&&sample.rtt===null)return 'Medindo';
 return sample.loss>.08||sample.rtt>.9?'Instável':sample.loss>.025||sample.rtt>.45?'Regular':'Boa';
}
export function preferVideoCodecs(codecs=[]){
 const order=c=>/video\/h264/i.test(c.mimeType)?0:/video\/vp8/i.test(c.mimeType)?1:/video\/vp9/i.test(c.mimeType)?2:3;
 return [...codecs].sort((a,b)=>order(a)-order(b));
}
