// Takes a screenshot of every candidate site that is online and writes sites.json.
// Usage: npm i playwright && npx playwright install --with-deps chromium && node scripts/screenshots.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const candidates = JSON.parse(fs.readFileSync('sites.candidates.json', 'utf8'));
const DEAD = /(account suspended|conta suspensa|domain (is )?(for sale|expired|parked)|this domain|dom[ií]nio (expirado|à venda)|index of \/|site not found|404 not found|hostinger.*parked|default web page|coming soon)/i;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
const live = [];
const seen=new Set();
for (const s of candidates) {
  if (seen.has(s.title)) { continue; }
  const page = await ctx.newPage();
  let status = 'offline';
  try {
    const res = await page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(4000);
    const code = res ? res.status() : 0;
    const text = ((await page.title()) + ' ' + (await page.locator('body').innerText().catch(() => ''))).slice(0, 4000);
    if (code >= 400) status = 'http ' + code;
    else if (DEAD.test(text) || text.trim().length < 80) status = 'parked/empty';
    else {
      // close common cookie banners so the shot is clean
      for (const label of ['Aceitar', 'Accept', 'Concordo', 'OK', 'Entendi']) {
        const b = page.getByRole('button', { name: new RegExp('^' + label, 'i') }).first();
        if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); break; }
      }
      await page.screenshot({ path: `assets/sites/${s.slug}.jpg`, type: 'jpeg', quality: 72 });
      live.push({ ...s, image: `assets/sites/${s.slug}.jpg` });
      status = 'ok';
    }
  } catch (e) {
    status = 'error: ' + String(e.message).split('\n')[0].slice(0, 80);
  }
  if (status !== 'ok' && s.static_image) { live.push({ ...s, image: s.static_image }); status = 'static-image'; }
  if (live.some(x => x.slug === s.slug)) seen.add(s.title);
  console.log(`${status.padEnd(16)} ${s.url}`);
  await page.close();
}
await browser.close();
fs.writeFileSync('sites.json', JSON.stringify(live, null, 2));
console.log(`\n${live.length} of ${candidates.length} sites online -> sites.json`);
