import { test, expect } from '@playwright/test';
import { Simulation } from '../../src/sim/engine';
import { defaultCharacter } from '../../src/ui/characters';
import { rememberGrowth, chooseGrownCareer } from '../../src/sim/growth';
import { appendEvent } from '../../src/sim/social';
import { YEAR_TICKS } from '../../src/sim/types';

test('growth journey opens real learning and career evidence and remains readable on mobile',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const sim=new Simulation();sim.setLLM(false);
 const id=sim.createCharacter({...defaultCharacter('b4'),age:17,name:'배움을 이어가는 이웃'}),w=sim.snapshot(),n=w.npcs.find(n=>n.id===id)!,mentor=w.npcs[0];
 const e=appendEvent(w,{kind:'education',actorId:id,targetId:mentor.id,importance:50,description:'같은 마당에서 먹거리 마련을 배웠다.'});rememberGrowth(w,n,mentor,'lesson',e);n.identity.age=18;n.life.bornTick=w.tick-18*YEAR_TICKS;chooseGrownCareer(w,n);
 await page.addInitScript(save=>{localStorage.setItem('living-small-world-v1',save);localStorage.setItem('lsw-local-world-key','growth-journey');},Simulation.load(JSON.stringify(w)).save());
 await page.goto('/?local=1');await page.getByRole('button',{name:'일시정지',exact:true}).click();await page.locator('#neighbors-button').click();await page.locator('[data-neighbor-follow]').click();
 const journey=page.getByRole('region',{name:'어린 시절에서 성년까지'});await expect(journey).toContainText('배운 경험');await journey.getByRole('button',{name:'성년의 진로 선택'}).click();await expect(page.locator('#detail-dialog')).toContainText('어린 시절의 배움');await page.locator('#close-dialog').click();
 await page.setViewportSize({width:390,height:844});await journey.scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'reports/screenshots/v032-growth-mobile.png'});expect(errors).toEqual([]);
});

test('village shows growth blockers and keeps role explanation available',async({page})=>{
 await page.goto('/?local=1');await page.getByRole('button',{name:'일시정지',exact:true}).click();
 await expect(page.locator('.village-growth-conditions')).toContainText('성장과 정체의 이유');await expect(page.locator('.village-growth-conditions')).toContainText('빈 주거 자리');await expect(page.locator('.village-growth-conditions')).toContainText('출산 간격');
});
