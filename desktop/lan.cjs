const dgram=require('node:dgram');
const os=require('node:os');
const {randomUUID}=require('node:crypto');
const {isIP}=require('node:net');
const PROTOCOL='niva-duell-lan/1',PORT=5206,GROUP='239.255.43.21';
function privateIPv4(ip){
  if(isIP(ip)!==4)return false;const [a,b]=ip.split('.').map(Number);
  return a===10||a===127||a===192&&b===168||a===172&&b>=16&&b<=31||a===169&&b===254;
}
function createDiscovery({port,engine,onChange=()=>{},discoveryPort=PORT}){
  const id=randomUUID(),peers=new Map(),socket=dgram.createSocket({type:'udp4',reuseAddr:true});let ready=false,closed=false,boundPort=discoveryPort;
  const addresses=()=>Object.values(os.networkInterfaces()).flat().filter(a=>a?.family==='IPv4'&&!a.internal&&privateIPv4(a.address));
  const own=()=>({protocol:PROTOCOL,type:'announce',id,host:os.hostname().replace(/\.local$/,''),port,
    parties:[...engine.parties.values()].filter(p=>!p.testMode&&['lobby','finished'].includes(p.phase)).map(p=>({code:p.code,host:engine.players.get(p.hostId)?.name??'Värd',section:p.section,players:engine.active(p).length,max:12}))});
  const send=(message,address=GROUP,targetPort=boundPort)=>{if(!ready||closed)return;const buffer=Buffer.from(JSON.stringify(message));socket.send(buffer,targetPort,address,()=>{});};
  const scan=()=>{
    send({protocol:PROTOCOL,type:'discover',id});send(own());
    for(const a of addresses()){
      const ip=a.address.split('.').map(Number),mask=a.netmask.split('.').map(Number),broadcast=ip.map((n,i)=>n|(~mask[i]&255)).join('.');
      send({protocol:PROTOCOL,type:'discover',id},broadcast);
    }
    for(const [key,value] of peers)if(Date.now()-value.seen>10_000)peers.delete(key);
    onChange();
  };
  socket.on('error',()=>{});
  socket.on('message',(buffer,remote)=>{
    if(buffer.length>8192||!privateIPv4(remote.address))return;
    try{
      const value=JSON.parse(buffer.toString());if(value.protocol!==PROTOCOL||value.id===id||typeof value.id!=='string')return;
      if(value.type==='discover'){send(own(),remote.address,remote.port);return;}
      if(value.type!=='announce'||!Number.isInteger(value.port)||value.port<1024||value.port>65535||!Array.isArray(value.parties))return;
      const parties=value.parties.slice(0,32).filter(p=>/^[A-Z]{3}$/.test(p.code)&&typeof p.host==='string'&&Number.isInteger(p.players)&&p.players>=0&&p.players<=12).map(p=>({code:p.code,host:p.host.slice(0,24),section:String(p.section).slice(0,8),players:p.players,max:12}));
      if(peers.size>=64&&!peers.has(value.id))peers.delete(peers.keys().next().value);
      peers.set(value.id,{id:value.id,ip:remote.address,port:value.port,host:String(value.host??'Mac').slice(0,60),parties,seen:Date.now()});onChange();
    }catch{}
  });
  socket.bind(discoveryPort,'0.0.0.0',()=>{boundPort=socket.address().port;ready=true;try{socket.setBroadcast(true);socket.setMulticastTTL(1);socket.addMembership(GROUP);}catch{}scan();});
  const timer=setInterval(scan,3000);timer.unref();
  return {list:()=>[...peers.values()].map(({seen,...peer})=>peer),info:()=>({port,discoveryPort:boundPort,addresses:addresses().map(a=>a.address)}),scan,
    close(){if(closed)return;closed=true;clearInterval(timer);try{socket.close();}catch{}}};
}
module.exports={createDiscovery,privateIPv4};
