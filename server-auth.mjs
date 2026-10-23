import {dailyGames,nextClubGames,leagueTable,brazilDate} from './football.mjs';
import {geCompetition,publicGERound} from './ge-feed.mjs';
import {clubHub} from './club-hub.mjs';
import {matchCenter} from './match-center.mjs';
import {groupAPI} from './group-api.mjs';
import {playerRatings} from './player-ratings.mjs';
import {signalingEndpoint} from './signaling-endpoint.mjs';
const enc=new TextEncoder();
const COOKIE='palermas_session';
const MAX_AGE=7*24*60*60;
const attempts=new Map();
const privateHeaders={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'same-origin','X-Robots-Tag':'noindex, nofollow, noarchive'};
function json(body,status=200,extra={}){return new Response(JSON.stringify(body),{status,headers:{...privateHeaders,'Content-Type':'application/json',...extra}})}
function b64(bytes){return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}
function unb64(str){return Uint8Array.from(atob(str.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))}
async function key(env){return crypto.subtle.importKey('raw',enc.encode(env.ROOM_CODE+'|site-login|'+env.SITE_PASSWORD),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
async function session(env){const value=b64(enc.encode(JSON.stringify({exp:Math.floor(Date.now()/1000)+MAX_AGE,nonce:crypto.randomUUID()})));const sig=await crypto.subtle.sign('HMAC',await key(env),enc.encode(value));return value+'.'+b64(new Uint8Array(sig))}
async function authorized(request,env){
 const value=request.headers.get('Cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 if(!value||value.length>700)return false;
 try{const [data,sig,...rest]=value.split('.');if(rest.length||!await crypto.subtle.verify('HMAC',await key(env),unb64(sig),enc.encode(data)))return false;return JSON.parse(new TextDecoder().decode(unb64(data))).exp>Math.floor(Date.now()/1000)}catch{return false}
}
const cookie=(value,age)=>`${COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${age}`;
function loginPage(){return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Entrar · PalermasTV</title><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#0c1729"><style>*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0c1729;color:#f3f4ed;font-family:system-ui,sans-serif;padding:24px;background-image:radial-gradient(ellipse at 5% 90%,#4a1c2344,transparent 55%),radial-gradient(ellipse at 90% 10%,#245f9444,transparent 55%)}.card{width:min(410px,100%)}.logo{font-size:31px;font-weight:800;letter-spacing:-1.5px}.logo span{color:#f3c765}.eyebrow{color:#9eab96;font-size:10px;letter-spacing:2px;margin-top:40px}h1{font-size:36px;letter-spacing:-1px;line-height:1.15;margin:14px 0}p{color:#9ca696;font-size:14px;line-height:1.7}label{display:block;font-size:12px;margin:30px 0 10px}input{width:100%;background:#14243b;border:1px solid #38516b;border-radius:8px;color:#f3f4ed;padding:15px;font:inherit}button{width:100%;padding:15px;border:0;border-radius:8px;background:#f3c765;color:#1c2714;font-size:14px;font-weight:700;cursor:pointer;margin-top:14px}input:focus-visible,button:focus-visible{outline:2px solid #d2f66d;outline-offset:3px}button:disabled{opacity:.6}#error{color:#ffb3ad;font-size:12px;min-height:18px;margin-top:12px}.foot{margin-top:45px;border-top:1px solid #2c3528;padding-top:18px;font-size:11px;color:#7f8c76}</style></head><body><main class="card"><img src="/logo.png" alt="Palermas FC" style="display:block;width:180px;border-radius:18px;margin:0 auto 28px"><h1>PalermasTV</h1><p>Digite a senha para acessar o site.</p><form id="login"><label for="password">Senha do grupo</label><input type="password" id="password" autocomplete="current-password" required autofocus placeholder="Digite a senha"><button type="submit" id="submit">Entrar no PalermasTV ↗</button><div id="error" role="alert"></div></form></main><script>document.querySelector('#login').addEventListener('submit',async e=>{e.preventDefault();const b=document.querySelector('#submit'),p=document.querySelector('#password'),error=document.querySelector('#error');b.disabled=true;error.textContent='';try{const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:p.value})});p.value='';if(r.ok)location.reload();else error.textContent=r.status===429?'Muitas tentativas. Aguarde um minuto.':'Senha incorreta. Tente novamente.';}catch{error.textContent='Não foi possível conectar. Tente novamente.';}finally{b.disabled=false;}});</script></body></html>`,{headers:{...privateHeaders,'Content-Type':'text/html; charset=utf-8'}})}
async function equal(a,b){const [x,y]=await Promise.all([a,b].map(v=>crypto.subtle.digest('SHA-256',enc.encode(v))));const aa=new Uint8Array(x),bb=new Uint8Array(y);let diff=0;for(let i=0;i<aa.length;i++)diff|=aa[i]^bb[i];return diff===0}
export async function handleSite(request,env,assets,fetcher=fetch){
 if(!env.SITE_PASSWORD||!env.ROOM_CODE)return json({error:'site_not_configured'},503);
 const url=new URL(request.url),path=url.pathname;
 if(request.method==='POST'){
   if(request.headers.get('Origin')!==url.origin)return json({error:'origin_denied'},403);
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'invalid_type'},415);
   if(path==='/api/login'){
     const ip=request.headers.get('cf-connecting-ip')||request.headers.get('x-real-ip')||'unknown';const now=Date.now();
     for(const [k,v]of attempts)if(now-v.start>60000)attempts.delete(k);
     if(attempts.size>2000)return json({error:'try_later'},429);
     const rate=attempts.get(ip)||{start:now,count:0};if(rate.count>=8)return json({error:'try_later'},429);rate.count++;attempts.set(ip,rate);
     const raw=await request.text();if(raw.length>2048)return json({error:'too_large'},413);
     let data;try{data=JSON.parse(raw)}catch{return json({error:'invalid_json'},400)}
     if(typeof data.password!=='string'||!await equal(data.password,env.SITE_PASSWORD))return json({error:'wrong_password'},401);
     attempts.delete(ip);return json({ok:true},200,{'Set-Cookie':cookie(await session(env),MAX_AGE)});
   }
   if(!await authorized(request,env))return json({error:'unauthorized'},401);
   if(path.startsWith('/api/group/')){const r=await groupAPI(request,env,fetcher);return json(r.body,r.status)}
   if(path==='/api/logout')return json({ok:true},200,{'Set-Cookie':cookie('',0)});
   if(path==='/api/room/join'){
     const raw=await request.text();if(raw.length>2048)return json({error:'too_large'},413);
     let data;try{data=JSON.parse(raw)}catch{return json({error:'invalid_json'},400)}
     const name=typeof data.name==='string'?data.name.trim().slice(0,24):'';if(!name)return json({error:'invalid_name'},400);
     const remote=await fetcher(signalingEndpoint(env)+'/join',{method:'POST',headers:{Origin:url.origin,'Content-Type':'application/json'},body:JSON.stringify({name,resumeToken:typeof data.resumeToken==='string'?data.resumeToken.slice(0,100):undefined,code:env.ROOM_CODE})});
     return new Response(await remote.text(),{status:remote.status,headers:{...privateHeaders,'Content-Type':'application/json'}});
   }
   return json({error:'not_found'},404);
 }
 if(request.method!=='GET'&&request.method!=='HEAD')return json({error:'method_not_allowed'},405);
 const signedIn=await authorized(request,env);
 if(path==='/logo.png'&&assets['logo.png'])return new Response(unb64(assets['logo.png'].body),{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=3600'}});
 if(['/manifest.webmanifest','/sw.js','/app-icon.svg'].includes(path)&&assets[path.slice(1)]){const asset=assets[path.slice(1)];return new Response(asset.base64?unb64(asset.body):asset.body,{headers:{...privateHeaders,'Content-Type':asset.type,...(path==='/sw.js'?{'Service-Worker-Allowed':'/'}:{})}})}
 if(path==='/api/session')return json({authenticated:signedIn},signedIn?200:401);
 if(!signedIn){if(path==='/'||path==='/index.html')return loginPage();return json({error:'unauthorized'},401)}
 if(path.startsWith('/api/group/')){const r=await groupAPI(request,env,fetcher);return json(r.body,r.status)}
 if(path.startsWith('/api/football/')){
   try{let value;
     if(path==='/api/football/brasileirao')value=publicGERound(await geCompetition(url.searchParams.get('serie')||'a',fetcher));
     else if(path==='/api/football/games')value=await dailyGames(url.searchParams.get('date')||brazilDate(new Date()),fetcher);
     else if(path==='/api/football/clubs')value=await nextClubGames(fetcher);
     else if(path==='/api/football/hub')value=await clubHub(fetcher);
     else if(path==='/api/football/match')value=await matchCenter(url.searchParams.get('league'),url.searchParams.get('id'),fetcher);
     else if(path==='/api/football/ratings')value=await playerRatings(url.searchParams.get('league'),url.searchParams.get('id'),env,fetcher);
     else if(path==='/api/football/standings')value=await leagueTable(url.searchParams.get('league')||'bra.1',fetcher);
     else return json({error:'not_found'},404);
     return json(value);
   }catch(error){return json({error:error.message||'Dados indisponíveis'},502)}
 }
 if(path==='/room-config.json')return json({signalingUrl:signalingEndpoint(env)});
 const name=path==='/'?'index.html':path.slice(1);const asset=assets[name];
 if(!asset)return json({error:'not_found'},404);
 return new Response(request.method==='HEAD'?null:asset.base64?unb64(asset.body):asset.body,{headers:{...privateHeaders,'Content-Type':asset.type}});
}
