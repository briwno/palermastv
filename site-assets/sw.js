// Never cache private pages, API responses, room tickets or media.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.mode!=='navigate')return;
 event.respondWith(fetch(event.request).catch(()=>new Response('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PalermasTV · Sem conexão</title><body style="background:#0c1729;color:#f4e8cc;font:18px system-ui;display:grid;place-items:center;min-height:90vh"><main><h1>PalermasTV</h1><p>Sem conexão no momento.</p><p>Volte à internet e abra o site novamente.</p><button onclick="location.reload()">Tentar novamente</button></main></body></html>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));
});
