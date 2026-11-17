const puppeteer = require('puppeteer-core');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, 'index.html');
let fails = 0;
function check(name, cond, extra) { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : '')); if (!cond) fails++; }

async function fresh(page) { await page.goto(URL); }
async function ev(page, key) { await page.click(`button.event[data-key="${key}"]`); }
async function opt(page, item, textStart) {
  const ok = await page.evaluate((item, t) => {
    const card = document.querySelector(`.item[data-item="${item}"]`); if (!card) return 'nocard';
    const b = [...card.querySelectorAll('button')].find(x => x.textContent.startsWith(t)); if (!b) return 'nobtn:' + [...card.querySelectorAll('button')].map(x => x.textContent).join('|');
    b.click(); return 'ok';
  }, item, textStart);
  if (ok !== 'ok') { console.log('FAIL click ' + item + ' / ' + textStart + ' -> ' + ok); fails++; }
}
async function st(page) {
  return page.evaluate(() => {
    const S = window.__ripple.state();
    const f = {}; S.facts.forEach(x => f[x.id] = { date: x.date ? new Date(x.date).toISOString().slice(0, 10) : null, status: S.status[x.id] });
    return { f, open: S.inbox.filter(i => !i.done).map(i => i.factId + ':' + i.kind), m: S.metrics,
      assumption: S.assumption, inboxCount: document.getElementById('inboxCount').textContent,
      guide: document.getElementById('guideTxt').textContent, agent: document.getElementById('agent').textContent, logN: S.log.length };
  });
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 1400, height: 1000 });

  // PATH A: happy path
  await fresh(page);
  let s = await st(page);
  check('initial: no open items', s.open.length === 0);
  check('initial: agent locked before jira', await page.$eval('button.event[data-key="agent"]', b => b.disabled));
  await ev(page, 'jira'); s = await st(page);
  check('cutover -> 16 Dec', s.f.cutover.date === '2026-12-16' && s.f.cutover.status === 'updated');
  check('traffic conflict', s.f.traffic.status === 'conflict' && s.f.traffic.date === '2026-12-09');
  check('rollback blocked', s.f.rollback.status === 'blocked');
  check('retire proposal', s.f.retire.status === 'pending');
  check('email proposal', s.f.email.status === 'pending');
  check('qa unaffected', s.f.qa.status === 'ok');
  check('3 open items', s.open.length === 3, s.open.join(','));
  check('checked = 6', s.m.checked === 6, JSON.stringify(s.m));
  await opt(page, 'traffic', 'Move to 16 Dec'); s = await st(page);
  check('traffic -> 16 Dec', s.f.traffic.date === '2026-12-16' && s.f.traffic.status === 'updated');
  check('rollback rule -> 19 Dec', s.f.rollback.date === '2026-12-19' && s.f.rollback.status === 'updated');
  check('rule metric 1', s.m.rule === 1);
  await ev(page, 'agent'); s = await st(page);
  check('assumption 15 Jan open', s.assumption && !s.assumption.done && new Date(s.assumption.value).toISOString().slice(0, 10) === '2027-01-15');
  check('agent warns pending', s.agent.includes('waiting on Dana'));
  await opt(page, 'retire', 'Confirm 15 Jan'); s = await st(page);
  check('retire -> 15 Jan', s.f.retire.date === '2027-01-15');
  check('assumption confirmed', s.assumption.done && s.agent.includes('now a fact'));
  await opt(page, 'email', 'Confirm 9 Dec'); s = await st(page);
  check('email -> 9 Dec', s.f.email.date === '2026-12-09');
  await ev(page, 'slack'); s = await st(page);
  check('slack claim open, cutover unchanged', s.open.includes('cutover-claim:claim') && s.f.cutover.date === '2026-12-16');
  await opt(page, 'cutover-claim', "It's wrong"); s = await st(page);
  check('slack wrong -> nothing open', s.open.length === 0 && s.inboxCount === '0');
  await ev(page, 'github'); s = await st(page);
  check('github no change', s.open.length === 0);
  check('final guide message', s.guide.includes('full loop'));

  // PATH B: challenge, Dana moves cutover back
  await fresh(page); await ev(page, 'jira');
  await opt(page, 'traffic', 'Keep 9 Dec'); s = await st(page);
  check('B: cutover conflict for Dana', s.open.includes('cutover:conflict'));
  check('B: rollback unblocked after challenge', s.f.rollback.status === 'ok');
  check('B: guide explains challenge', s.guide.includes('challenged'));
  await opt(page, 'cutover', 'Move cutover back to 9 Dec'); s = await st(page);
  check('B: cutover -> 9 Dec', s.f.cutover.date === '2026-12-09');
  check('B: traffic consistent', s.f.traffic.status !== 'conflict');
  check('B: retire proposal refreshed (one open)', s.open.filter(x => x.startsWith('retire')).length === 1);
  const btns = await page.evaluate(() => [...document.querySelectorAll('.item[data-item="retire"] button')].map(b => b.textContent));
  check('B: retire proposal now 8 Jan', btns[0] === 'Confirm 8 Jan', btns.join('|'));
  const ebtn = await page.evaluate(() => [...document.querySelectorAll('.item[data-item="email"] button')].map(b => b.textContent));
  check('B: email proposal now 2 Dec', ebtn[0] === 'Confirm 2 Dec', ebtn.join('|'));

  // PATH B2: challenge, Dana keeps
  await fresh(page); await ev(page, 'jira');
  await opt(page, 'traffic', 'Keep 9 Dec'); await opt(page, 'cutover', 'Keep 16 Dec'); s = await st(page);
  check('B2: traffic conflict raised again', s.open.includes('traffic:conflict'));
  check('B2: rollback blocked again', s.f.rollback.status === 'blocked');
  await opt(page, 'traffic', 'Move to 23 Dec'); s = await st(page);
  check('B2: traffic 23 Dec, rollback 26 Dec', s.f.traffic.date === '2026-12-23' && s.f.rollback.date === '2026-12-26');

  // PATH C: assumption rejected
  await fresh(page); await ev(page, 'jira'); await ev(page, 'agent');
  await opt(page, 'retire', 'Keep 1 Jan'); s = await st(page);
  check('C: assumption rejected', s.assumption.done && s.agent.includes('rejected'));
  check('C: retire kept 1 Jan', s.f.retire.date === '2027-01-01' && s.f.retire.status === 'ok');

  // PATH D: slack is right
  await fresh(page); await ev(page, 'jira'); await opt(page, 'traffic', 'Move to 16 Dec');
  await ev(page, 'slack'); await opt(page, 'cutover-claim', "It's right"); s = await st(page);
  check('D: cutover 23 Dec', s.f.cutover.date === '2026-12-23');
  check('D: traffic conflict again', s.open.includes('traffic:conflict'));
  check('D: retire/email refreshed, single each', s.open.filter(x => x.startsWith('retire')).length === 1 && s.open.filter(x => x.startsWith('email')).length === 1, s.open.join(','));

  // Reset works
  await page.click('#resetBtn'); s = await st(page);
  check('reset clears', s.open.length === 0 && s.f.cutover.date === '2026-12-02' && s.logN === 0);

  // Mobile
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await fresh(page); await ev(page, 'jira');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('mobile: no horizontal overflow', overflow <= 0, 'overflow=' + overflow);

  // Map + median
  await page.setViewport({ width: 1400, height: 1000 });
  await fresh(page); await ev(page, 'jira');
  const mp = await page.evaluate(() => ({ nodes: document.querySelectorAll('#map g.node').length, conflict: document.querySelector('#map g[data-node="traffic"]').getAttribute('class'), blocked: document.querySelector('#map g[data-node="rollback"]').getAttribute('class'), free: document.querySelector('#map g[data-node="spec"]').getAttribute('class'), edges: document.querySelectorAll('#map path.edge').length, med: document.getElementById('mMedian').textContent }));
  check('map: 8 nodes, 5 edges', mp.nodes === 8 && mp.edges === 5, JSON.stringify(mp));
  check('map: traffic shows conflict', mp.conflict.includes('conflict'));
  check('map: rollback shows blocked', mp.blocked.includes('blocked'));
  check('map: spec shown unlinked', mp.free.includes('free'));
  check('median empty before settling', mp.med === '\u2013');
  await opt(page, 'traffic', 'Move to 16 Dec');
  const md = await page.$eval('#mMedian', e => e.textContent);
  check('median after one settle = 6', md === '6', md);
  check('no console/page errors', errors.length === 0, errors.join(' | '));
  console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
  await browser.close();
})();
