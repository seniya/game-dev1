import { test, expect } from '@playwright/test';
import { Simulation } from '../../src/sim/engine';
import { defaultCharacter } from '../../src/ui/characters';

test('a created sixteen-year-old shows care and meal records across observer surfaces', async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const sim=new Simulation();sim.setLLM(false);
  sim.createCharacter({...defaultCharacter('b4'),age:16,name:'돌봄 관찰 주민'});sim.step(144);
  await page.addInitScript(save=>{if(!localStorage.getItem('care-fixture')){localStorage.setItem('living-small-world-v1',save);localStorage.setItem('lsw-local-world-key','care-fixture');localStorage.setItem('care-fixture','1');}},sim.save());
  await page.goto('/?local=1');await page.getByRole('button',{name:'일시정지',exact:true}).click();
  await page.locator('#neighbors-button').click();
  await expect(page.locator('.neighbor-person')).toContainText('집에서 돌봄을 받는 중');
  await page.locator('[data-neighbor-follow]').click();
  await expect(page.locator('#npc-header')).toContainText('16세');
  await expect(page.locator('#character-watch')).toContainText('18세 전에는 집에서 돌봄을 받으며 자랍니다');
  await expect(page.locator('#character-watch .activity-card')).toContainText('식량 1개를 먹었다');
  await expect(page.locator('#character-watch .activity-card progress')).toHaveCount(0);
  await expect(page.locator('#character-watch')).not.toContainText('다음 행동을 생각하는 중');
  await page.getByRole('button',{name:'마을 주민',exact:true}).click();
  await page.getByLabel('내가 만든 주민만').check();
  await expect(page.locator('.resident-card')).toContainText('집에서 돌봄을 받는 중');
  await page.locator('.resident-card').click();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#character-watch').screenshot({path:'reports/screenshots/v0301-child-care-mobile.png'});
  await page.reload();await page.locator('#neighbors-button').click();
  await expect(page.locator('.neighbor-person')).toContainText('집에서 돌봄을 받는 중');
  expect(errors).toEqual([]);
});
