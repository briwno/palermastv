export const DEFAULT_SIGNALING_URL='https://palermastv-sinalizacao.brunoalvesbezerra-ba.workers.dev';
export function signalingEndpoint(env={}){
 const u=new URL(env.SIGNALING_URL||DEFAULT_SIGNALING_URL);
 const local=env.NODE_ENV!=='production'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&u.protocol==='http:';
 if((u.protocol!=='https:'&&!local)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('Endereço da sinalização inválido.');
 return u.origin;
}
