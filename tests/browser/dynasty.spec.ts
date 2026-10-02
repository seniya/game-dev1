import { test, expect } from '@playwright/test';
test('avatar, dynasty, ambition, persistence, evidence and mobile layout', async ({page}) => {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('#account-button')).toContainText('소유자');
  await page.evaluate(async()=>{const w=await(await fetch('/api/world')).json();await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),revision:w.revision,action:{type:'reset',seed:42,population:12}})});});
  await page.reload();await page.locator('#dynasty-button').click();await expect(page.locator('#dynasty-panel')).toContainText('첫 아바타');
  await page.locator('[data-dynasty-create]').click();
  const form=page.locator('#character-form');await form.locator('[name="name"]').fill('새로운 가문');await form.locator('[name="ambition"]').selectOption('family');
  await form.getByRole('button',{name:/입주/}).click();await expect(page.locator('#npc-header')).toContainText('새로운 가문');
  await page.locator('#dynasty-button').click();await page.locator('#dynasty-found button').click();
  await expect(page.locator('.dynasty-metrics')).toContainText('생존 후손');await expect(page.locator('.dynasty-life')).toContainText('시작 코인 20');
  await page.locator('#dynasty-ambition select').selectOption('wealth');await page.locator('#dynasty-ambition button').click();
  await expect(page.locator('#dynasty-ambition select')).toHaveValue('wealth');
  await page.reload();await page.locator('#dynasty-button').click();await expect(page.locator('.dynasty-avatar')).toContainText('새로운 가문');
  await expect(page.locator('#dynasty-ambition select')).toHaveValue('wealth');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const panel=page.locator('#dynasty-panel');expect(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
  await page.screenshot({path:'reports/screenshots/v027-dynasty-mobile.png',fullPage:false});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'reports/screenshots/v027-dynasty-desktop.png',fullPage:false});
  expect(errors).toEqual([]);
});
test('participant chooses own dynasty, but cannot change world priorities',async({browser,page})=>{
  await page.goto('/');await expect(page.locator('#account-button')).toContainText('소유자');
  const context=await browser.newContext({extraHTTPHeaders:{'oai-authenticated-user-id':`dynasty-${crypto.randomUUID()}`,'oai-authenticated-user-email':'dynasty@example.test'}});
  try {
    const guest=await context.newPage();await guest.goto('/');await expect(guest.locator('#account-button')).toContainText('참여자');
    await guest.locator('#create-character').click();await guest.locator('#character-form [name="name"]').fill('초대된 시조');await guest.locator('#character-form').getByRole('button',{name:/입주/}).click();
    await expect(guest.locator('#npc-header')).toContainText('초대된 시조');
    await guest.locator('#dynasty-button').click();await guest.locator('#dynasty-found button').click();
    await expect(guest.locator('.dynasty-avatar')).toContainText('초대된 시조');await expect(guest.locator('#dynasty-ambition')).toHaveCount(0);
    await page.locator('#dynasty-button').click();await expect(page.locator('#dynasty-panel')).not.toContainText('초대된 시조');
  } finally {await context.close();}
});
test('device world keeps avatar and dynasty after reload',async({page})=>{
  await page.goto('/?local=1');await page.locator('#create-character').click();await page.locator('#character-form [name="name"]').fill('기기 시조');await page.locator('#character-form').getByRole('button',{name:/입주/}).click();
  await expect(page.locator('#npc-header')).toContainText('기기 시조');await page.locator('#dynasty-button').click();await page.locator('#dynasty-found button').click();
  await expect(page.locator('.dynasty-avatar')).toContainText('기기 시조');await page.reload();await page.locator('#dynasty-button').click();await expect(page.locator('.dynasty-avatar')).toContainText('기기 시조');
});
test('a deceased avatar leaves a life summary and a real child continues without receiving assets twice',async({page})=>{
  const {Simulation}=await import('../../src/sim/engine');
  const {defaultCharacter}=await import('../../src/ui/characters');
  const {availableHomes}=await import('../../src/sim/characters');
  const {formFamily,giveBirth,die}=await import('../../src/sim/life');
  const {relationship}=await import('../../src/sim/social');
  const {YEAR_TICKS}=await import('../../src/sim/types');
  const sim=new Simulation(42,12);const root=sim.createCharacter({...defaultCharacter(availableHomes(sim.snapshot()).find(h=>h.vacant)!.home.id),name:'가문을 남긴 시조'});
  const w=sim.snapshot(),a=w.npcs.find(n=>n.id===root)!,b=w.npcs[0];w.tick=YEAR_TICKS*2+36;
  for(const n of [a,b]){n.identity.age=25;n.life.bornTick=w.tick-25*YEAR_TICKS;n.needs.health=100;n.needs.hunger=10;}
  for(const [n,p] of [[a,b],[b,a]]){const r=relationship(n,p.id);r.trust=80;r.affection=40;}
  expect(formFamily(w,a,b)).toBe(true);const child=giveBirth(w,a,b)!;expect(child).toBeTruthy();child.identity.name='이어가는 아이';die(w,a,'needs');
  const save=Simulation.load(JSON.stringify(w)).save(),coins=child.wealth;
  await page.goto('/?local=1');await page.evaluate(save=>{localStorage.setItem('living-small-world-v1',save);localStorage.setItem('lsw-local-world-key','dynasty-successor-test');},save);await page.reload();
  await page.locator('#dynasty-button').click();await page.locator('#dynasty-found button').click();
  await expect(page.locator('.dynasty-life')).toContainText('사망 시 전달한 유산');await expect(page.locator('#dynasty-succeed')).toContainText('이어가는 아이');
  await page.locator('#dynasty-succeed button').click();await expect(page.locator('.dynasty-avatar')).toContainText('이어가는 아이');await expect(page.locator('.dynasty-avatar')).toContainText('2번째 아바타');
  await expect(page.locator('.dynasty-life')).toContainText(`현재 코인 ${coins}`);
  await page.reload();await page.locator('#dynasty-button').click();await expect(page.locator('.dynasty-avatar')).toContainText('이어가는 아이');
});
