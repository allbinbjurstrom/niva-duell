import * as THREE from 'three';
import {DEMO_WALL} from '../shared/training-layout.mjs';

const palette={paper:'#e7dcc1',ink:'#28444b',teal:'#507b78',grid:'#b9ae91',orange:'#bb7151'};

/** Flat, original range markings. The existing arena wall remains the only solid. */
export function buildTrainingRange(scene:THREE.Scene){
  const group=new THREE.Group();group.name='vandal-training-range';group.visible=false;
  const wallDrill=new THREE.Group(),targetDrill=new THREE.Group();
  wallDrill.name='wall-drill';targetDrill.name='target-drill';wallDrill.visible=false;group.add(wallDrill,targetDrill);
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  const basic=(parameters:THREE.MeshBasicMaterialParameters)=>{
    const material=new THREE.MeshBasicMaterial({toneMapped:false,...parameters});materials.add(material);return material;
  };
  const plane=(parent:THREE.Group,name:string,width:number,height:number,material:THREE.Material)=>{
    const geometry=new THREE.PlaneGeometry(width,height);geometries.add(geometry);
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;
    // Decoration never participates in gameplay or incidental Three.js raycasts.
    mesh.raycast=()=>{};mesh.userData.decorative=true;parent.add(mesh);return mesh;
  };
  const texture=(width:number,height:number,paint:(context:CanvasRenderingContext2D)=>void)=>{
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d');
    if(!context)throw new Error('Kunde inte rita träningsbanans markeringar.');
    paint(context);
    const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;textures.add(map);return map;
  };
  const floor=(parent:THREE.Group,name:string,width:number,depth:number,x:number,z:number,material:THREE.Material)=>{
    const mesh=plane(parent,name,width,depth,material);
    // Local text-right is world +Z; text-top points toward the target wall (+X).
    mesh.rotation.set(-Math.PI/2,0,-Math.PI/2);mesh.position.set(x,.035,z);return mesh;
  };
  const floorLabel=(parent:THREE.Group,name:string,main:string,detail:string,x:number,z:number,width=3.5)=>{
    const map=texture(896,256,c=>{
      c.fillStyle=palette.ink;c.textAlign='center';c.textBaseline='middle';
      c.font='bold 82px sans-serif';c.fillText(main,448,86);
      c.font='40px sans-serif';c.fillText(detail,448,177);
    });
    return floor(parent,name,width,1,x,z,basic({map,transparent:true,depthWrite:false}));
  };

  const targetMap=texture(1536,768,c=>{
    c.fillStyle=palette.paper;c.fillRect(0,0,1536,768);
    // One grid interval represents 0.5 m on the 6 x 3 m wall plane.
    c.strokeStyle=palette.grid;c.lineWidth=2;c.beginPath();
    for(let x=0;x<=1536;x+=128){c.moveTo(x,0);c.lineTo(x,768);}
    for(let y=0;y<=768;y+=128){c.moveTo(0,y);c.lineTo(1536,y);}
    c.stroke();
    c.strokeStyle=palette.teal;c.lineWidth=4;
    for(const radius of [64,128,192]){c.beginPath();c.arc(768,384,radius,0,Math.PI*2);c.stroke();}
    c.beginPath();c.moveTo(744,384);c.lineTo(792,384);c.moveTo(768,360);c.lineTo(768,408);c.stroke();
    c.fillStyle=palette.orange;c.beginPath();c.arc(768,384,5,0,Math.PI*2);c.fill();
    c.strokeStyle=palette.ink;c.lineWidth=12;c.strokeRect(7,7,1522,754);
    c.fillStyle=palette.paper;c.fillRect(28,25,1480,90);c.fillRect(28,665,1480,76);
    c.fillStyle=palette.ink;c.textAlign='left';c.textBaseline='middle';c.font='bold 48px sans-serif';
    c.fillText('NIVÅ / VANDAL',58,71);
    c.textAlign='right';c.font='34px sans-serif';c.fillText('TAP · BURST · SPRAY',1478,71);
    c.textAlign='left';c.font='36px sans-serif';c.fillText(`${DEMO_WALL.distance} m från startlinjen`,58,703);
    c.textAlign='right';c.font='32px sans-serif';c.fillText('RUTNÄT 0,5 m',1478,703);
  });
  const target=plane(wallDrill,'stationary-spray-target',DEMO_WALL.width,DEMO_WALL.height,basic({map:targetMap}));
  // The east wall's interior is x=24. Authoritative impacts at x=23.994
  // remain in front of this surface; nothing here adds a new collision face.
  target.position.set(DEMO_WALL.x-.002,DEMO_WALL.bottom+DEMO_WALL.height/2,DEMO_WALL.z);target.rotation.y=-Math.PI/2;

  const teal=basic({color:palette.teal}),orange=basic({color:palette.orange});
  floor(wallDrill,'start-line',DEMO_WALL.width,.075,DEMO_WALL.spawn.x,DEMO_WALL.z,teal);
  floorLabel(wallDrill,'start-line-label','SPRAY / STARTLINJE',`${DEMO_WALL.distance} m till väggen härifrån`,DEMO_WALL.spawn.x-.8,DEMO_WALL.z,4.2);
  floor(targetDrill,'target-start-line',4,.075,-4,-9,teal);
  floorLabel(targetDrill,'target-start-label','MÅL / STARTLINJE','8 m till målets grundlinje',-4.8,-9,3.4);
  floor(targetDrill,'bot-eight-metre-line',2.8,.055,4,-9,orange);
  floorLabel(targetDrill,'bot-distance-label','MÅL 8 m','från startlinjen',4,-11.7,2.5);

  // Quiet side ticks make the measured lane readable without putting a
  // solid-looking rail or a bright guide through the bot and spray pattern.
  for(let distance=0;distance<=DEMO_WALL.distance;distance+=2){
    const x=DEMO_WALL.spawn.x+distance,z=DEMO_WALL.z-DEMO_WALL.width/2-.45;
    floor(wallDrill,`distance-tick-${distance}`,distance%10===0?.32:.18,.035,x,z,teal);
    if(distance<DEMO_WALL.distance)floor(wallDrill,`distance-dash-${distance}`,.025,.8,x+.65,z,teal);
  }

  scene.add(group);
  let disposed=false;
  return {group,setMode(mode:'target'|'wall'){
    wallDrill.visible=mode==='wall';targetDrill.visible=mode==='target';
  },dispose(){
    if(disposed)return;disposed=true;
    group.removeFromParent();group.clear();
    for(const geometry of geometries)geometry.dispose();
    for(const material of materials)material.dispose();
    for(const map of textures)map.dispose();
  }};
}
