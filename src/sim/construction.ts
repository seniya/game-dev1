import { z } from 'zod';
import type { WorldState,Position,NPC,Candidate } from './types';
import { buildPosition } from './frontier';
import { buildHouse, stocks, market } from './civilization';
import { appendEvent } from './social';
import { canWork } from './employment';
import { clamp, distance } from './random';
const id=z.string().min(1).max(100),nat=z.number().int().nonnegative();
export const constructionSchema=z.object({projects:z.array(z.object({id,settlementId:id,kind:z.enum(['home','farm']),position:z.object({x:nat,y:nat}).strict(),started:nat,progress:z.number().nonnegative().max(72),required:z.union([z.literal(36),z.literal(72)]),wood:z.union([z.literal(12),z.literal(16)]),source:id,lastEventId:id,buildingId:id.optional(),finished:nat.optional(),used:nat.optional(),labor:z.object({paid:nat,workerId:id.optional(),lastWorked:nat.optional(),assignment:id.optional(),workEvent:id.optional()}).strict().optional()}).strict()).max(64)}).strict();
export type Construction=z.infer<typeof constructionSchema>;
export function beginConstruction(w:WorldState,settlementId:string,kind:'home'|'farm',position:Position) {
  const active=w.construction?.projects.filter(p=>!p.buildingId)??[];
  const stock=stocks(w,settlementId),wood=kind==='home'?12:16;
  if(!['home','farm'].includes(kind)||!buildPosition(w,settlementId,position)||stock.wood<wood||active.length>=8||w.buildings.length+active.length>=4000)throw new Error('마을 건설의 부지·목재·동시 공사 한도를 확인해 주세요.');
  w.construction??={projects:[]};w.construction.projects=[...active,...w.construction.projects.filter(p=>p.buildingId).slice(-55)];
  stock.wood-=wood;w.economy.totals.investedWood+=wood;
  const project={id:`site-${w.nextId++}`,settlementId,kind,position:{...position},started:w.tick,progress:0,required:kind==='home'?36 as const:72 as const,wood:wood as 12|16,source:'',lastEventId:'',labor:{paid:0}};
  const e=appendEvent(w,{kind:'construction',importance:50,description:`${kind==='home'?'주택':'농장'} 공사를 (${position.x}, ${position.y})에서 시작했다. 공동 목재 ${wood}개를 사용했고 현장에서 ${kind==='home'?6:12}인시의 노동이 필요하다. 40분 노동마다 시장 기금에서 1코인을 지급하며 비가 오면 노동 효율이 절반이 된다.`,data:{projectId:project.id,phase:'started',settlementId,wood,x:position.x,y:position.y,buildingKind:kind}});
  project.source=e.id;project.lastEventId=e.id;w.construction.projects.push(project);return project.id;
}
export function constructionTick(w:WorldState) {
  for(const p of w.construction?.projects??[]) {
    if(!p.buildingId) {
      if(!p.labor)p.progress=Math.min(p.required,p.progress+(w.weather==='rain'?.5:1));
      if(p.progress<p.required)continue;
      const v=w.civilization.settlements.find(v=>v.id===p.settlementId)!;
      const b=buildHouse(w,v,p.kind,true,p.position,p.id);if(!b)continue;
      p.buildingId=b.id;p.finished=w.tick;
      // buildHouse initializes building services; find the actual construction event.
      const completion=w.events.slice().reverse().find(e=>e.kind==='construction'&&e.locationId===b.id)!;
      completion.causeId=p.source;completion.data.projectId=p.id;completion.data.phase='completed';completion.data.elapsed=w.tick-p.started;completion.data.wood=0;completion.data.reservedWood=p.wood;completion.description=`착공 때 사용한 목재 ${p.wood}개로 ${b.name} 공사를 마쳤다. 추가 목재 사용은 없다.`;p.lastEventId=completion.id;
    }
    if(p.used!==undefined)continue;
    const b=w.buildings.find(b=>b.id===p.buildingId)!;
    const n=w.npcs.find(n=>n.alive&&distance(n.position,b.position)===0&&(p.kind==='home'?n.homeId===b.id&&n.currentAction?.kind==='Sleep':n.currentAction?.kind==='Work'&&n.currentAction.targetId===b.id));
    if(n){p.used=w.tick;p.lastEventId=appendEvent(w,{kind:'construction',actorId:n.id,locationId:b.id,causeId:p.lastEventId,importance:45,description:`${n.identity.name}이 새 ${p.kind==='home'?'주택에서 실제로 잠을 자':'농장에서 실제로 일하'}기 시작했다.`,data:{projectId:p.id,phase:'first-use',settlementId:p.settlementId}}).id;}
  }
}
export function validateConstruction(w:WorldState,ensure:(x:unknown,message:string)=>void) {
 const projects=w.construction?.projects??[];
 ensure(new Set(projects.map(p=>p.id)).size===projects.length,'마을 공사 ID 중복');
 ensure(projects.filter(p=>!p.buildingId).length<=8,'마을 동시 공사 상한');
 for(const p of projects){
  if(p.labor){const worked=w.events.find(e=>e.id===p.labor!.workEvent);ensure(p.labor.paid===0?p.progress===0&&!p.labor.workEvent:worked?.data.projectId===p.id&&worked.data.phase==='worked'&&worked.data.paid===p.labor.paid&&worked.data.progress===p.progress&&worked.tick===p.labor.lastWorked,'공사 누적 노동 근거');ensure(p.labor.paid<=72&&p.progress<=p.labor.paid*4,'공사 임금·노동');ensure(!p.labor.workerId||w.npcs.some(n=>n.id===p.labor!.workerId),'공사 일꾼');ensure(p.labor.lastWorked===undefined||p.labor.lastWorked<=w.tick&&p.labor.lastWorked>=p.started,'공사 노동 시각');ensure(!p.labor.assignment||w.events.some(e=>e.id===p.labor!.assignment&&e.data.projectId===p.id&&e.data.phase==='assigned'),'공사 배정 근거');}
  ensure(/^site-\d+$/.test(p.id)&&Number(p.id.slice(5))<w.nextId,'마을 공사 ID');
  ensure(w.civilization.settlements.some(v=>v.id===p.settlementId)&&p.started<=w.tick&&p.progress<=p.required&&p.wood===(p.kind==='home'?12:16)&&p.required===(p.kind==='home'?36:72),'마을 공사 상태');
  ensure(w.events.some(e=>e.id===p.source&&e.data.projectId===p.id&&e.tick===p.started&&e.data.wood===p.wood&&e.data.x===p.position.x&&e.data.y===p.position.y&&e.data.buildingKind===p.kind&&e.data.settlementId===p.settlementId)&&w.events.some(e=>e.id===p.lastEventId),'마을 공사 근거');
  ensure(p.buildingId ? p.finished!==undefined&&p.finished<=w.tick&&p.finished>=p.started&&p.progress===p.required&&w.buildings.some(b=>b.id===p.buildingId&&b.kind===p.kind&&b.settlementId===p.settlementId&&distance(b.position,p.position)===0) : p.finished===undefined&&p.used===undefined&&buildPosition(w,p.settlementId,p.position,p.id),'마을 공사 부지');
  ensure(p.used===undefined||p.finished!==undefined&&p.used>=p.finished&&p.used<=w.tick,'마을 공사 이용 시각');
 }
}

export function constructionCandidate(w:WorldState,n:NPC):Candidate|undefined {
 if(!canWork(w,n)||w.urban.citizens[n.id]?.employer||n.needs.hunger>70||n.needs.thirst>70||n.needs.fatigue>65||market(w,n.settlementId).coins<1)return;
 const site=w.construction?.projects.find(p=>p.labor&&!p.buildingId&&p.progress<p.required&&p.settlementId===n.settlementId&&!w.npcs.some(other=>other.id!==n.id&&other.alive&&other.currentAction?.targetId===`construction:${p.id}`));
 if(!site)return;
 return {kind:'Work',score:80+n.personality.diligence*.2-distance(n.position,site.position)*.6,reason:'공사 현장 노동 · 시장 기금에서 40분마다 임금 1코인 · 급한 생활 필요 시 중단',target:{...site.position},targetId:`construction:${site.id}`,evidence:[site.source]};
}
export function assignConstruction(w:WorldState,n:NPC) {
 const p=w.construction?.projects.find(p=>`construction:${p.id}`===n.currentAction?.targetId);
 if(!p?.labor||p.labor.workerId===n.id)return;
 p.labor.workerId=n.id;
 p.labor.assignment=appendEvent(w,{kind:'construction',actorId:n.id,causeId:p.source,importance:30,description:`${n.identity.name}이 공사 현장으로 이동해 일하기로 했다. 이동 중에는 공정이 진행되지 않는다.`,data:{projectId:p.id,phase:'assigned',settlementId:p.settlementId}}).id;
 p.lastEventId=p.labor.assignment;
}
export function workConstruction(w:WorldState,n:NPC) {
 const p=w.construction?.projects.find(p=>`construction:${p.id}`===n.currentAction?.targetId),fund=market(w,n.settlementId);
 if(!p?.labor||p.buildingId||p.progress>=p.required||p.settlementId!==n.settlementId||distance(n.position,p.position)!==0||!canWork(w,n)||n.needs.hunger>80||n.needs.thirst>80||n.needs.fatigue>75||fund.coins<1)return false;
 const amount=Math.min(p.required-p.progress,w.weather==='rain'?2:4);
 p.progress+=amount;p.labor.paid++;p.labor.lastWorked=w.tick;p.labor.workerId=n.id;
 fund.coins--;n.wealth++;w.urban.citizens[n.id].income++;w.economy.totals.wages++;n.needs.fatigue=clamp(n.needs.fatigue+2);
 p.labor.workEvent=p.lastEventId=appendEvent(w,{kind:'construction',actorId:n.id,causeId:p.labor.assignment??p.source,importance:30,description:`${n.identity.name}이 현장에서 40분 일해 공정을 ${amount}만큼 진행하고 시장 기금에서 임금 1코인을 받았다.${w.weather==='rain'?' 비로 노동 효율이 절반이다.':''}`,data:{projectId:p.id,phase:'worked',settlementId:p.settlementId,progress:p.progress,paid:p.labor.paid,labor:4,wage:1,fundRemaining:fund.coins}}).id;
 return true;
}
export function constructionStatus(w:WorldState,p:Construction['projects'][number]) {
 if(p.buildingId)return p.used!==undefined?'첫 이용 확인':'완공 · 첫 이용 기다림';
 if(!p.labor)return '이전 공사 · 시간에 따라 진행';
 const worker=w.npcs.find(n=>n.alive&&n.currentAction?.targetId===`construction:${p.id}`);
 if(market(w,p.settlementId).coins<1)return '시장 임금 기금 부족 · 공사 대기';
 if(worker)return `${worker.identity.name} · ${distance(worker.position,p.position)===0?'현장 노동':'현장으로 이동'}${w.weather==='rain'?' · 비로 효율 감소':''}`;
 return '일할 주민 기다림 · 식사·휴식·건강·기존 일을 우선';
}
