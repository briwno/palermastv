import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker,{PalermasRoom,sameSecret,validSignal} from './worker.mjs';
const origin='https://palermastv.solargrass4.chatgpt.site';
class Store extends Map {async list({prefix=''}={}){return new Map([...this].filter(([k])=>k.startsWith(prefix)))}async put(k,v){this.set(k,v)}}
function room(){
  const members=new Map();const ctx={storage:new Store(),getWebSockets:()=>[],setWebSocketAutoResponse:()=>{},blockConcurrencyWhile:fn=>fn()};
  const r=new PalermasRoom(ctx,{ROOM_CODE:'test-code-not-a-production-secret'});
  function add(id,publishing=false){const ws={values:[],send(v){this.values.push(JSON.parse(v))},serializeAttachment(){},close(){this.closed=true}};r.members.set(ws,{id,name:id,publishing,window:Date.now(),messages:0});members.set(id,ws);return ws}
  return {r,ctx,add,members};
}
globalThis.WebSocketRequestResponsePair=class{};
test('joins reject a wrong code, cap attempts, issue an expiring ticket without exposing code',async()=>{
 const {r,ctx}=room();
 const request=code=>new Request('https://signal.example/join',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify({name:'Palerma',code})});
 assert.equal((await r.fetch(request('incorrect'))).status,401);
 const joined=await r.fetch(request('test-code-not-a-production-secret'));assert.equal(joined.status,200);
 const body=await joined.json();assert.equal(body.ticket.length,72);assert.equal(body.code,undefined);
 assert.ok(ctx.storage.has('ticket:'+body.ticket));
 for(let i=0;i<4;i++)await r.fetch(request('incorrect'));
 assert.equal((await r.fetch(request('incorrect'))).status,429);
});
test('room admits at most six connected people',async()=>{
 const {r,add}=room();for(let i=0;i<6;i++)add('person'+i);
 const res=await r.fetch(new Request('https://signal.example/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Seventh',code:'test-code-not-a-production-secret'})}));
 assert.equal(res.status,409);assert.equal((await res.json()).error,'room_full');
});
test('single publisher lock, valid directed signaling, and viewer isolation',()=>{
 const {r,add}=room();const host=add('host'),a=add('a'),b=add('b');
 const msg=(ws,data)=>r.webSocketMessage(ws,JSON.stringify(data));
 msg(host,{type:'claim'});assert.equal(r.snapshot().publisher,'host');
 msg(a,{type:'claim'});assert.equal(r.snapshot().publisher,'host');assert.equal(a.values.at(-1).type,'error');
 const before=b.values.length;
 msg(a,{type:'signal',to:'b',payload:{type:'offer',sdp:'forbidden'}});assert.equal(b.values.length,before);
 msg(host,{type:'signal',to:'a',payload:{type:'offer',sdp:'offer-sdp'}});assert.equal(a.values.at(-1).from,'host');
 msg(a,{type:'signal',to:'host',payload:{type:'answer',sdp:'answer-sdp'}});assert.equal(host.values.at(-1).from,'a');
 msg(a,{type:'signal',to:'host',payload:{type:'offer',sdp:'forbidden'}});assert.equal(host.values.at(-1).payload.type,'answer');
 r.remove(host);assert.equal(r.snapshot().publisher,null);msg(a,{type:'claim'});assert.equal(r.snapshot().publisher,'a');
});
test('oversized signals and media-like payloads are rejected',()=>{
 assert.equal(validSignal({type:'offer',sdp:'x'.repeat(64001)}),false);
 assert.equal(validSignal({type:'video',bytes:'no media through signaling'}),false);
 assert.equal(validSignal({type:'candidate',candidate:{candidate:'candidate:123'}}),true);
 const {r,add}=room();const ws=add('a');r.webSocketMessage(ws,'x'.repeat(70001));assert.equal(ws.closed,true);assert.equal(r.members.size,0);
});
test('room reactions accept only allowed emoji, throttle sending and use server-side names',()=>{const {r,add}=room();const a=add('a'),b=add('b');r.webSocketMessage(a,JSON.stringify({type:'reaction',emoji:'🔥',name:'Forged'}));assert.deepEqual(b.values.at(-1),{type:'reaction',emoji:'🔥',from:'a',name:'a'});const count=b.values.length;r.webSocketMessage(a,JSON.stringify({type:'reaction',emoji:'🔥'}));assert.equal(b.values.length,count);r.webSocketMessage(a,JSON.stringify({type:'reaction',emoji:'<script>'}));assert.equal(b.values.length,count)});
test('cross-site access and missing configuration fail closed',async()=>{
 assert.equal((await worker.fetch(new Request('https://signal.example/join',{headers:{Origin:'https://other.example'}}),{})).status,403);
 assert.equal((await worker.fetch(new Request('https://signal.example/join',{headers:{Origin:origin}}),{})).status,503);
 assert.equal(await sameSecret('same','same'),true);assert.equal(await sameSecret('same','different'),false);
});
