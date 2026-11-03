import test from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import {once} from 'node:events';
import {createDiscovery} from '../desktop/lan.cjs';
import {ShooterEngine} from '../server/engine.mjs';

test('a completed solo test is never advertised as a joinable LAN party',async t=>{
  const engine=new ShooterEngine({sections:[{id:'ORD'}]});
  const solo=engine.createTest();engine.parties.get(solo.code).phase='finished';
  const normal=engine.create('Vanlig värd','ORD');
  const discovery=createDiscovery({port:5205,engine,discoveryPort:0}),client=dgram.createSocket('udp4');
  t.after(()=>{discovery.close();client.close();});client.bind(0,'127.0.0.1');await once(client,'listening');
  const announcement=await new Promise((resolve,reject)=>{
    const deadline=Date.now()+3000;
    const timer=setInterval(()=>{const port=discovery.info().discoveryPort;
      if(port)client.send(Buffer.from(JSON.stringify({protocol:'niva-duell-lan/1',type:'discover',id:'solo-privacy-probe'})),port,'127.0.0.1');
      if(Date.now()>deadline){clearInterval(timer);reject(Error('No LAN announcement'));}
    },40);
    client.on('message',raw=>{const data=JSON.parse(raw);if(data.type==='announce'){clearInterval(timer);resolve(data);}});
  });
  assert.deepEqual(announcement.parties.map(p=>p.code),[normal.code]);
});
