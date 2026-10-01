import {build} from 'esbuild';
import {copyFile,readFile} from 'node:fs/promises';
await build({entryPoints:['src/notifications.jsx'],outfile:'public/notifications.js',bundle:true,minify:true,format:'iife',define:{'process.env.NODE_ENV':'"production"'},legalComments:'eof',plugins:[{
 name:'sonner-external-css',setup(build){build.onLoad({filter:/sonner[\\/]dist[\\/]index\.mjs$/},async({path})=>{
  const code=await readFile(path,'utf8'),matches=code.match(/^__insertCSS\(.*\);$/gm);
  if(matches?.length!==1)throw Error('Sonner style injector changed; review the external CSS build adapter');
  return {contents:code.replace(matches[0],''),loader:'js'};
 });}
}]});
await copyFile('node_modules/sonner/dist/styles.css','public/notifications.css');
await copyFile('src/policy.mjs','public/policy.js');
await build({entryPoints:['src/icons.mjs'],outfile:'public/icons.js',bundle:true,minify:true,format:'iife',legalComments:'eof'});
await build({entryPoints:['src/charts.mjs'],outfile:'public/charts.js',bundle:true,minify:true,format:'iife',legalComments:'eof'});
