import { test, expect } from '@playwright/test';
import { Simulation } from '../../src/sim/engine';
import { defaultCharacter } from '../../src/ui/characters';
import { availableHomes } from '../../src/sim/characters';
import { appendEvent, changeRelationship, relationship } from '../../src/sim/social';

test('five neighbors show evidence, older moments, map following and mobile layout',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const sim=new Simulation(42,12),ids:string[]=[];
  for(let i=0;i<5;i++)ids.push(sim.createCharacter({...defaultCharacter(availableHomes(sim.snapshot()).find(h=>h.vacant)!.home.id),name:`우리 이웃 ${i+1}`}));
  const w=sim.snapshot(),a=w.npcs.find(n=>n.id===ids[0])!,b=w.npcs.find(n=>n.id===ids[1])!;
  Object.assign(relationship(a,b.id),{trust:59,affection:24,familiarity:29,resentment:0});
  const cause=appendEvent(w,{kind:'share',actorId:b.id,targetId:a.id,importance:45,description:'우리 이웃의 도움'});
  changeRelationship(w,a,b.id,{trust:2,affection:2,familiarity:2},cause,'도움으로 가까워졌다');
  for(let i=0;i<22;i++){w.tick+=432;changeRelationship(w,a,b.id,i%2===0?{trust:-80,resentment:80}:{trust:60,resentment:-80},cause,i%2===0?'갈등이 깊어졌다':'신뢰를 회복했다');}
  appendEvent(w,{kind:'gathering',participants:[a.id,b.id],importance:55,description:'두 이웃이 식사를 마쳤다',data:{phase:'completed',gatheringKind:'meal'}});
  const save=Simulation.load(JSON.stringify(w)).save();
  await page.addInitScript(save=>{if(!localStorage.getItem('neighbors-fixture')){localStorage.setItem('living-small-world-v1',save);localStorage.setItem('lsw-local-world-key','neighbors-fixture');localStorage.setItem('neighbors-fixture','1');}},save);
  await page.goto('/?local=1');await page.locator('#neighbors-button').click();
  await expect(page.locator('.neighbor-person')).toHaveCount(5);await expect(page.locator('[data-goal="meal"]')).toContainText('달성 기록 있음');
  await expect(page.locator('.neighbor-turns article')).toHaveCount(20);await page.locator('[data-neighbors-older]').click();await expect(page.locator('.neighbor-turns article')).toHaveCount(23);
  await page.locator('[data-goal="meal"] [data-event]').click();await expect(page.locator('#detail-dialog')).toContainText('두 이웃이 식사를 마쳤다');
  await page.locator('#close-dialog').click();await page.locator('#neighbors-button').click();await page.locator('[data-neighbor-follow]').first().click();await expect(page.locator('#map-mode')).toHaveValue('follow');await expect(page.locator('#npc-header')).toContainText('우리 이웃 1');
  await page.locator('#neighbors-button').click();await page.setViewportSize({width:390,height:844});
  expect(await page.locator('#neighbors-panel').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'reports/screenshots/v030-neighbors-mobile.png'});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'reports/screenshots/v030-neighbors-desktop.png'});
  await page.locator('[data-neighbors-dynasty]').click();await page.locator('#dynasty-found button').click();await expect(page.locator('.legacy-goals')).toContainText('첫 흑자');
  await expect(page.locator('#dynasty-panel')).toContainText('내 이웃과 함께 남긴 기록');await page.reload();await page.locator('#neighbors-button').click();await expect(page.locator('[data-goal="meal"]')).toContainText('달성 기록 있음');
  expect(errors).toEqual([]);
});

test('real Worker restricts neighbor grouping to the signed-in member and supports empty/fresh views',async({page,browser})=>{
  await page.goto('/');await expect(page.locator('#account-button')).toContainText('소유자');
  await page.evaluate(async()=>{const w=await(await fetch('/api/world')).json();const r=await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),revision:w.revision,action:{type:'reset',seed:42,population:12}})});if(!r.ok)throw Error(await r.text());});
  await page.reload();await page.locator('#neighbors-button').click();await expect(page.locator('#neighbors-panel')).toContainText('직접 만든 0명');
  await page.locator('[data-dynasty-create]').click();await page.locator('#character-form [name="name"]').fill('소유자의 이웃');await page.locator('#character-form').getByRole('button',{name:/입주/}).click();await expect(page.locator('#npc-header')).toContainText('소유자의 이웃');
  await page.locator('#neighbors-button').click();await expect(page.locator('.neighbor-person')).toHaveCount(1);await page.locator('[data-neighbors-refresh]').click();await expect(page.locator('.neighbor-person')).toContainText('소유자의 이웃');
  const context=await browser.newContext({extraHTTPHeaders:{'oai-authenticated-user-id':`neighbors-${crypto.randomUUID()}`,'oai-authenticated-user-email':'neighbors@example.test'}});
  try{const guest=await context.newPage();await guest.goto('/');await expect(guest.locator('#account-button')).toContainText('참여자');await guest.locator('#neighbors-button').click();await expect(guest.locator('.neighbor-person')).toHaveCount(0);
    await guest.locator('[data-dynasty-create]').click();await guest.locator('#character-form [name="name"]').fill('참여자의 이웃');await guest.locator('#character-form').getByRole('button',{name:/입주/}).click();await expect(guest.locator('#npc-header')).toContainText('참여자의 이웃');
    await guest.locator('#neighbors-button').click();await expect(guest.locator('.neighbor-person')).toContainText('참여자의 이웃');await expect(guest.locator('#neighbors-panel')).not.toContainText('소유자의 이웃');
    await page.locator('[data-neighbors-refresh]').click();await expect(page.locator('#neighbors-panel')).not.toContainText('참여자의 이웃');
    await guest.locator('[data-neighbors-dynasty]').click();await guest.locator('#dynasty-found button').click();await expect(guest.locator('.legacy-goals')).toContainText('다음 세대의 현장');await expect(guest.locator('#dynasty-business')).toHaveCount(0);
    await guest.setViewportSize({width:390,height:844});expect(await guest.locator('#dynasty-panel').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
  }finally{await context.close();}
});
