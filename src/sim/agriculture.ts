import { z } from 'zod';
import type { WorldState, Building } from './types';
import { cropMultiplier, seasonIndex, SEASONS } from './heritage';
import { city } from './urban';
import { appendEvent } from './social';
const nat=z.number().int().nonnegative(),id=z.string().min(1).max(100);
export const agricultureSchema=z.object({farms:z.array(z.object({buildingId:id,since:nat,grown:z.number().finite().nonnegative(),harvested:nat,lost:nat,lastEventId:id.optional()}).strict()).max(4000)}).strict();
export type Agriculture=z.infer<typeof agricultureSchema>;
const indexes=new WeakMap<Agriculture,{length:number;map:Map<string,Agriculture['farms'][number]>}>();
function ledger(w:WorldState,b:Building) {
 const a=w.agriculture??={farms:[]};let index=indexes.get(a);
 if(!index||index.length!==a.farms.length){index={length:a.farms.length,map:new Map(a.farms.map(f=>[f.buildingId,f]))};indexes.set(a,index);}
 let row=index.map.get(b.id);if(!row){row={buildingId:b.id,since:w.tick,grown:0,harvested:0,lost:0};a.farms.push(row);index.map.set(b.id,row);index.length++;}return row;
}
export function growthRate(w:WorldState,b:Building) {
 return (w.weather==='drought'?.025:w.weather==='rain'?.24:.14)*(1+(b.level-1)*.35)*(city(w,b.settlementId!)?.fertility??70)/70*(w.urban.buildings[b.id]?.condition??100)/100*cropMultiplier(w,b.settlementId!);
}
export function growFarm(w:WorldState,b:Building) {const amount=Math.min(120-b.growth,growthRate(w,b));b.growth+=amount;ledger(w,b).grown+=amount;}
export function recordHarvest(w:WorldState,b:Building,amount:number) {ledger(w,b).harvested+=amount;}
export function recordCropLoss(w:WorldState,b:Building,amount:number) {ledger(w,b).lost+=amount;}
export function agricultureDay(w:WorldState) {
 for(const f of w.agriculture?.farms??[]) {
  const b=w.buildings.find(b=>b.id===f.buildingId);if(!b)continue;
  f.lastEventId=appendEvent(w,{kind:'ecology',locationId:b.id,importance:f.lost?45:20,description:`${b.name}: 지난 기록 이후 작물 성장 ${f.grown.toFixed(1)}, 주민 수확 ${f.harvested}, 야생동물 피해 ${f.lost}. 현재 미수확 작물 ${b.growth.toFixed(1)}.`,data:{agriculture:true,settlementId:b.settlementId!,since:f.since,grown:f.grown,harvested:f.harvested,cropLoss:f.lost,standing:b.growth,season:SEASONS[seasonIndex(w)]}}).id;
  f.since=w.tick;f.grown=0;f.harvested=0;f.lost=0;
 }
}
export function farmOutlook(w:WorldState,b:Building) {
 if(w.urban.enterprises.some(e=>e.buildingId===b.id))return `${SEASONS[seasonIndex(w)]} · 작물 ${b.growth.toFixed(1)} · 사업체 작업용 · 고용·재료·기금 조건 확인`;
 const rate=growthRate(w,b),ticks=rate>0?Math.ceil(Math.max(0,3-b.growth)/rate):null;
 return `${SEASONS[seasonIndex(w)]} · 작물 ${b.growth.toFixed(1)} · ${b.growth>=3?'개인 수확 가능':ticks===null?'성장 정체':`개인 수확까지 약 ${ticks*10}분`} · 현재 조건의 추정`;
}
export function validateAgriculture(w:WorldState,ensure:(v:unknown,message:string)=>void) {
 const fs=w.agriculture?.farms??[];ensure(new Set(fs.map(f=>f.buildingId)).size===fs.length,'농업 기록 중복');
 for(const f of fs){ensure(f.since<=w.tick&&w.buildings.some(b=>b.id===f.buildingId&&b.kind==='farm'),'농업 기록 농장');ensure(!f.lastEventId||w.events.some(e=>e.id===f.lastEventId&&e.locationId===f.buildingId&&e.data.agriculture),'농업 원본 근거');}
}
