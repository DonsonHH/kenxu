import net from 'node:net';
import dgram from 'node:dgram';
import {randomBytes} from 'node:crypto';
export function socksDns(){return new Promise(resolve=>{
 const tcp=net.connect(18702,'127.0.0.1'),udp=dgram.createSocket('udp4');let phase=0,buffer=Buffer.alloc(0),ended=false;
 const done=value=>{if(ended)return;ended=true;clearTimeout(timer);tcp.destroy();udp.close();resolve(value);};
 const timer=setTimeout(()=>done(false),12000);tcp.on('error',()=>done(false));udp.on('error',()=>done(false));
 const id=randomBytes(2),question=Buffer.from([7,...Buffer.from('example'),3,...Buffer.from('com'),0,0,1,0,1]);
 const dns=Buffer.concat([id,Buffer.from([1,0,0,1,0,0,0,0,0,0]),question]);
 const packet=Buffer.concat([Buffer.from([0,0,0,1,1,1,1,1,0,53]),dns]);
 udp.on('message',data=>{const offset=data[3]===1?10:data[3]===4?22:5+data[4]+2;if(data.length>offset+12&&data.subarray(offset,offset+2).equals(id)&&(data[offset+2]&128)&&(data[offset+3]&15)===0)done(true);});
 tcp.on('connect',()=>tcp.write(Buffer.from([5,1,0])));
 tcp.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);if(phase===0&&buffer.length>=2){if(buffer[0]!==5||buffer[1]!==0)return done(false);buffer=buffer.subarray(2);phase=1;tcp.write(Buffer.from([5,3,0,1,0,0,0,0,0,0]));}
  if(phase===1&&buffer.length>=10){if(buffer[1]!==0||buffer[3]!==1)return done(false);const port=buffer.readUInt16BE(8);phase=2;udp.bind(0,'127.0.0.1',()=>udp.send(packet,port,'127.0.0.1'));}
 });
});}
