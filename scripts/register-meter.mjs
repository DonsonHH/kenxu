// Register another ordinary node after the pilot. Never prints the private token.
import {openStore} from '../src/store.mjs';
import {writeFileSync} from 'node:fs';
const [name,output]=process.argv.slice(2);
if(!process.env.DATA_DIR||!name||!output)throw Error('Set DATA_DIR; provide exact source node name and private registration output path');
const store=openStore(process.env.DATA_DIR);
try{
 const n=store.inventory().find(n=>n.name===name);if(!n)throw Error('Node not found');
 if(store.meter.nodes().some(m=>m.proxy_id===n.id))throw Error('Already registered; inspect existing registration');
 const r=store.meter.register(n.id,name);
 writeFileSync(output,JSON.stringify({node_id:r.id,token:r.token,portal_origin:process.env.PUBLIC_ORIGIN}),{mode:0o600,flag:'wx'});
 console.log('Node registered; private token written to the requested file. Enroll users through the private administrator page.');
}finally{store.close();}
