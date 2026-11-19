// Collects state- and DISCOM-wise figures from the public NFMS dashboard
// (https://nfms.powermin.gov.in/dashboard) by opening it in a headless browser,
// choosing each State/UT and DISCOM in its own drop-downs, and recording the
// figures the page itself loads. Writes data/latest.json, data/latest.csv and
// appends to data/history.csv.
//
// Usage: node scripts/collect.mjs            (all states)
//        STATES=BR,UP node scripts/collect.mjs (a few, for testing)

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { buildRow, COLUMNS, STATE_NAMES } from './parse.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'data');
const URL_DASH = 'https://nfms.powermin.gov.in/dashboard';
const WANT = ['DashboardTile', 'FeederStatsV2', 'AvgPowerSupDur', 'FeederCommTech'];
const ONLY = (process.env.STATES || '').split(',').map((s) => s.trim()).filter(Boolean);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function bodyKey(req) {
  try {
    const b = JSON.parse(req.postData() || '{}');
    return `${b.State || b.state_name || ''}|${b.Discom || b.discomId || ''}`;
  } catch { return '|'; }
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  // Every figure the page loads, keyed "STATE|DISCOM" -> endpoint -> parsed JSON
  const got = {};
  page.on('response', async (res) => {
    const u = res.url();
    if (!u.includes('nfmsweb-prod-api')) return;
    const ep = u.split('?')[0].split('/').pop();
    if (!WANT.includes(ep)) return;
    try {
      const j = await res.json();
      const k = bodyKey(res.request());
      (got[k] = got[k] || {})[ep] = j;
    } catch { /* ignore non-JSON */ }
  });

  const resp = await page.goto(URL_DASH, { waitUntil: 'networkidle', timeout: 120000 });
  if (!resp || resp.status() >= 400) throw new Error(`NFMS dashboard returned HTTP ${resp && resp.status()}`);
  await page.waitForSelector('select', { timeout: 60000 });
  await wait(3000);

  // The "Hours of Supply" State/UT + Discom pair: the last select that lists BR, and the one after it
  const pair = await page.evaluate(() => {
    const s = [...document.querySelectorAll('select')];
    let idx = -1;
    s.forEach((el, i) => { if ([...el.options].some((o) => o.value === 'BR')) idx = i; });
    return idx;
  });
  if (pair < 0) throw new Error('State drop-down not found on NFMS dashboard');
  const stateSel = page.locator('select').nth(pair);
  const discomSel = page.locator('select').nth(pair + 1);

  let states = await stateSel.evaluate((el) => [...el.options].map((o) => o.value).filter((v) => v && v !== 'ALL'));
  if (ONLY.length) states = states.filter((s) => ONLY.includes(s));
  const utility = {}; // single-utility states: state -> DISCOM name

  const settle = async (key) => {
    // wait until all four figures for this selection have arrived (or 25 s)
    for (let t = 0; t < 50; t++) {
      if (got[key] && WANT.every((e) => got[key][e])) return true;
      await wait(500);
    }
    return false;
  };

  for (const st of [...states, 'ALL']) {
    await stateSel.selectOption(st);
    const ok = await settle(`${st}|ALL`);
    console.log(`${st}: ${ok ? 'ok' : 'incomplete'}`);
    if (st === 'ALL') continue;
    // let the DISCOM list fill
    let ds = [];
    for (let t = 0; t < 20; t++) {
      ds = await discomSel.evaluate((el) => [...el.options].map((o) => o.value).filter((v) => v && v !== 'ALL'));
      if (ds.length) break;
      await wait(300);
    }
    if (ds.length === 1) utility[st] = ds[0];
    if (ds.length > 1) {
      for (const d of ds) {
        await discomSel.selectOption(d);
        const okd = await settle(`${st}|${d}`);
        console.log(`  ${st}/${d}: ${okd ? 'ok' : 'incomplete'}`);
      }
    }
  }
  await browser.close();

  // Build rows
  const multi = new Set(Object.keys(got).filter((k) => !k.endsWith('|ALL')).map((k) => k.split('|')[0]));
  const fetchedAt = new Date();
  const rows = [];
  for (const [key, eps] of Object.entries(got)) {
    const [st, ds] = key.split('|');
    if (!st || !ds) continue;
    if (st === 'ALL' && ds !== 'ALL') continue;
    if (!STATE_NAMES[st]) continue;
    rows.push(buildRow(st, ds, eps, { multi: multi.has(st), utility: utility[st] }));
  }
  rows.sort((a, b) => (a.state_code === 'ALL' ? -1 : b.state_code === 'ALL' ? 1 : a.key.localeCompare(b.key)));

  const stateRows = rows.filter((r) => r.level === 'State');
  if (!ONLY.length && stateRows.length < 25) {
    throw new Error(`Only ${stateRows.length} states collected - keeping previous data`);
  }
  if (!rows.find((r) => r.key === 'BR|ALL')) throw new Error('Bihar figures missing - keeping previous data');

  fs.mkdirSync(DATA, { recursive: true });
  const istDate = new Date(fetchedAt.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const out = { source: URL_DASH, fetched_at: fetchedAt.toISOString(), snapshot_date: istDate, columns: COLUMNS, rows };
  if (ONLY.length) {
    fs.writeFileSync(path.join(DATA, 'test.json'), JSON.stringify(out, null, 1));
    console.log('Test run: wrote data/test.json only');
    return;
  }
  fs.writeFileSync(path.join(DATA, 'latest.json'), JSON.stringify(out, null, 1));
  const csv = (r) => COLUMNS.map((c) => {
    const v = r[c] === null || r[c] === undefined ? '' : String(r[c]);
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',');
  fs.writeFileSync(path.join(DATA, 'latest.csv'), [COLUMNS.join(','), ...rows.map(csv)].join('\n') + '\n');

  // history: one block of rows per IST date; a re-run on the same date replaces it
  const hp = path.join(DATA, 'history.csv');
  const hcols = ['snapshot_date', ...COLUMNS];
  let lines = fs.existsSync(hp) ? fs.readFileSync(hp, 'utf8').trim().split('\n') : [];
  if (!lines.length || lines[0] !== hcols.join(',')) lines = [hcols.join(',')];
  lines = [lines[0], ...lines.slice(1).filter((l) => !l.startsWith(istDate + ','))];
  rows.forEach((r) => lines.push(`${istDate},${csv(r)}`));
  fs.writeFileSync(hp, lines.join('\n') + '\n');
  console.log(`Saved ${rows.length} rows for ${istDate}`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
