import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const configuration=fileURLToPath(new URL('./admin-ssh.config',import.meta.url));
const portArgument=process.argv.indexOf('--port'),port=portArgument<0?4451:Number(process.argv[portArgument+1]);
const connectOnly=process.argv.includes('--connect-only'),address='http://127.0.0.1:'+port;
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local forwarding port');
if(process.argv.includes('--check')){
 const options=execFileSync('ssh.exe',['-G','-F',configuration,'kenxu-admin'],{encoding:'utf8',windowsHide:true});
 if(!options.includes('batchmode yes')||!options.includes('identitiesonly yes'))throw Error('Private SSH configuration is invalid');
 console.log('PASS: dedicated private forwarding configuration');
}else{
 const ready=async()=>{try{const r=await fetch(address+'/api/interface',{signal:AbortSignal.timeout(1500)});return r.ok&&(await r.json()).adminInterface===true;}catch{return false;}};
 let tunnel;
 try{
  if(!await ready()){
   tunnel=spawn('ssh.exe',['-N','-T','-F',configuration,'-L',`127.0.0.1:${port}:127.0.0.1:4451`,'kenxu-admin'],{detached:true,windowsHide:true,stdio:'ignore'});
   const deadline=Date.now()+30000;while(!await ready()&&Date.now()<deadline&&tunnel.exitCode===null)await new Promise(r=>setTimeout(r,300));
   if(!await ready())throw Error('Private administration is unreachable. Check Tailscale and the dedicated forwarding key.');
   tunnel.unref();
  }
  if(connectOnly)console.log(JSON.stringify({ready:true,port,helperPid:tunnel?.pid||null}));
  else spawn(path.join(process.env.SystemRoot,'System32','rundll32.exe'),['url.dll,FileProtocolHandler',address],{detached:true,windowsHide:true,stdio:'ignore'}).unref();
 }catch(err){tunnel?.kill();if(connectOnly)throw err;execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Add-Type -AssemblyName PresentationFramework; [Windows.MessageBox]::Show('Private administration is unreachable. Check Tailscale and the forwarding key.','Kenxu Control') | Out-Null"],{windowsHide:true,stdio:'ignore'});process.exitCode=1;}
}
