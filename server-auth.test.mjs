import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleSite} from './server-auth.mjs';
const env={SITE_PASSWORD:'test-password',ROOM_CODE:'internal-server-only-test-key'};
const assets={'index.html':{body:'PRIVATE SITE',type:'text/html'},'room.js':{body:'PRIVATE JS',type:'text/javascript'}};
const origin='https://palermastv.example';
const req=(path,body,cookie)=>new Request(origin+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
async function signIn(){const r=await handleSite(req('/api/login',{password:env.SITE_PASSWORD}),env,assets);assert.equal(r.status,200);return r.headers.get('Set-Cookie')}
test('unauthenticated visitors only get the login page; scripts and room APIs stay protected',async()=>{
 const page=await handleSite(req('/'),env,assets);assert.match(await page.text(),/Senha do grupo/);
 assert.equal((await handleSite(req('/room.js'),env,assets)).status,401);
 assert.equal((await handleSite(req('/api/football/games'),env,assets)).status,401);
 assert.equal((await handleSite(req('/api/room/join',{name:'Guest'}),env,assets)).status,401);
 assert.equal((await handleSite(req('/api/login',{password:'wrong'}),env,assets)).status,401);
});
test('valid password creates an HttpOnly signed session and unlocks site assets',async()=>{
 const cookie=await signIn();assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);assert.ok(!cookie.includes(env.SITE_PASSWORD));
 const page=await handleSite(req('/',null,cookie),env,assets);assert.equal(await page.text(),'PRIVATE SITE');
 const script=await handleSite(req('/room.js',null,cookie),env,assets);assert.equal(await script.text(),'PRIVATE JS');
 const tampered=cookie.replace('palermas_session=','palermas_session=x');assert.equal((await handleSite(req('/room.js',null,tampered),env,assets)).status,401);
});
test('the room uses the server session and injects its private code only on the server',async()=>{
 const cookie=await signIn();let sent;
 const result=await handleSite(req('/api/room/join',{name:'Palerma'},cookie),env,assets,async(url,options)=>{sent={url,body:JSON.parse(options.body)};return Response.json({ticket:'single-use-ticket'})});
 assert.equal(result.status,200);assert.equal(sent.body.code,env.ROOM_CODE);assert.equal(sent.body.name,'Palerma');assert.ok(!(await result.text()).includes(env.ROOM_CODE));
 const crossSite=new Request(origin+'/api/logout',{method:'POST',headers:{Origin:'https://other.example','Content-Type':'application/json',Cookie:cookie},body:'{}'});assert.equal((await handleSite(crossSite,env,assets)).status,403);
 const logout=await handleSite(req('/api/logout',{},cookie),env,assets);assert.match(logout.headers.get('Set-Cookie'),/Max-Age=0/);
});
