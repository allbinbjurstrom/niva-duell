import test from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import {createDiscovery} from '../desktop/lan.cjs';

test('LAN discovery receives and validates real UDP announcements',async t=>{
  const engine={parties:new Map(),players:new Map(),active:()=>[]};
  const discovery=createDiscovery({port:5205,engine,discoveryPort:0}),sender=dgram.createSocket('udp4');
  t.after(()=>{discovery.close();sender.close();});
  const packet={protocol:'niva-duell-lan/1',type:'announce',id:'isolated-test-peer',host:'Test-Mac',port:5205,
    parties:[{code:'ABC',host:'Testspelare',section:'ORD',players:2,max:12},{code:'A1B2C3',host:'Gammal kod',players:1},{code:'invalid-code',host:'Ogiltig',players:1}]};
  await new Promise((resolve,reject)=>{
    const until=Date.now()+3000;const timer=setInterval(()=>{
      const target=discovery.info().discoveryPort;if(target)sender.send(Buffer.from(JSON.stringify(packet)),target,'127.0.0.1');
      if(discovery.list().some(p=>p.id===packet.id)){clearInterval(timer);resolve();}
      else if(Date.now()>until){clearInterval(timer);reject(new Error('LAN-sökningen tog inte emot UDP-meddelandet.'));}
    },40);
  });
  const peer=discovery.list().find(p=>p.id===packet.id);assert.equal(peer.ip,'127.0.0.1');assert.equal(peer.parties.length,1);assert.equal(peer.parties[0].code,'ABC');assert.ok(discovery.info().port===5205);
});
