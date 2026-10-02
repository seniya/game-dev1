import type { WorldState, NPC, Position } from './types';
import { clamp, distance, random } from './random';
import { findPath, walkable } from './pathfinding';
import { household, neighbours, person } from './spatial';
import { stocks, isTravelling } from './civilization';
import { appendEvent, socialEvent, changeRelationship, eventById } from './social';
import { reserve, release, available, advanceActivity, reserved } from './village-actions';
import { villagePerson } from './development';
import { contactConflict } from './conflicts';
import { injure } from './care';

export function safePlayPlace(w:WorldState,n:NPC):Position|undefined {
  const home=w.buildings.find(b=>b.id===n.homeId)!;
  const radius=n.identity.age<7?6:n.identity.age<13?12:18;
  const options:Position[]=[];
  // Nearby home yards keep destinations understandable; never send children to an industrial site.
  for(const b of w.buildings.filter(b=>b.kind==='home'&&b.settlementId===n.settlementId))for(const [dx,dy] of [[0,1],[1,0],[0,-1],[-1,0]]){
    const p={x:b.position.x+dx,y:b.position.y+dy};
    if(!walkable(w,p)||w.tiles[p.y*w.width+p.x]!=='grass'||w.buildings.some(x=>distance(x.position,p)===0))continue;
    if([[0,1],[1,0],[0,-1],[-1,0]].some(([x,y])=>w.tiles[(p.y+y)*w.width+p.x+x]==='water'))continue;
    if(w.construction?.projects.some(x=>distance(x.position,p)<=2&&!x.buildingId))continue;
    const path=findPath(w,home.position,p);if(path&&path.length>0&&path.length<=radius)options.push(p);
  }
  // Favor a reachable occupied play yard, but retain solo play.
  options.sort((a,b)=>neighbours(w,{...n,position:b},1).filter(p=>p.identity.age>=4&&p.identity.age<18).length-neighbours(w,{...n,position:a},1).filter(p=>p.identity.age>=4&&p.identity.age<18).length||distance(a,home.position)-distance(b,home.position)||a.y-b.y||a.x-b.x);
  return options[0];
}
function mealAtHome(w:WorldState,n:NPC) {
  const home=w.buildings.find(b=>b.id===n.homeId)!;if(distance(n.position,home.position)!==0)return;
  const caregivers=household(w,n.homeId).filter(p=>p.alive&&p.identity.age>=18&&!isTravelling(w,p));
  if(!caregivers.length){n.decision={reason:'함께 살 보호 가정과 도움을 기다립니다.',candidates:[],tick:w.tick};return;}
  n.needs.thirst=clamp(n.needs.thirst-2);n.needs.fatigue=clamp(n.needs.fatigue-2);n.needs.social=clamp(n.needs.social+.3);
  if(n.needs.hunger>38){const donor=caregivers.find(p=>distance(p.position,n.position)<=1&&p.inventory.food>1);const stock=stocks(w,n.settlementId);const inventory=n.inventory.food>0?n.inventory:donor?.inventory??stock;
    if(inventory.food>0){inventory.food--;w.economy.totals.consumedFood++;n.needs.hunger=clamp(n.needs.hunger-38);appendEvent(w,{kind:'consumption',actorId:n.id,targetId:donor?.id,importance:30,description:`${n.identity.name}이 집에서 식량 1개를 먹었다.`,data:{amount:1,resource:'food',source:inventory===stock?'household-ration':'carried-food'}});}}
}
function returnHome(w:WorldState,n:NPC,source:string,guardian?:NPC) {
  const home=w.buildings.find(b=>b.id===n.homeId)!;
  if(guardian?.alive&&!isTravelling(w,guardian))reserve(w,guardian,'return',home.position,`${n.identity.name}과 함께 집으로 돌아갑니다.`,{source,partner:n.id,duration:72});
  if(!reserve(w,n,'return',home.position,'놀이를 마치고 식사와 휴식을 위해 집으로 돌아갑니다.',{source,guardian:guardian?.id,duration:72})){
    const e=appendEvent(w,{kind:'family',actorId:n.id,causeId:source,importance:45,description:`${n.identity.name}이 귀가 길이 막혀 현장에서 도움을 요청했다.`,data:{villageLife:true,phase:'help',episodeId:source}});
    villagePerson(w,n).helpSource=e.id;reserve(w,n,'return',n.position,'귀가 길이 막혀 도움을 기다립니다.',{source:e.id,guardian:guardian?.id,duration:72});w.villageLife!.activities[n.id].target={...home.position};
  }
}
export function childhoodTick(w:WorldState) {
  const s=w.villageLife;if(!s)return;
  // Guardians act first. Children may only follow the physically present guardian.
  for(const [id,a] of Object.entries(s.activities)) {
    const n=person(w,id);if(!n?.alive){delete s.activities[id];continue;}
    if(n.identity.age<18||!['escort','supervise','return'].includes(a.kind))continue;
    const child=person(w,a.partner);
    if(isTravelling(w,n)||!child?.alive||isTravelling(w,child)){release(w,n);continue;}
    if(a.kind==='escort'||a.kind==='return'){
      if(distance(n.position,child.position)<=1||a.kind==='escort'&&distance(n.position,a.target)>0){if(advanceActivity(w,n)&&a.kind==='escort'){a.kind='supervise';a.reason=`${child.identity.name}이 노는 곳에서 지켜봅니다.`;}else if(distance(n.position,a.target)===0&&distance(child.position,a.target)===0)release(w,n);}
    }else if(a.kind==='supervise'){
      if(w.tick>a.until||n.needs.hunger>70||n.needs.thirst>75||n.needs.fatigue>75||!s.activities[child.id])returnHome(w,child,a.source,n);
      else {n.needs.fatigue=clamp(n.needs.fatigue-.25);s.stats.careTicks++;}
    }
  }
  for(const n of w.npcs) {
    if(!n.alive||n.identity.age>=18||isTravelling(w,n))continue;
    delete n.currentAction;
    const memory=villagePerson(w,n),home=w.buildings.find(b=>b.id===n.homeId)!;
    mealAtHome(w,n);
    if(s.conflicts.some(c=>c.a===n.id||c.b===n.id))continue;
    let a=s.activities[n.id];
    if(a?.kind==='recover'){
      if(n.needs.thirst>55||n.needs.hunger>60){const guardian=neighbours(w,n,6).find(p=>p.alive&&p.identity.age>=18&&available(w,p));returnHome(w,n,a.source,guardian);}continue;
    }
    if(a?.kind==='play'){
      const guardian=person(w,a.guardian),night=w.tick%144<36||w.tick%144>112;
      const pathHome=findPath(w,n.position,home.position);
      if(n.identity.age<4||night||w.weather==='rain'||w.weather==='drought'||n.needs.hunger>65||n.needs.thirst>65||n.needs.fatigue>65||w.urban.citizens[n.id].injury>0||w.tick>=a.until||w.tick%144+(pathHome?.length??144)>118||(n.identity.age<7&&(!guardian?.alive||isTravelling(w,guardian)||!['escort','supervise'].includes(s.activities[guardian.id]?.kind??'')))){
        returnHome(w,n,a.source,guardian);continue;
      }
      if(n.identity.age<7&&guardian&&(distance(guardian.position,n.position)>1 || a.path.length>0&&distance(guardian.position,a.path[0])>1))continue;
      if(!advanceActivity(w,n))continue;
      if(n.identity.age<7&&(!guardian||distance(guardian.position,n.position)>1))continue;
      n.needs.social=clamp(n.needs.social+.8);n.needs.fatigue=clamp(n.needs.fatigue+.1);
      if(a.progress<12)continue;
      const peers=neighbours(w,n,1).filter(p=>p.id!==n.id&&p.alive&&p.identity.age>=4&&p.identity.age<18&&s.activities[p.id]?.kind==='play'&&!s.activities[p.id].path.length).slice(0,3);
      const first=!memory.lastPlay;
      const e=socialEvent(w,{kind:'gathering',actorId:n.id,participants:[n.id,...peers.map(p=>p.id)],causeId:a.source,importance:first?55:35,description:`${n.identity.name}이 ${peers.length?peers.map(p=>p.identity.name).join(', ')+'과 함께':'마당에서 혼자'} ${n.identity.age>=13?'취미와 놀이 시간을 보냈다':'밖에서 즐겁게 놀았다'}.`,data:{villageLife:true,phase:'played',episodeId:a.source,first}});
      memory.lastPlay=e.id;s.stats.plays++;memory.nextPlay=w.tick+72;
      for(const p of peers){changeRelationship(w,n,p.id,{familiarity:2,affection:2},e,'같은 마당에서 함께 논 친구다.');changeRelationship(w,p,n.id,{familiarity:2,affection:1},e,'함께 놀며 조금 더 친해졌다.');}
      returnHome(w,n,e.id,guardian);
      // A disagreement may occur only after actual shared play, with both free to react.
      if(peers[0]&&random(w)<.12){release(w,n);release(w,peers[0]);contactConflict(w,n,peers[0],e,true);if(!reserved(w,n))returnHome(w,n,e.id,guardian);}
      if(random(w)<.006)injure(w,n,'play',e);
      continue;
    }
    if(a?.kind==='return'){
      const guardian=person(w,a.guardian);
      if(guardian?.alive&&distance(n.position,guardian.position)>1){if(!s.activities[guardian.id]){const path=findPath(w,guardian.position,n.position);if(path)reserve(w,guardian,'escort',n.position,`${n.identity.name}의 귀가를 도우러 갑니다.`,{source:a.source,partner:n.id,duration:72});}continue;}
      if(!advanceActivity(w,n))continue;
      const e=appendEvent(w,{kind:'gathering',actorId:n.id,targetId:guardian?.id,causeId:a.source,importance:35,description:`${n.identity.name}이 놀이와 외출을 마치고 집으로 돌아왔다.`,data:{villageLife:true,phase:'returned',episodeId:a.source}});s.stats.returns++;release(w,n);if(guardian&&s.activities[guardian.id]?.partner===n.id)release(w,guardian);memory.helpSource=e.id;continue;
    }
    if(a)continue;
    if(distance(n.position,home.position)!==0){const source=memory.lastPlay??memory.firstOuting??appendEvent(w,{kind:'family',actorId:n.id,importance:30,description:`${n.identity.name}이 집으로 돌아갈 준비를 한다.`}).id;returnHome(w,n,source);continue;}
    n.decision={reason:n.identity.age<4?'집에서 가족의 돌봄을 받으며 자랍니다.':'집에서 쉬며 다음 놀이와 배움을 준비합니다.',candidates:[],tick:w.tick};
    if(n.identity.age<4||w.tick<memory.nextPlay||w.tick%144<42||w.tick%144>90||w.weather==='rain'||w.weather==='drought'||n.needs.hunger>45||n.needs.thirst>40||n.needs.fatigue>45||w.urban.citizens[n.id].injury>0)continue;
    const target=safePlayPlace(w,n);if(!target){memory.nextPlay=w.tick+36;continue;}
    const guardian=n.identity.age<7?neighbours(w,n,8).filter(p=>p.identity.age>=18&&p.settlementId===n.settlementId&&available(w,p)).sort((a,b)=>(b.homeId===n.homeId?100:0)+b.personality.empathy-((a.homeId===n.homeId?100:0)+a.personality.empathy))[0]:undefined;
    if(n.identity.age<7&&!guardian){n.decision.reason='함께 마당에 나갈 어른을 기다립니다.';continue;}
    if(reserve(w,n,'play',target,guardian?`${guardian.identity.name}과 함께 가까운 마당에서 놉니다.`:'안전한 마당에서 친구를 만나거나 혼자 놉니다.',{guardian:guardian?.id,duration:42})){
      a=s.activities[n.id];s.stats.outings++;memory.firstOuting??=a.source;
      if(guardian)reserve(w,guardian,'escort',target,`${n.identity.name}과 함께 마당에 나가 지켜봅니다.`,{partner:n.id,source:a.source,duration:42});
    }
  }
}
