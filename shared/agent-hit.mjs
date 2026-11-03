import {agentPartsForBody} from './agent-pose.mjs';

const epsilon=1e-10;

function partDistance(origin,direction,part){
  let near=0,far=Infinity;
  for(let axis=0;axis<3;axis++){
    const half=part.size[axis]/2,min=part.position[axis]-half,max=part.position[axis]+half;
    if(Math.abs(direction[axis])<epsilon){
      // Only absorb floating-point rotation error at an exact visible edge.
      if(origin[axis]<min-epsilon||origin[axis]>max+epsilon)return Infinity;
      continue;
    }
    const a=(min-origin[axis])/direction[axis],b=(max-origin[axis])/direction[axis];
    near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
    if(near>far+epsilon)return Infinity;
  }
  return near;
}

/**
 * Hits exactly the visible boxes returned by agentPartsForBody, including the
 * shared gait pose, in body-local yaw space.
 * This is our prototype geometry, not a measured or reconstructed Riot hitbox.
 *
 * `dir` is a unit vector, as in the authoritative bullet caller. Translating the
 * origin and rigidly rotating both origin and full 3D direction preserve its
 * ray parameter in metres; never normalize just the horizontal direction.
 * World cover/occlusion remains the caller's separate wallDistance check.
 */
export function hitAgent(origin,dir,body,rules){
  if(!origin||!dir||!body)return {distance:Infinity,zone:0};
  for(let axis=0;axis<3;axis++)if(!Number.isFinite(origin[axis])||!Number.isFinite(dir[axis]))return {distance:Infinity,zone:0};
  if(!Number.isFinite(body.x)||!Number.isFinite(body.y)||!Number.isFinite(body.z)||Math.hypot(...dir)===0)return {distance:Infinity,zone:0};
  const yaw=Number.isFinite(body.yaw)?body.yaw:0,c=Math.cos(yaw),s=Math.sin(yaw);
  const dx=origin[0]-body.x,dy=origin[1]-body.y,dz=origin[2]-body.z;
  // Inverse of the same positive Y rotation used by the rendered agent group.
  const localOrigin=[c*dx-s*dz,dy,s*dx+c*dz];
  const localDirection=[c*dir[0]-s*dir[2],dir[1],s*dir[0]+c*dir[2]];
  let distance=Infinity,zone=0;
  for(const part of agentPartsForBody(body,rules)){
    const candidate=partDistance(localOrigin,localDirection,part);
    // Shared visible boundaries use a deterministic head/body/leg tie order.
    if(candidate<distance||(candidate===distance&&part.zone<zone)){distance=candidate;zone=part.zone;}
  }
  return {distance,zone};
}
