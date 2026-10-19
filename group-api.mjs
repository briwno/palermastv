import {matchCenter} from './match-center.mjs';
const SIGNAL='https://palermastv-sinalizacao.brunoalvesbezerra-ba.workers.dev';
export async function groupAPI(request,env,fetcher=fetch){
 const url=new URL(request.url);
 async function call(data){const r=await fetcher(SIGNAL+'/group',{method:'POST',headers:{Origin:url.origin,'Content-Type':'application/json'},body:JSON.stringify({...data,code:env.ROOM_CODE}),signal:AbortSignal.timeout(12000)});let body;try{body=await r.json()}catch{throw Error('Serviço do grupo indisponível.')}return{status:r.status,body}}
 try{
   if(url.pathname==='/api/group/lounge'){
     if(request.method==='GET')return await call({action:'lounge',operation:'read',context:url.searchParams.get('context')||'sala'});
     if(request.method!=='POST')return{status:405,body:{error:'method_not_allowed'}};
     const raw=await request.text();if(raw.length>4000)return{status:413,body:{error:'too_large'}};
     let body;try{body=JSON.parse(raw)}catch{return{status:400,body:{error:'invalid_json'}}}
     return await call({action:'lounge',operation:body.operation,context:body.context,token:body.token,name:body.name,question:body.question,options:body.options,pollId:body.pollId,choice:body.choice,url:body.url});
   }
   if(url.pathname==='/api/group/status'&&request.method==='GET')return await call({action:'status'});
   if(url.pathname==='/api/group/ranking'&&request.method==='GET'){
     const pending=await call({action:'pending'});if(pending.status!==200)return pending;
     const settled=await Promise.allSettled((pending.body.games||[]).map(async g=>{const d=await matchCenter(g.league,g.id,fetcher);const m=d.game;if(m.state!=='post'||m.homeScore===null||m.awayScore===null||!Number.isFinite(Number(m.homeScore))||!Number.isFinite(Number(m.awayScore)))return null;return{league:g.league,id:g.id,home:Number(m.homeScore),away:Number(m.awayScore)}}));
     const results=settled.filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value);if(results.length)await call({action:'settle',results});return await call({action:'ranking'});
   }
   if(url.pathname!=='/api/group/predictions')return{status:404,body:{error:'not_found'}};
   let body={};if(request.method==='POST'){const raw=await request.text();if(raw.length>2000)return{status:413,body:{error:'too_large'}};try{body=JSON.parse(raw)}catch{return{status:400,body:{error:'invalid_json'}}}}
   const league=request.method==='POST'?body.league:url.searchParams.get('league'),id=request.method==='POST'?body.id:url.searchParams.get('id');
   const {game}=await matchCenter(league,id,fetcher);const metadata={league,id:game.id,date:game.date,state:game.state,homeName:game.home.name,awayName:game.away.name};
   if(request.method==='GET')return await call({action:'picks',game:metadata});
   if(request.method!=='POST')return{status:405,body:{error:'method_not_allowed'}};
   return await call({action:'vote',game:metadata,token:body.token,name:body.name,home:body.home,away:body.away});
 }catch{return{status:502,body:{error:'group_unavailable'}}}
}
