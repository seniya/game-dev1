import { developed } from '../helpers/developed-world';
import {test,expect} from '@playwright/test';
import {Simulation} from '../../src/sim/engine';
import {defaultCharacter} from '../../src/ui/characters';
import {availableHomes} from '../../src/sim/characters';
import {buildEnterprise,initializeUrban,industryWork} from '../../src/sim/urban';
import {acquireBusiness} from '../../src/sim/family-enterprise';
import {formFamily,giveBirth} from '../../src/sim/life';
import {relationship} from '../../src/sim/social';
import {YEAR_TICKS} from '../../src/sim/types';
function fixture(owned=false){
  const sim=new Simulation(42,12),root=sim.createCharacter({...defaultCharacter(availableHomes(sim.snapshot()).find(h=>h.vacant)!.home.id),name:'푸른 가문',ambition:'wealth'});
  const w=developed(sim.snapshot()),a=w.npcs.find(n=>n.id===root)!,b=w.npcs[0];const funds=100-a.wealth;w.market.coins-=funds;a.wealth+=funds;
  w.tick=YEAR_TICKS*2+36;
  for(const n of [a,b]){n.identity.age=25;n.life.bornTick=w.tick-25*YEAR_TICKS;n.needs.health=100;n.needs.hunger=10;}
  for(const [n,p] of [[a,b],[b,a]]){relationship(n,p.id).trust=80;relationship(n,p.id).affection=50;}
  expect(formFamily(w,a,b)).toBe(true);const child=giveBirth(w,a,b)!;expect(child).toBeTruthy();child.identity.name='푸른 후손';
  const e=buildEnterprise(w,a.settlementId,'field')!;initializeUrban(w);e.workers=[a.id];w.urban.citizens[a.id].employer=e.id;a.position={...w.buildings.find(x=>x.id===e.buildingId)!.position};
  if(owned){acquireBusiness(w,a.id,e.id);industryWork(w,a);}
  return {save:Simulation.load(JSON.stringify(w)).save(),root,building:e.buildingId};
}
test('genealogy, paid acquisition, ledger, evidence, map overlay and mobile persist',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const f=fixture();
  await page.addInitScript(save=>{if(localStorage.getItem('lsw-local-world-key')!=='family-v028'){localStorage.setItem('living-small-world-v1',save);localStorage.setItem('lsw-local-world-key','family-v028');}},f.save);await page.goto('/?local=1');
  await page.locator('#dynasty-button').click();await page.locator('#dynasty-found button').click();
  await expect(page.locator('#family-tree')).toContainText('푸른 후손');await expect(page.locator('#family-tree')).toContainText('2세대');await expect(page.locator('.family-partner')).toHaveCount(1);
  await page.locator('#dynasty-business button').click();await expect(page.locator('.family-business')).toContainText('가문 지분 100%');await expect(page.locator('.business-ledger')).toContainText('현재 운영금');
  await expect(page.locator('.family-return')).toContainText('인수하고');
  await page.locator('[data-family-map]').click();await expect(page.locator('#family-map-status')).toContainText('금색 원');
  await page.locator('#dynasty-button').click();await page.locator(`[data-family-building="${f.building}"]`).click();await expect(page.locator('#npc-detail')).toContainText('곡물 농장');
  await page.locator('#dynasty-button').click();await page.locator('.family-business [data-event]').first().click();await expect(page.locator('#detail-dialog')).toContainText('인수하고');
  await page.reload();await page.locator('#dynasty-button').click();await expect(page.locator('.family-business')).toContainText('가문 지분 100%');
  await page.setViewportSize({width:390,height:844});await expect(page.locator('#family-tree')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('#dynasty-panel').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
  await page.locator('#family-tree').evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:'reports/screenshots/v028-family-mobile.png'});
  await page.setViewportSize({width:1440,height:1000});await page.locator('.family-businesses').scrollIntoViewIfNeeded();await page.screenshot({path:'reports/screenshots/v028-business-desktop.png'});expect(errors).toEqual([]);
});
test('server dynasty revisits and participant observation preserve owner-only business control',async({page,browser})=>{
  await page.goto('/');await expect(page.locator('#account-button')).toContainText('소유자');
  await page.evaluate(async()=>{const w=await(await fetch('/api/world')).json();const r=await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),revision:w.revision,action:{type:'reset',seed:42,population:12}})});if(!r.ok)throw Error(await r.text());});await page.reload();
  const context=await browser.newContext({extraHTTPHeaders:{'oai-authenticated-user-id':`family-${crypto.randomUUID()}`,'oai-authenticated-user-email':'family@example.test'}});
  try{const guest=await context.newPage();await guest.goto('/');await expect(guest.locator('#account-button')).toContainText('참여자');await guest.locator('#create-character').click();await guest.locator('#character-form [name="name"]').fill('초대 가문');await guest.locator('#character-form').getByRole('button',{name:/입주/}).click();await expect(guest.locator('#npc-header')).toContainText('초대 가문');
    await guest.locator('#dynasty-button').click();await guest.locator('#dynasty-found button').click();await expect(guest.locator('#family-tree')).toContainText('초대 가문');await expect(guest.locator('#dynasty-business')).toHaveCount(0);
    await guest.reload();await guest.locator('#dynasty-button').click();await expect(guest.locator('.family-return')).toContainText('지난 가문 관찰 이후');await expect(guest.locator('.family-return')).toContainText('코인 +0');
    await guest.locator('[data-family-map]').click();await expect(guest.locator('#family-map-status')).toBeVisible();await guest.locator('[data-family-map-off]').click();await expect(guest.locator('#family-map-status')).toHaveCount(0);
  }finally{await context.close();}
});
