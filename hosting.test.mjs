import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signalingEndpoint} from './signaling-endpoint.mjs';
import worker,{allowedOrigins} from './signaling/worker.mjs';
test('signaling supports secure production and local development endpoints',()=>{
 assert.equal(signalingEndpoint({SIGNALING_URL:'https://signal.example/'}),'https://signal.example');
 assert.equal(signalingEndpoint({SIGNALING_URL:'http://127.0.0.1:8787',NODE_ENV:'development'}),'http://127.0.0.1:8787');
 for(const value of ['http://example.com','https://name:secret@example.com','https://example.com/path','https://example.com?x=1','http://127.0.0.1:8787'])assert.throws(()=>signalingEndpoint({SIGNALING_URL:value,NODE_ENV:'production'}));
});
test('worker allows exact new origins while preserving the existing site',async()=>{
 const env={ALLOWED_ORIGINS:'https://example.vercel.app,http://localhost:3000,*'};
 assert.ok(allowedOrigins(env).has('https://palermastv.solargrass4.chatgpt.site'));
 assert.ok(!allowedOrigins(env).has('*'));
 for(const origin of ['https://example.vercel.app.evil.test','https://other.vercel.app'])assert.equal((await worker.fetch(new Request('https://signal.example/join',{method:'OPTIONS',headers:{Origin:origin}}),env)).status,403);
 const accepted=await worker.fetch(new Request('https://signal.example/join',{method:'OPTIONS',headers:{Origin:'https://example.vercel.app'}}),env);
 assert.equal(accepted.status,200);
 assert.equal(accepted.headers.get('access-control-allow-origin'),'https://example.vercel.app');
});
