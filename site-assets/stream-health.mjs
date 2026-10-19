// Five-second samples. Bad links step down quickly; recovery needs sustained headroom.
export function nextQuality(state, sample, ceiling=5000000) {
  const current={bitrate:ceiling,scale:1,good:0,bad:0,...state};
  const poor=sample.loss>0.05||sample.rtt>0.8||sample.limited==='bandwidth';
  const healthy=sample.loss<0.015&&(sample.rtt===null||sample.rtt<0.35)&&sample.limited!=='bandwidth';
  current.bad=poor?current.bad+1:0;current.good=healthy?current.good+1:0;
  if(current.bad>=2){current.bitrate=Math.max(500000,Math.round(current.bitrate*.65));current.bad=0;current.good=0;}
  else if(current.good>=6){current.bitrate=Math.min(ceiling,Math.round(current.bitrate*1.2));current.good=0;}
  current.bitrate=Math.min(current.bitrate,ceiling);
  current.scale=current.bitrate<1000000?3:current.bitrate<2200000?2:1;
  return current;
}
export function connectionLabel(sample) {
  if(sample.state!=='connected')return sample.state==='failed'?'Sem conexão':'Reconectando';
  if(sample.loss===null&&sample.rtt===null)return 'Medindo';
  return sample.loss>0.05||sample.rtt>0.8?'Instável':sample.loss>0.02||sample.rtt>0.4?'Regular':'Boa';
}
