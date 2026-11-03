import {VANDAL_PROFILE,recoverVandalRecoil,vandalRecoilDegrees} from './vandal-profile.mjs';

const radians=Math.PI/180;
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const serialOf=value=>Number.isSafeInteger(value)&&value>=0?value:0;
const timeoutMs=350,historyMs=2000,maxHistory=256;

/**
 * Presentation only. Never copy this output into input.yaw/input.pitch or use it
 * for a bullet ray. The server owns shot results and every yaw direction change.
 *
 * Riot describes immediate local shot feedback with server-authoritative results:
 * https://playvalorant.com/en-gb/news/dev/the-state-of-hit-registration/
 * The profile mapping, .35 hip camera factor and .375 s recovery are calibrations.
 *
 * `serial` counts accepted own volleys monotonically within `epoch`; unlike
 * shotCount, it MUST NOT reset on recoil recovery. A snapshot supplies server
 * Date.now() values `at`/`lastShot`, plus `localNow` from performance.now().
 * Events use the same serial. sync and acknowledge may run in either order.
 * New rounds/motion epochs use reset with a distinct key. Weapon changes instead
 * use resetWeapon: clear presentation while preserving receipts for late events.
 * Without an echoed client shot identity, matching mixed accepted/rejected local
 * attempts is FIFO with a timestamp hint for expired records, not exact under
 * arbitrary delay. This uncertainty affects cosmetics for at most timeoutMs.
 */
export function createVandalRecoilPresenter(){
  let epoch=null,nextId=0,records=[],history=new Map(),seen=new Set(),visualFloorSerial=-1;
  let base=emptyBase();

  function emptyBase(){
    return {serial:0,serverAt:-Infinity,localAt:0,lastShotAt:-1000,shotCount:0,pitch:0,yaw:0};
  }

  function reset(nextEpoch){
    epoch=nextEpoch;records=[];history.clear();seen.clear();base=emptyBase();visualFloorSerial=-1;
  }

  /** Clear weapon visuals, retaining identities of feedback already presented. */
  function resetWeapon(localNow=base.localAt){
    const now=finite(localNow,base.localAt);prune(now);
    for(const record of records)record.suppressed=true;
    for(const receipt of history.values())receipt.suppressed=true;
    visualFloorSerial=base.serial;
    base={...base,localAt:now,lastShotAt:now-VANDAL_PROFILE.recoverySeconds*1000,shotCount:0,pitch:0,yaw:0};
  }

  function prune(now){
    // Expired records remain as brief matching tombstones. A late confirmation
    // must neither replay their sound nor accidentally consume a newer shot.
    for(const record of records)if(record.serial===null&&now-record.at>=timeoutMs)record.expired=true;
    records=records.filter(record=>now-record.at<=historyMs);
    if(records.length>maxHistory)records=records.slice(-maxHistory);
    if(history.size>maxHistory)for(const key of [...history.keys()].sort((a,b)=>a-b).slice(0,history.size-maxHistory))history.delete(key);
    if(seen.size>maxHistory)for(const key of [...seen].sort((a,b)=>a-b).slice(0,seen.size-maxHistory))seen.delete(key);
  }

  /** Returns a local-only ID; it is never a spread seed or server shot command. */
  function predictShot({at,aim=false,ads=aim,crouch=false,running=false}){
    const now=finite(at);prune(now);
    const record={id:++nextId,at:now,ads:!!ads,crouch:!!crouch,running:!!running,serial:null,expired:false,suppressed:false};
    records.push(record);
    return record.id;
  }

  /** Cancel a locally known rejection; no camera/input ownership is involved. */
  function reject(predictionId){
    const index=records.findIndex(record=>record.id===predictionId&&record.serial===null);
    if(index<0)return false;
    records.splice(index,1);return true;
  }

  function remember(serial,record){
    const receipt={predictionId:record?.id??null,predicted:!!record,at:record?.at??null,suppressed:record?.suppressed??false,expired:record?.expired??false};
    history.set(serial,receipt);return receipt;
  }

  function receiptResult(first,receipt){
    return {first,predicted:receipt?.predicted??false,predictionId:receipt?.predictionId??null};
  }

  /**
   * Replace the authoritative base and retire exactly the covered volley serials.
   * Calling again for the same serial updates recovery without consuming a shot.
   * Snapshots must arrive in epoch order (as on the current WebSocket transport).
   */
  function sync(snapshot,localNow){
    const now=finite(localNow),serial=serialOf(snapshot.serial),at=finite(snapshot.at);
    if(snapshot.epoch!==epoch)reset(snapshot.epoch);
    prune(now);
    if(serial<base.serial||at<base.serverAt)return false;

    const lastShot=finite(snapshot.lastShot,at-VANDAL_PROFILE.recoverySeconds*1000);
    const age=Math.max(0,at-lastShot),lastShotAt=now-age;
    const previous=base.serial;
    // Usually delta is 0 or 1. Bound work even after a long disconnected period.
    const start=Math.max(previous+1,serial-maxHistory+1);
    if(start>previous+1){
      const skipped=start-previous-1;
      let remaining=skipped;
      records=records.filter(record=>{
        if(record.serial!==null)return record.serial>=start;
        if(remaining>0){remaining--;return false;}
        return true;
      });
    }
    for(let accepted=start;accepted<=serial;accepted++){
      const receipt=history.get(accepted);
      let record=receipt?records.find(item=>item.id===receipt.predictionId):records.find(item=>item.serial===accepted)??records.find(item=>item.serial===null&&item.at<=now);
      if(!receipt&&accepted===serial&&record?.expired){
        // Serial is a count, not an echoed client shot identity. If an old local
        // shot timed out and the server reports a much newer shot, avoid binding
        // that new acceptance to the old tombstone. The timestamp is approximate
        // under latency, so ordinary live predictions still use stable FIFO.
        const closest=records.filter(item=>item.serial===null&&item.at<=now).reduce((best,item)=>Math.abs(item.at-lastShotAt)<Math.abs(best.at-lastShotAt)?item:best,record);
        if(closest!==record){
          records=records.filter(item=>!(item.expired&&item.serial===null&&item.id<closest.id));
          record=closest;
        }
      }
      if(!receipt)remember(accepted,record);
      if(record)records=records.filter(item=>item.id!==record.id);
    }
    // A snapshot's offsets were evaluated when it was generated, not when it
    // arrived. A matched prediction supplies the known local shot time even
    // after its record was retired. Age the supplied offset by the missing
    // interval instead of turning an old .28-degree tap back into .40 degrees.
    const receipt=history.get(serial),localAge=receipt?.at!==null&&receipt?.at!==undefined?Math.max(0,now-receipt.at):age;
    const displayAge=Math.max(age,localAge);
    const aged=recoverVandalRecoil(Math.max(0,finite(snapshot.recoilPitch)),finite(snapshot.recoilYaw),displayAge/1000,(displayAge-age)/1000);
    const suppressed=serial<=visualFloorSerial||receipt?.suppressed===true;
    const noVisual=suppressed||receipt?.expired===true;
    base={serial,serverAt:at,localAt:now,lastShotAt:now-displayAge,
      shotCount:suppressed||aged.recovered?0:serialOf(snapshot.shotCount),pitch:noVisual?0:aged.pitch,yaw:noVisual?0:aged.yaw};
    prune(now);return true;
  }

  /** One receipt per actual volley, even if its event contains multiple pellets. */
  function acknowledge({epoch:eventEpoch,serial:rawSerial},localNow){
    const serial=serialOf(rawSerial),now=finite(localNow);
    if(eventEpoch!==epoch||serial===0)return receiptResult(false);
    prune(now);
    if(seen.has(serial))return receiptResult(false,history.get(serial));
    seen.add(serial);
    let receipt=history.get(serial);
    if(!receipt){
      // A serial already covered by a snapshot can never consume a new prediction.
      const record=serial>base.serial?records.find(item=>item.serial===null&&item.at<=now):null;
      if(record)record.serial=serial;
      receipt=remember(serial,record);
    }
    prune(now);return receiptResult(true,receipt);
  }

  /** Radians: raw weapon offsets and separately scaled camera offsets. */
  function sample({now:rawNow,ads=false}){
    const now=finite(rawNow);prune(now);
    const elapsed=Math.max(0,(now-base.localAt)/1000);
    const recovery=recoverVandalRecoil(base.pitch,base.yaw,Math.max(0,(now-base.lastShotAt)/1000),elapsed);
    const active=records.filter(record=>!record.expired&&!record.suppressed);
    let pitch=recovery.pitch,yaw=recovery.yaw,count=recovery.recovered?0:base.shotCount;
    if(active.length){
      count=base.shotCount;
      let lastShotAt=base.lastShotAt;
      for(const record of active){
        if(record.at-lastShotAt>=VANDAL_PROFILE.recoverySeconds*1000)count=0;
        count++;
        pitch=vandalRecoilDegrees(count,record).pitch*radians;
        lastShotAt=record.at;
      }
      const idle=Math.max(0,(now-lastShotAt)/1000);
      const predictedRecovery=recoverVandalRecoil(pitch,0,idle,idle);
      pitch=predictedRecovery.pitch;if(predictedRecovery.recovered)count=0;
      // Hold/recover the last server yaw during local firing, but never create
      // a yaw step, choose a side or expose a client-controlled random value.
      const yawIdle=Math.max(0,(now-Math.max(base.lastShotAt,lastShotAt))/1000);
      yaw=recoverVandalRecoil(0,base.yaw,yawIdle,elapsed).yaw;
    }
    const cameraFactor=ads?1:VANDAL_PROFILE.hipCameraFactor;
    return {pitch,yaw,cameraPitch:pitch*cameraFactor,cameraYaw:yaw*cameraFactor,shotCount:count,
      pending:active.filter(record=>record.serial===null).length};
  }

  return {reset,resetWeapon,predictShot,reject,sync,acknowledge,sample};
}
