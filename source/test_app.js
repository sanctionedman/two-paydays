// End-to-end check of the Mac app: start, add spending, work offline, back up, then update to a newer version with
// the Update now button and confirm the data is untouched. Uses a blank plan, so no personal data is involved.
//   node source/test_app.js                 (needs: npm i playwright, and a Chromium for Playwright)
//   node source/test_app.js my-backup.json  (optional: test with a real backup kept OUTSIDE this repository)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const REPO = path.resolve(__dirname, '..');
const backupFile = process.argv[2] || null;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(REPO, p);
  if (!f.startsWith(REPO) || f.includes(path.sep + 'source' + path.sep)) { res.writeHead(404); res.end(); return; }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(d); });
});
const REL = path.join(REPO, 'source/macapp/release.json');
const build = (version) => {
  const orig = fs.readFileSync(REL, 'utf8');
  if (version) fs.writeFileSync(REL, JSON.stringify({ version, released: 'test', notes: ['Test release: checks that updates install.'] }, null, 2));
  try { execFileSync('python3', [path.join(REPO, 'source/build.py')], { cwd: REPO }); } finally { fs.writeFileSync(REL, orig); }
};
(async () => {
  build();
  const current = JSON.parse(fs.readFileSync(REL, 'utf8')).version;
  await new Promise(r => server.listen(8800, r));
  const exe = process.env.CHROMIUM || undefined;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const logs = []; page.on('pageerror', e => logs.push('PAGEERROR ' + e.message)); page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
  let fails = 0;
  const step = async (name, fn) => { try { await fn(); console.log('OK   ' + name); } catch (e) { fails++; console.log('FAIL ' + name + ' — ' + e.message); } };
  const body = () => page.evaluate(() => document.body.innerText);
  // wait until the planner has opened (survives a reload racing with the check)
  const ready = async () => {
    for (let i = 0; i < 12; i++) {
      try { await page.waitForFunction(() => typeof S !== 'undefined' && S.plan !== undefined && !/Opening your household plan/.test(document.body.innerText), null, { timeout: 2500 }); return; }
      catch (e) { await page.waitForTimeout(250); }
    }
  };
  const data = () => page.evaluate(() => localStorage.getItem('tp:localdb'));

  await step('opens with the start screen', async () => {
    await page.goto('http://localhost:8800/'); await page.waitForTimeout(1200);
    if (!/Restore a backup/.test(await body())) throw new Error('no start screen');
    await page.evaluate(() => navigator.serviceWorker.ready);
  });
  await step(backupFile ? 'restores the backup file' : 'starts a blank plan', async () => {
    if (backupFile) { await page.setInputFiles('#onb-file', backupFile); await page.waitForTimeout(800); }
    else { await page.getByRole('button', { name: 'Start a blank plan' }).click(); await page.waitForTimeout(800); }
    await page.reload(); await page.waitForTimeout(900);
    const who = page.locator('.banner button.primary').first();
    if (await who.count() && /Who is using/.test(await body())) { await who.click(); await page.waitForTimeout(300); }
    if (!/Saved on this Mac/.test(await body())) throw new Error('not in app mode');
  });
  await step('adds spending and keeps it', async () => {
    await page.keyboard.press('n'); await page.waitForTimeout(250);
    await page.locator('#modal-text').fill('Tesco 12.50'); await page.waitForTimeout(200);
    await page.getByRole('dialog').getByRole('button', { name: /^Add/ }).first().click(); await page.waitForTimeout(400);
    await page.reload(); await page.waitForTimeout(800);
    const d = JSON.parse(await data());
    if (!Object.entries(d).some(([k, v]) => k.startsWith('months/') && Object.values(v.txns || {}).some(t => /Tesco/.test(t.desc) && t.amount === 12.5))) throw new Error('not saved');
  });
  await step('Back up now saves a backup file', async () => {
    await page.locator('.rail button:has-text("Plan & settings")').click(); await page.waitForTimeout(200);
    await page.click('summary:has-text("Backup, export and updates")'); await page.waitForTimeout(150);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Full backup (JSON)' }).click()]);
    const j = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    if (!j.plan || !/two-paydays-backup-/.test(dl.suggestedFilename())) throw new Error('bad backup');
  });
  await step('works with no internet', async () => {
    await ctx.setOffline(true);
    await page.reload(); await ready();
    { const t = await body(); if (!/Saved on this Mac/.test(t)) throw new Error('did not load offline: ' + t.slice(0, 160).replace(/\n/g, ' ')); }
    const fontsOk = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('16px Manrope') && document.fonts.check('16px "Bricolage Grotesque"'); });
    if (!fontsOk) throw new Error('fonts missing offline');
    await ctx.setOffline(false);
  });
  await step('a newer version shows Update now, installs, and keeps the data', async () => {
    const before = await data();
    const next = current + '-test';
    build(next);
    if (!await page.evaluate(() => window.TP_APP.checkForUpdate())) throw new Error('no update offered');
    await page.waitForTimeout(300);
    if (!(await body()).includes('An update is ready (version ' + next + ')')) throw new Error('no banner');
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Update now' }).click()]);
    await page.waitForTimeout(1200);
    if (await page.evaluate(() => window.TP_APP.version) !== next) throw new Error('not updated');
    if (await data() !== before) throw new Error('data changed by the update');
    const snaps = await page.evaluate(() => JSON.parse(localStorage.getItem('tp:snapshots') || '[]'));
    if (!snaps.length || snaps[0].data !== before) throw new Error('no safety copy');
  });
  await step('every page renders', async () => {
    for (const n of ['Overview', 'Payday', 'Spending', 'Pots & debts', 'Month review', 'Travel', 'Sri Lanka', 'Big plans', 'Plan & settings']) {
      await page.locator('.rail button', { hasText: n }).first().click(); await page.waitForTimeout(150);
      if (await page.$('text=Something went wrong on this page')) throw new Error('error on ' + n);
    }
  });
  console.log(logs.length ? 'ERRORS: ' + logs.join(' | ') : 'no console errors');
  await browser.close(); server.close();
  build();
  console.log(fails ? fails + ' failure(s)' : 'all app checks passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
