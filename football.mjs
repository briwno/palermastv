import {geSeries,geCompetition,geStandings,markGELive} from './ge-feed.mjs';
export const leagues=[
 {id:'bra.1',name:'Brasileirão Série A',region:'brasil'},
 {id:'bra.2',name:'Brasileirão Série B',region:'brasil'},
 {id:'bra.copa_do_brazil',name:'Copa do Brasil',region:'brasil'},
 {id:'conmebol.libertadores',name:'Libertadores',region:'brasil'},
 {id:'conmebol.sudamericana',name:'Sul-Americana',region:'brasil'},
 {id:'eng.1',name:'Premier League',region:'europa'},
 {id:'esp.1',name:'La Liga',region:'europa'},
 {id:'ita.1',name:'Serie A italiana',region:'europa'},
 {id:'uefa.champions',name:'Champions League',region:'europa'}
];
const memory=new Map(),inflight=new Map();
const safeLink=v=>{try{const u=new URL(v);return u.protocol==='https:'&&(/(^|\.)espn\.com(\.br)?$/.test(u.hostname)||u.hostname==='a.espncdn.com')?u.href:null}catch{return null}};
export function brazilDate(value){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))}
function score(v){return v===undefined||v===null?null:typeof v==='object'?String(v.displayValue??v.value??''):String(v)}
function team(c){const record=c.records?.find(r=>r.type==='total')?.summary;const nums=/^\d+-\d+-\d+$/.test(record||'')?record.split('-').map(Number):null;return{id:String(c.team?.id||c.id||''),name:c.team?.shortDisplayName||c.team?.displayName||'A definir',logo:safeLink(c.team?.logo||c.team?.logos?.[0]?.href),recordPlayed:nums?nums.reduce((a,b)=>a+b,0):null}}
export function normalizeEvent(event,league){
 const c=event.competitions?.[0];if(!c||!event.id||!event.date||!Number.isFinite(Date.parse(event.date)))return null;
 const home=c.competitors?.find(t=>t.homeAway==='home'),away=c.competitors?.find(t=>t.homeAway==='away');if(!home||!away)return null;
 const state=(event.status||c.status)?.type||{};
 const broadcasts=[...(c.broadcasts||[]).flatMap(b=>b.names||b.media?.shortName&&[b.media.shortName]||[]),...(c.geoBroadcasts||[]).filter(b=>!b.market?.type||b.market?.type==='National').map(b=>b.media?.shortName).filter(Boolean)];
 return{id:String(event.id),date:event.date,day:brazilDate(event.date),home:team(home),away:team(away),homeScore:state.state==='pre'?null:score(home.score),awayScore:state.state==='pre'?null:score(away.score),state:state.state||'pre',status:state.description||state.detail||'Agendado',clock:(event.status||c.status)?.displayClock||'',timeValid:c.timeValid!==false&&event.timeValid!==false,venue:c.venue?.fullName||event.venue?.displayName||null,leagueId:league.id,league:league.name,region:league.region,broadcasts:[...new Set(broadcasts)],sourceUrl:safeLink(event.links?.find(l=>l.rel?.includes('summary')&&l.rel?.includes('desktop'))?.href)};
}
export async function feed(url,ttl,fetcher=fetch){
 const now=Date.now(),old=memory.get(url);if(old&&old.expires>now)return old.value;if(inflight.has(url))return inflight.get(url);
 const job=(async()=>{
   const cache=typeof caches!=='undefined'?caches.default:null;
   let cached=null;try{cached=cache?await cache.match(url):null}catch{}
   if(cached){const value=await cached.json();memory.set(url,{value,expires:now+ttl*1000});return value;}
   const response=await fetcher(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('Fonte indisponível');const value=await response.json();
   if(!value||typeof value!=='object')throw Error('Resposta inválida');
   if(memory.size>80)memory.clear();memory.set(url,{value,expires:now+ttl*1000});
   if(cache)try{await cache.put(url,new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age='+ttl}}))}catch{}
   return value;
 })();inflight.set(url,job);try{return await job}finally{inflight.delete(url)}
}
export async function dailyGames(date,fetcher=fetch){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z')))throw Error('Data inválida');
 const next=new Date(date+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);
 const dates=[date.replaceAll('-',''),next.toISOString().slice(0,10).replaceAll('-','')];
 const results=await Promise.allSettled(leagues.map(async league=>{
   const pages=await Promise.all(dates.map(value=>feed(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league.id}/scoreboard?dates=${value}&limit=200&lang=pt&region=br`,60,fetcher)));
   if(pages.some(data=>!Array.isArray(data.events)))throw Error('Sem agenda');return pages.flatMap(data=>data.events).map(e=>normalizeEvent(e,league)).filter(e=>e&&e.day===date);
 }));
 const unavailable=results.flatMap((r,i)=>r.status==='rejected'?[leagues[i].name]:[]);
 if(unavailable.length===leagues.length)throw Error('Não foi possível consultar os jogos.');
 const games=[...new Map(results.flatMap(r=>r.status==='fulfilled'?r.value:[]).map(e=>[e.id,e])).values()].sort((a,b)=>a.date.localeCompare(b.date));
 return{games,date,leagues,unavailable,source:'ESPN',checkedAt:new Date().toISOString(),refreshSeconds:60};
}
export async function nextClubGames(fetcher=fetch){
 const clubs=[{key:'cap',id:'3458'},{key:'coxa',id:'3456'}];
 const results=await Promise.allSettled(clubs.map(async club=>{
   const data=await feed(`https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/teams/${club.id}/schedule?fixture=true&lang=pt&region=br`,900,fetcher);
   if(!Array.isArray(data.events))throw Error('Sem calendário');
   const games=data.events.map(e=>normalizeEvent(e,leagues.find(l=>l.id===e.league?.slug)||{id:e.league?.slug||'bra.1',name:e.league?.name||'Brasileirão',region:'brasil'})).filter(e=>e&&(e.state==='in'||(e.state==='pre'&&new Date(e.date)>new Date()))).sort((a,b)=>a.date.localeCompare(b.date));
   return{key:club.key,game:games[0]||null,games:games.slice(0,3)};
 }));return{clubs:results.map((r,i)=>r.status==='fulfilled'?r.value:{key:clubs[i].key,game:null,error:true}),source:'ESPN',checkedAt:new Date().toISOString()};
}
export function normalizeStandings(data){
 const groups=[];function walk(node){if(Array.isArray(node.standings?.entries)){groups.push({name:node.name||'',rows:node.standings.entries.map((e,index)=>{const stats=Object.fromEntries((e.stats||[]).map(s=>[s.name,s.value]));return{rank:stats.rank||index+1,id:String(e.team.id),name:e.team.shortDisplayName||e.team.displayName,logo:safeLink(e.team.logos?.[0]?.href),points:stats.points??null,played:stats.gamesPlayed??null,wins:stats.wins??null,draws:stats.ties??null,losses:stats.losses??null,goalDifference:stats.pointDifferential??null,goalsFor:stats.pointsFor??null,goalsAgainst:stats.pointsAgainst??null}})});}for(const child of node.children||[])walk(child)}walk(data);return groups;
}
export function projectStandings(groups,games,leagueId){
 const live=games.filter(g=>g.state==='in');
 return groups.map(group=>{
   const rows=group.rows.map(original=>{const r={...original};const g=live.find(g=>[g.home.id,g.away.id].includes(r.id));if(!g)return r;
     const home=g.home.id===r.id,own=home?g.home:g.away,opponent=home?g.away:g.home;
     r.live={gameId:g.id,clock:g.clock,status:g.status,opponent:opponent.name,score:g.homeScore+' × '+g.awayScore,home:g.home.name,away:g.away.name,projected:false};
     const gf=Number(home?g.homeScore:g.awayScore),ga=Number(home?g.awayScore:g.homeScore);
     if(own.recordPlayed!==null&&own.recordPlayed===r.played&&g.homeScore!==null&&g.awayScore!==null&&Number.isFinite(gf)&&Number.isFinite(ga)){
       const pts=gf>ga?3:gf===ga?1:0;r.live.projected=true;r.live.pointsAdded=pts;r.live.basePoints=r.points;
       for(const [key,delta]of Object.entries({points:pts,played:1,wins:gf>ga?1:0,draws:gf===ga?1:0,losses:gf<ga?1:0,goalsFor:gf,goalsAgainst:ga,goalDifference:gf-ga}))if(typeof r[key]==='number')r[key]+=delta;
     }return r;
   });
   if(rows.some(r=>r.live?.projected))rows.sort((a,b)=>(b.points-a.points)||(leagueId.startsWith('bra.')?b.wins-a.wins:0)||(b.goalDifference-a.goalDifference)||(b.goalsFor-a.goalsFor)||(a.rank-b.rank));
   return{...group,rows:rows.map((r,i)=>({...r,officialRank:r.rank,rank:i+1}))};
 });
}
export async function leagueTable(id,fetcher=fetch){
 const league=leagues.find(l=>l.id===id);if(!league)throw Error('Competição inválida');
 const [espn,ge]=await Promise.allSettled([feed(`https://site.api.espn.com/apis/v2/sports/soccer/${id}/standings?region=br&lang=pt`,60,fetcher),geSeries[id]?geCompetition(geSeries[id],fetcher):Promise.resolve(null)]);
 const data=espn.status==='fulfilled'?espn.value:{},geData=ge.status==='fulfilled'?ge.value:null;
 const groups=geData?geStandings(geData,normalizeStandings(data)):normalizeStandings(data);if(!groups.length)throw Error('Classificação indisponível para esta competição.');
 let games=[],liveAvailable=true;try{const date=brazilDate(new Date()),next=new Date(date+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);const pages=await Promise.all([date.replaceAll('-',''),next.toISOString().slice(0,10).replaceAll('-','')].map(value=>feed(`https://site.api.espn.com/apis/site/v2/sports/soccer/${id}/scoreboard?dates=${value}&limit=200&lang=pt&region=br`,60,fetcher)));games=[...new Map(pages.flatMap(p=>p.events||[]).map(e=>normalizeEvent(e,league)).filter(Boolean).map(g=>[g.id,g])).values()]}catch{liveAvailable=false}
 return{league,season:geData?.competition.season||data.season?.displayName||data.season?.year||null,groups:geData?markGELive(groups,games):projectStandings(groups,games,id),pointsMode:geData?'source':'projected',liveGames:games.filter(g=>g.state==='in'),liveAvailable,source:geData?'ge · biblioteca ezefranca':'ESPN',fallback:!!geSeries[id]&&!geData,checkedAt:new Date().toISOString(),refreshSeconds:60};
}
