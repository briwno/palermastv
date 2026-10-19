import {readdir,readFile,writeFile} from 'node:fs/promises';
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json',png:'image/png'};
const assets={};for(const name of await readdir('site-assets')){const type=types[name.split('.').pop()];if(type)assets[name]={type,body:await readFile('site-assets/'+name,type.startsWith('image/')?'base64':'utf8'),...(type.startsWith('image/')?{base64:true}:{})};}
await writeFile('server-assets.ts','// Generated from site-assets/ by scripts/prepare-assets.mjs.\nexport const assets = '+JSON.stringify(assets)+';\n');
