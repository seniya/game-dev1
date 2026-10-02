import { z } from 'zod';
import type { WorldState,Position } from './types';
import { buildPosition } from './frontier';
import { buildHouse, stocks } from './civilization';
import { appendEvent } from './social';
import { distance } from './random';
const id=z.string().min(1).max(100),nat=z.number().int().nonnegative();
export const constructionSchema=z.object({projects:z.array(z.object({id,settlementId:id,kind:z.enum(['home','farm']),position:z.object({x:nat,y:nat}).strict(),started:nat,progress:z.number().nonnegative().max(72),required:z.union([z.literal(36),z.literal(72)]),wood:z.union([z.literal(12),z.literal(16)]),source:id,lastEventId:id,buildingId:id.optional(),finished:nat.optional(),used:nat.optional()}).strict()).max(64)}).strict();
export type Construction=z.infer<typeof constructionSchema>;
export function beginConstruction(w:WorldState,settlementId:string,kind:'home'|'farm',position:Position) {
  const active=w.construction?.projects.filter(p=>!p.buildingId)??[];
  const stock=stocks(w,settlementId),wood=kind==='home'?12:16;
  if(!['home','farm'].includes(kind)||!buildPosition(w,settlementId,position)||stock.wood<wood||active.length>=8||w.buildings.length+active.length>=4000)throw new Error('마을 건설의 부지·목재·동시 공사 한도를 확인해 주세요.');
  w.construction??={projects:[]};w.construction.projects=[...active,...w.construction.projects.filter(p=>p.buildingId).slice(-55)];
  stock.wood-=wood;w.economy.totals.investedWood+=wood;
  const project={id:`site-${w.nextId++}`,settlementId,kind,position:{...position},started:w.tick,progress:0,required:kind==='home'?36 as const:72 as const,wood:wood as 12|16,source:'',lastEventId:''};
  const e=appendEvent(w,{kind:'construction',importance:50,description:`${kind==='home'?'주택':'농장'} 공사를 (${position.x}, ${position.y})에서 시작했다. 공동 목재 ${wood}개를 사용했고 완공까지 ${kind==='home'?6:12}시간이 필요하다. 비가 오면 공정이 절반 속도로 진행된다.`,data:{projectId:project.id,phase:'started',settlementId,wood,x:position.x,y:position.y,buildingKind:kind}});
  project.source=e.id;project.lastEventId=e.id;w.construction.projects.push(project);return project.id;
}
export function constructionTick(w:WorldState) {
  for(const p of w.construction?.projects??[]) {
    if(!p.buildingId) {
      p.progress=Math.min(p.required,p.progress+(w.weather==='rain'?.5:1));
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
  ensure(/^site-\d+$/.test(p.id)&&Number(p.id.slice(5))<w.nextId,'마을 공사 ID');
  ensure(w.civilization.settlements.some(v=>v.id===p.settlementId)&&p.started<=w.tick&&p.progress<=p.required&&p.wood===(p.kind==='home'?12:16)&&p.required===(p.kind==='home'?36:72),'마을 공사 상태');
  ensure(w.events.some(e=>e.id===p.source&&e.data.projectId===p.id&&e.tick===p.started&&e.data.wood===p.wood&&e.data.x===p.position.x&&e.data.y===p.position.y&&e.data.buildingKind===p.kind&&e.data.settlementId===p.settlementId)&&w.events.some(e=>e.id===p.lastEventId),'마을 공사 근거');
  ensure(p.buildingId ? p.finished!==undefined&&p.finished<=w.tick&&p.finished>=p.started&&p.progress===p.required&&w.buildings.some(b=>b.id===p.buildingId&&b.kind===p.kind&&b.settlementId===p.settlementId&&distance(b.position,p.position)===0) : p.finished===undefined&&p.used===undefined&&buildPosition(w,p.settlementId,p.position,p.id),'마을 공사 부지');
  ensure(p.used===undefined||p.finished!==undefined&&p.used>=p.finished&&p.used<=w.tick,'마을 공사 이용 시각');
 }
}
