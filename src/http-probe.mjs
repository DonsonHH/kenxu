// Kept at the command seam so timing can be tested without proxy credentials.
export async function measureHttp(port,{execute}={}){
 if(!Number.isInteger(port)||port<1024||port>65535||typeof execute!=='function')throw Error('Invalid HTTP probe setup');
 for(const [target,url,status]of [['gstatic-204','https://www.gstatic.com/generate_204',204],['cloudflare-trace','https://www.cloudflare.com/cdn-cgi/trace',200]]){
  const result=await execute('curl',['--disable','--silent','--max-time','10','--socks5-hostname','127.0.0.1:'+port,'--output','/dev/null','--write-out','%{http_code} %{time_pretransfer} %{time_starttransfer} %{time_total}',url],12000);
  if(result.code!==0||typeof result.output!=='string')continue;
  const parts=result.output.trim().split(/\s+/);if(parts.length!==4||parts.some(value=>!/^\d+(?:\.\d+)?$/.test(value)))continue;
  const [code,setup,firstByte,total]=parts.map(Number);if(code!==status||![setup,firstByte,total].every(Number.isFinite)||firstByte<setup||total<firstByte||total>180)continue;
  return {status:'normal',latency:Math.round((firstByte-setup)*1000),setupMs:Math.round(setup*1000),totalMs:Math.round(total*1000),metric:'http-response-v2',target};
 }
 return {status:'failed',latency:null};
}
