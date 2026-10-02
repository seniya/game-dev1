import { test, expect } from '@playwright/test';
import { Simulation } from '../../src/sim/engine';
import { defaultCharacter } from '../../src/ui/characters';
import { appendEvent } from '../../src/sim/social';
import { injure, careTick } from '../../src/sim/care';
import { reserve } from '../../src/sim/village-actions';

test('four-year-old has sourced outings, visible childhood state, and mobile life cards',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const sim=new Simulation();sim.setLLM(false);
 const id=sim.createCharacter({...defaultCharacter('b4'),age:4,name:'마당에서 노는 아이'});sim.step(144*3);const w=sim.snapshot();expect(w.villageLife!.people[id].firstOuting).toBeTruthy();
 await page.addInitScript(save=>{localStorage.setItem('living-small-world-v1',save);localStorage.setItem('lsw-local-world-key','village-child');},sim.save());
 await page.goto('/?local=1');await page.getByRole('button',{name:'일시정지',exact:true}).click();await page.locator('#neighbors-button').click();await page.locator('[data-neighbor-follow]').click();
 await expect(page.locator('#npc-header')).toContainText('마당에서 노는 아이');await expect(page.locator('.village-life-person')).toContainText('어른과 가까운 마당');
 await page.locator('.village-life-person').getByRole('button',{name:'첫 바깥놀이'}).click();await expect(page.locator('#detail-dialog')).toContainText('마당');await page.locator('#close-dialog').click();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('.village-life-person').evaluate(el=>el.scrollIntoView({block:'center'}));await page.screenshot({path:'reports/screenshots/v031-child-mobile.png'});expect(errors).toEqual([]);
});

test('injury and actual care expose separate cause and follow-up evidence',async({page})=>{
 const sim=new Simulation();sim.setLLM(false);const id=sim.createCharacter({...defaultCharacter('b4'),name:'회복하는 이웃'}),w=sim.snapshot(),n=w.npcs.find(n=>n.id===id)!,helper=w.npcs[0];
 helper.position={...n.position};helper.needs.hunger=10;helper.needs.thirst=10;helper.needs.fatigue=10;
 const cause=appendEvent(w,{kind:'health',actorId:n.id,importance:50,description:'현장에서 발생한 작업 사고'});injure(w,n,'work',cause,'moderate');reserve(w,helper,'care',n.position,'찾아와 돌보기',{partner:n.id,source:w.villageLife!.injuries[0].source});for(let i=0;i<4;i++){w.tick++;careTick(w);}
 const save=Simulation.load(JSON.stringify(w)).save();await page.addInitScript(save=>{localStorage.setItem('living-small-world-v1',save);localStorage.setItem('lsw-local-world-key','village-care');},save);
 await page.goto('/?local=1');await page.getByRole('button',{name:'일시정지',exact:true}).click();await page.locator('#neighbors-button').click();await page.locator('[data-neighbor-follow]').click();
 await expect(page.locator('.village-life-person')).toContainText('돌봄을 받았습니다');await page.locator('.village-life-person').getByRole('button',{name:'돌봄의 경과'}).click();await expect(page.locator('#detail-dialog')).toContainText('찾아와');
});

test('new local village exposes only available livelihoods and preserves preset budgets',async({page})=>{
 await page.goto('/?local=1');await page.getByRole('button',{name:'＋ NPC 만들기',exact:true}).click();
 const form=page.locator('#character-form');await expect(form.locator('[name="occupation"] option')).toHaveCount(4);
 await form.locator('[data-start="artisan"]').click();await expect(form.locator('[name="occupation"]')).toHaveValue('homemaker');await expect(form.locator('#creation-budgets')).toContainText('200 / 200');
 await expect(form).toContainText('만 4세부터');
});
