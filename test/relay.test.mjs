import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {attachRelay} from '../src/relay.mjs';
test('WebSocket bridge only forwards its fixed path and strips portal secrets',async()=>{
 const backend=http.createServer(),portal=http.createServer((_q,s)=>s.end('portal'));let received;
 const remoteSockets=new Set();backend.on('upgrade',(req,socket,head)=>{remoteSockets.add(socket);socket.once('close',()=>remoteSockets.delete(socket));received=req.headers;socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: fixture\r\n\r\n');if(head.length)socket.write(head);socket.on('data',chunk=>socket.write(chunk));});
 const listen=s=>new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));await listen(backend);const closeRelay=attachRelay(portal,{port:backend.address().port});await listen(portal);
 const request=(path,data='')=>new Promise((resolve,reject)=>{const socket=net.connect(portal.address().port,'127.0.0.1');let raw='';socket.on('error',reject);socket.on('connect',()=>socket.write('GET '+path+' HTTP/1.1\r\nHost: example.test\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: fixture\r\nSec-WebSocket-Version: 13\r\nCookie: session-secret\r\nAuthorization: Bearer private-secret\r\n\r\n'+data));socket.on('data',chunk=>{raw+=chunk.toString();if(raw.includes('404')||raw.includes(data)&&raw.includes('101')){socket.destroy();resolve(raw);}});});
 try{assert.match(await request('/api/admin/state'),/404/);assert.equal(received,undefined);assert.match(await request('/relay/v1','echo-payload'),/echo-payload/);assert.equal(received.cookie,undefined);assert.equal(received.authorization,undefined);}
 finally{closeRelay();for(const socket of remoteSockets)socket.destroy();portal.closeAllConnections();backend.closeAllConnections();await Promise.all([new Promise(r=>portal.close(r)),new Promise(r=>backend.close(r))]);}
});
