// ESPN's formationPlace is a role identifier, not a sequential row index.
export function tacticalLines(lineup){
 const formation=String(lineup.formation||'').split('-').map(Number),players=lineup.players.filter(p=>p.starter);
 if(!formation.length||formation.some(n=>!Number.isInteger(n)||n<1||n>5)||formation.reduce((a,b)=>a+b,0)!==10||players.length!==11||players.some(p=>!p.positionCode))return null;
 const keepers=players.filter(p=>/goalkeeper/i.test(p.positionCode));if(keepers.length!==1)return null;
 const depth=p=>{const pos=p.positionCode.toLowerCase();return /defender|back/.test(pos)?1:/defensive/.test(pos)?2:/attacking|center.*forward/.test(pos)?4:/forward|striker|winger/.test(pos)?5:/midfielder/.test(pos)?3:4;};
 const horizontal=p=>{const pos=p.positionCode.toLowerCase();return pos.includes('left')?(pos.includes('center')?-1:-2):pos.includes('right')?(pos.includes('center')?1:2):0;};
 const ordered=players.filter(p=>p!==keepers[0]).sort((a,b)=>depth(a)-depth(b)||horizontal(a)-horizontal(b));let offset=0;
 return [keepers,...formation.map(count=>{const row=ordered.slice(offset,offset+count).sort((a,b)=>horizontal(a)-horizontal(b));offset+=count;return row})];
}
