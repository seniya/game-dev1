import { descendants } from './dynasty';
import { businessReadiness } from './family-enterprise';
import { INDUSTRY_LABELS } from './urban-types';
import type { WorldState, WorldEvent } from './types';
export function familyObservation(w:WorldState,root:string){
  const family=descendants(w,root),byId=new Map(w.npcs.map(n=>[n.id,n]));
  const reference=(id:string)=>({id,name:byId.get(id)?.identity.name??id});
  const members=w.npcs.filter(n=>family.has(n.id));
  const people=members.map(n=>({id:n.id,name:n.identity.name,generation:family.get(n.id)!+1,alive:n.alive,age:n.identity.age,parents:n.life.parentIds.map(reference),partner:n.life.partnerId?reference(n.life.partnerId):undefined,homeId:n.homeId,apprenticeship:n.life.apprenticeship?{...n.life.apprenticeship,mentorName:byId.get(n.life.apprenticeship.mentor)?.identity.name??'',label:INDUSTRY_LABELS[n.life.apprenticeship.kind]}:undefined}));
  const businesses=w.urban.enterprises.filter(e=>e.business?.shares.some(s=>family.has(s.npc))).map(e=>{
    const p=e.business!,weight=p.shares.filter(s=>family.has(s.npc)).reduce((s,x)=>s+x.weight,0);
    return {id:e.id,buildingId:e.buildingId,label:INDUSTRY_LABELS[e.kind],weight,cash:p.cash,purchase:p.purchase,capital:p.capital,revenue:p.revenue,costs:p.costs,wages:p.wages,dividends:p.dividends,profit:p.revenue-p.costs-p.wages,source:p.source,latest:p.latest,status:businessReadiness(w,e),owners:p.shares.map(s=>({...reference(s.npc),weight:s.weight}))};
  });
  const homes=w.buildings.filter(b=>b.kind==='home'&&(b.ownerIds?.some(id=>family.has(id))||members.some(n=>n.alive&&n.homeId===b.id))).map(b=>({id:b.id,name:b.name,owned:!!b.ownerIds?.some(id=>family.has(id)),residents:members.filter(n=>n.alive&&n.homeId===b.id).map(n=>n.id)}));
  const influence=w.npcs.filter(n=>n.life.support&&family.has(n.life.support.giver)).map(n=>({recipient:reference(n.id),giver:reference(n.life.support!.giver),source:n.life.support!.source,tick:n.life.support!.tick,trust:n.relationships.find(r=>r.npcId===n.life.support!.giver)?.trust??0})).sort((a,b)=>b.tick-a.tick).slice(0,24);
  const coins=members.filter(n=>n.alive).reduce((s,n)=>s+n.wealth,0);
  return {people,businesses,homes,influence,coins};
}
export interface FamilyVisit {tick:number;through:number;coins:number}
export interface FamilyChanges {since:number|null;coinDelta:number|null;events:WorldEvent[];more:boolean}
export const FAMILY_KINDS=['birth','family','death','inheritance','education','coming_of_age','migration','occupation','industry','share','project','construction','relationship'];
