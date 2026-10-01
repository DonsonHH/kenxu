const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:0;
export function mergeDaily(users){
 const days=new Map();for(const u of users)for(const r of u.daily||[]){const d=days.get(r.date)||{date:r.date,up:0,down:0};d.up+=finite(r.up);d.down+=finite(r.down);days.set(r.date,d);}
 return [...days.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function routeRanking(users,nodes){return nodes.map(n=>{const amount=users.reduce((a,u)=>{const r=u.routes.find(r=>r.meterId===n.id);return {up:a.up+finite(r?.month.up),down:a.down+finite(r?.month.down)};},{up:0,down:0});return {name:n.name,...amount};}).sort((a,b)=>b.up+b.down-a.up-a.down);}
export function statusCounts(nodes){const counts={normal:0,failed:0,unknown:0};for(const n of nodes)counts[n.status==='normal'?'normal':n.status==='failed'?'failed':'unknown']++;return counts;}
