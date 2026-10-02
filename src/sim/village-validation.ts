import type { WorldState } from './types';
import { OCCUPATIONS } from './types';
import { walkable } from './pathfinding';
import { distance } from './random';
export function validateVillageLife(w:WorldState,ensure:(v:unknown,m:string)=>void) {
  const s=w.villageLife;if(!s)return;
  const people=new Map(w.npcs.map(n=>[n.id,n])),events=new Map(w.events.map(e=>[e.id,e]));
  ensure(s.since<=w.tick,'생활 시작 시간');
  for(const [id,d] of Object.entries(s.settlements)){
    ensure(w.civilization.settlements.some(v=>v.id===id),'생활 정착지');
    ensure(!d.source||events.get(d.source)?.data.phase==='specialized'&&events.get(d.source)?.data.settlementId===id,'전문화 근거');
    ensure(d.lastDay<=Math.floor(w.tick/144)&&d.lastAssigned<=w.tick,'전문화 시간');
    ensure(new Set(d.unlocked).size===d.unlocked.length&&d.unlocked.every(j=>j in OCCUPATIONS),'전문화 직업');
  }
  const ids=new Set<string>(),register=(id:string)=>{ensure(!ids.has(id),'생활 상태 중복');ids.add(id);ensure(Number(id.slice(2))<w.nextId,'생활 다음 ID');};
  for(const [id,a] of Object.entries(s.activities)){
    register(a.id);const n=people.get(id);ensure(n,'활동 주민');
    ensure(a.since<=w.tick&&a.until>=a.since&&events.has(a.source),'활동 시간/출처');
    ensure(!a.handoffFrom||people.has(a.handoffFrom)&&a.kind==='escort','돌봄 인계 대상');
    ensure(!a.partner||a.partner!==id&&people.has(a.partner),'활동 상대');ensure(!a.guardian||a.guardian!==id&&(people.get(a.guardian)?.identity.age??0)>=18,'활동 보호자');
    ensure(walkable(w,a.target)&&a.path.every((p,i)=>walkable(w,p)&&distance(i?a.path[i-1]:n!.position,p)===1),'활동 경로');
    ensure(!a.path.length||distance(a.path.at(-1)!,a.target)===0,'활동 도착지');
  }
  const groups=new Map<string,number>();for(const a of Object.values(s.activities))if(a.guardian&&a.kind==='play'){groups.set(a.guardian,(groups.get(a.guardian)??0)+1);}for(const count of groups.values())ensure(count<=3,'공동 돌봄 정원');
  const injured=new Set<string>();
  for(const i of s.injuries){register(i.id);ensure(people.has(i.npc)&&!injured.has(i.npc),'부상 주민/중복');injured.add(i.npc);ensure(events.get(i.source)?.data.phase==='injured'&&events.has(i.latest)&&i.since<=w.tick,'부상 원본');ensure(i.observedSince===undefined||i.observedSince>=i.since&&i.observedSince<=w.tick,'돌봄 관찰 시작');ensure(i.firstCareAt===undefined||i.firstCareAt>=i.since&&i.firstCareAt<=w.tick,'첫 돌봄 시간');ensure(i.treatedAt===undefined||i.treatedAt<=w.tick,'처치 시간');ensure(!i.caregiver||people.has(i.caregiver),'처치자');ensure(Math.abs(w.urban.citizens[i.npc].injury-i.remaining)<.00001,'부상 합계');}
  for(const [key,p] of Object.entries(s.agreements??{})){ensure(key===[p.a,p.b].sort().join(':')&&p.a!==p.b&&people.has(p.a)&&people.has(p.b),'중재 약속 인물');ensure(events.get(p.source)?.data.phase==='mediated'&&p.since<=w.tick&&p.until>=p.since,'중재 약속 출처/시간');}
  const busy=new Set<string>();
  for(const c of s.conflicts){register(c.id);ensure(c.a!==c.b&&people.has(c.a)&&people.has(c.b)&&!busy.has(c.a)&&!busy.has(c.b),'갈등 중복/주민');busy.add(c.a);busy.add(c.b);ensure(events.has(c.source)&&events.has(c.latest)&&c.since<=w.tick,'갈등 원본/시간');}
  for(const [id,p] of Object.entries(s.people)){ensure(people.has(id),'생활 주민');for(const e of [p.firstOuting,p.lastPlay,p.helpSource,p.careerSource,...(p.growth??[]).flatMap(m=>[m.source,m.first])])ensure(!e||events.has(e),'생활 기억 원본');ensure(p.careerTick<=w.tick,'진로 시간');for(const m of p.growth??[]){ensure(m.tick<=w.tick&&people.has(m.person)&&m.person!==id,'성장 경험 인물/시간');ensure(!m.occupation||m.occupation in OCCUPATIONS,'배운 직업');ensure(events.get(m.source)?.participants.includes(id)&&events.get(m.source)?.participants.includes(m.person),'성장 경험 참여 근거');}ensure(!p.careerSource||events.get(p.careerSource)?.data.phase==='grown-career','진로 근거');}
}
