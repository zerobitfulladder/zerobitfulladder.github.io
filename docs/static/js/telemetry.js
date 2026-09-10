/* The host's panel, in the top bar on a pointer screen.

   Two halves, and only one of them answers to the reader. The reactor runs
   on its own: a plasma whose core temperature climbs and collapses in a
   sawtooth, a field held on its set point and knocked off it by each
   collapse, and a cell whose output dips with it. The machine is the other
   half: input arriving on the line lights RX and loads the processor, a page
   drawn back down the line lights TX, and a document opened is a document
   loaded into core.

   Nothing here runs on a loop. Every quantity is held on its set point and
   pushed about by noise, and every event is drawn when it happens, so the
   panel never shows the same few seconds twice. Left alone it is quiet on
   purpose: the noise is small and slow, so that what the reader does stands
   out against it. */

import { $, $$ } from './dom.js';
import { touch } from './view.js';
import { isCrashed } from './boot.js';

const bar = $('#topbar'), crumb = $('#crumb'), spacer = $('#topbar .spacer');
const panel = $('#telemetry');

/* ── chance ───────────────────────────────────────────────────── */
const uniform = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const happens = (perSecond, dt) => Math.random() < perSecond * dt;
function gauss(){
  let u = 0;
  while (!u) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}
/** Pulled back towards its set point and pushed about by noise, so it
    wanders by about `spread` and recovers at `rate` per second. */
const settle = (x, mean, rate, spread, dt) =>
  x + rate * (mean - x) * dt + spread * Math.sqrt(2 * rate * dt) * gauss();
const fade = (x, tau, dt) => x * Math.exp(-dt / tau);

/* ── the reactor ──────────────────────────────────────────────── */
const FIELD_SET = 12.21, CELL_SET = 140;
const plasma = {t: uniform(146, 148.5), rate: uniform(.25, .6), crashAt: 149.2};
let field = FIELD_SET, fieldKick = 0, cell = CELL_SET, cellDip = 0;

/* The temperature at the plasma's core climbs until the core lets go and
   dumps its heat outward, then climbs again. Each tooth is drawn fresh, and
   now and then the core only half lets go. */
function crash(){
  const partial = Math.random() < .15, k = partial ? .4 : 1;
  plasma.t = Math.max(145, plasma.t - (partial ? uniform(1, 1.6) : uniform(2.8, 4.2)));
  plasma.rate = uniform(.25, .6);
  plasma.crashAt = Math.max(clamp(148.8 + .6 * gauss(), 147.8, 150.6), plasma.t + uniform(1, 2));
  fieldKick += k * uniform(.018, .032);
  cellDip += k * uniform(.4, .9);
}

function reactor(dt){
  plasma.t += plasma.rate * dt + .04 * Math.sqrt(dt) * gauss();
  if (plasma.t >= plasma.crashAt) crash();
  fieldKick = fade(fieldKick, .18, dt);
  cellDip = fade(cellDip, .3, dt);
  field = settle(field, FIELD_SET, .6, .003, dt);
  cell = settle(cell, CELL_SET, .2, .1, dt);
}

/* ── the machine ──────────────────────────────────────────────── */
const KERNEL = 22;                 // K words the system keeps resident
/* Events hand the processor work, in seconds. While there is work it is
   busy, though never evenly: it stalls on the line and on core, so each
   moment is busy by a different amount. The meter follows the way a load
   meter does, up at once and back down more slowly, so a spike jumps, shakes
   for as long as the work lasts, and falls away as soon as it is done. How
   high it gets depends on how much work there was. */
const ATTACK = .06, RELEASE = .18;

/* Work the processor cannot keep up with is not saved for later: a redraw
   still waiting when the next one arrives is replaced by it. So each kind of
   work fills the queue only up to its own small limit, and a burst of
   scrolling leaves at most a moment's worth behind it, not seconds. */
function queue(seconds, limit){
  if (work < limit) work = Math.min(limit, work + seconds);
}
let idle = 7, work = 0, meter = 0;
let resident = KERNEL + 4, transient = 0, drift = 0;
let drawnAt = 0;

/* The line lamps blink at random, a little all the time and fast when the
   line is busy. Traffic raises a lamp's rate; the rate is held while the
   traffic lasts and then eases back down to the idle flicker. */
const lamp = base => ({base, extra: 0, hold: 0, lit: false});
const rx = lamp(1.2), tx = lamp(.9);
const BUSY = 14;                      // blinks a second on a busy line

function traffic(l, rate, until){
  l.extra = Math.max(l.extra, rate);
  l.hold = Math.max(l.hold, until);
}

function blink(l, dt, now){
  if (now >= l.hold) l.extra = fade(l.extra, .3, dt);
  // a lamp that was lit goes dark for at least a moment, or a fast line
  // would read as one long glow rather than as blinking
  l.lit = !l.lit && happens(l.base + l.extra, dt);
}

function machine(dt, now){
  idle = clamp(settle(idle, 6, .3, 1.2, dt), 2, 20);
  if (happens(.06, dt)) queue(uniform(.03, .12), .15);   // something of its own wakes
  const busy = Math.min(dt * uniform(.55, 1), work);
  work -= busy;
  const load = busy / dt;
  meter += (load - meter) * (1 - Math.exp(-dt / (load > meter ? ATTACK : RELEASE)));
  transient = fade(transient, 1.2, dt);
  drift = settle(drift, 0, .1, .3, dt);
  blink(rx, dt, now);
  blink(tx, dt, now);
}

const cpu = () => clamp(idle + (100 - idle) * meter, 0, 99);
const core = () => clamp(resident + transient + drift, KERNEL, 63);

/** A key, a click, a notch of the wheel: something came in on the line. */
function received(weight = 1){
  const now = performance.now();
  traffic(rx, BUSY * Math.max(weight, .4), now + uniform(40, 120));
  queue(weight * uniform(.02, .06), .12);
}

/** The view moved, so the machine sends the terminal what it now shows. */
function scrolled(){
  const now = performance.now();
  traffic(tx, BUSY * .7, now + 120);
  queue(uniform(.004, .012), .06);
}

/* A page drawn is the expensive thing the machine does: the document is
   read into core, set to the terminal's width and sent down the line. What
   stays resident afterwards is what is actually on screen. */
const PANES = ['#listCol', '#doc2', '#doc3'].map(sel => $(sel));
function drawn(){
  const now = performance.now();
  const chars = PANES.reduce((n, el) => n + (el.hidden ? 0 : el.textContent.length), 0);
  const media = PANES.reduce((n, el) => n + (el.hidden ? 0 : el.querySelectorAll('img,video').length), 0);
  resident = KERNEL + chars / 2048 + media * .5;     // two bytes to the word
  if (now - drawnAt < 100) return;                   // one page, however many writes
  drawnAt = now;
  queue(uniform(.08, .22) + chars / 60000, .25);  // longer pages take longer to set
  traffic(tx, BUSY, now + clamp(250 + chars / 12, 250, 1400));   // the page going down the line
  transient = Math.min(24, transient + uniform(10, 18));
}

const drawing = new MutationObserver(drawn);
PANES.forEach(el => drawing.observe(el, {childList: true}));

/* A smaller job: the focus moved to another column, so the highlights and
   the status line are drawn again but no document is. The pointer crossing
   into a column is input too, so the line lights both ways. */
let restyledAt = 0;
function restyled(){
  const now = performance.now();
  if (now - restyledAt < 60 || now - drawnAt < 100) return;   // a page counts once
  restyledAt = now;
  queue(uniform(.015, .04), .08);
  traffic(rx, BUSY * .4, now + 40);
  traffic(tx, BUSY * .6, now + 100);
}

const styling = new MutationObserver(restyled);
['#col1', '#col2', '#col3'].forEach(sel =>
  styling.observe($(sel), {attributes: true, attributeFilter: ['class']}));

addEventListener('keydown', () => received(), {capture: true, passive: true});
addEventListener('pointerdown', () => received(), {capture: true, passive: true});
addEventListener('wheel', () => received(.15), {capture: true, passive: true});
document.addEventListener('scroll', scrolled, {capture: true, passive: true});

/* ── painting ─────────────────────────────────────────────────── */
const SEGS = 12, NEEDLE = 11;
const out = {
  cell: $('#tCell'), plasma: $('#tPlasma'), field: $('#tField'), needle: $('#tNeedle'),
  core: $('#tCore'), cpu: $('#tCpu'), tx: $('#tTx'), rx: $('#tRx'),
};
const segments = el => { el.innerHTML = '<i></i>'.repeat(SEGS); return [...el.children]; };
const coreBar = segments($('#tCoreBar')), cpuBar = segments($('#tCpuBar'));

const fill = (segs, frac) => {
  const n = Math.round(clamp(frac, 0, 1) * segs.length);
  segs.forEach((s, i) => s.classList.toggle('on', i < n));
};
const set = (el, text) => { if (el.textContent !== text) el.textContent = text; };

// a needle sitting between two marks would flick back and forth between
// them, so it only leaves a mark once it is most of the way to the next
let needleAt = -1;
function needle(x){
  const at = clamp((NEEDLE - 1) / 2 * (1 + x), 0, NEEDLE - 1);
  if (needleAt >= 0 && Math.abs(at - needleAt) < .9) return;
  const m = Math.round(at);
  if (m === needleAt) return;
  needleAt = m;
  out.needle.innerHTML = `<span class="f">[${'-'.repeat(m)}</span><span class="hi">|</span>`
    + `<span class="f">${'-'.repeat(NEEDLE - 1 - m)}]</span>`;
}


/* A figure only moves when its value has moved by more than a little, the
   way a meter's last digit is steadied, so the panel holds still until
   something actually happens and then answers at once. */
const shown = {};
function figure(el, key, value, dead, text){
  if (key in shown && Math.abs(value - shown[key]) < dead) return;
  shown[key] = value;
  set(el, text(value));
}

function paint(now){
  const b = field + fieldKick;
  needle((b - FIELD_SET) / .04);
  fill(coreBar, core() / 64);
  fill(cpuBar, cpu() / 100);
  out.tx.classList.toggle('on', tx.lit);
  out.rx.classList.toggle('on', rx.lit);
  figure(out.cell, 'cell', cell - cellDip, .3, v => v.toFixed(1) + ' MW');
  figure(out.plasma, 'plasma', plasma.t, .5, v => v.toFixed(1) + ' MK');
  figure(out.field, 'field', b, .012, v => v.toFixed(2) + ' T');
  figure(out.core, 'core', core(), 1, v => Math.round(v) + 'K');
  figure(out.cpu, 'cpu', cpu(), 3, v => String(Math.round(v)).padStart(2) + '%');
}

/* ── fitting ──────────────────────────────────────────────────── */
/* The path beside INDIGO is what the reader is looking at, so the panel
   gives way to it: groups drop out, least important first, until the path
   is whole and there is a gap between them. */
const groups = $$('.g', panel).sort((a, b) => a.dataset.rank - b.dataset.rank);
const crowded = () =>
  crumb.scrollWidth > crumb.clientWidth || spacer.getBoundingClientRect().width < 24;

function fit(){
  if (touch.matches || bar.hidden) return;
  groups.forEach(g => g.hidden = false);
  for (const g of groups){
    if (!crowded()) break;
    g.hidden = true;
  }
}

new ResizeObserver(fit).observe(bar);
new MutationObserver(fit).observe(crumb, {childList: true, subtree: true, characterData: true});
touch.addEventListener('change', fit);
document.fonts?.ready.then(fit);

/* ── running ──────────────────────────────────────────────────── */
/* A panic stops the machine, and the panel with it: the reader can scroll
   back up through the dump to the page, and finds the readings exactly as
   they stood when it went down, the annunciator caught wherever it was. */
const TICK = 80;
let last = performance.now();
paint(last);
setInterval(() => {
  const now = performance.now(), dt = Math.min(.5, (now - last) / 1000);
  last = now;
  if (isCrashed()){ panel.classList.add('frozen'); return; }
  if (document.hidden || bar.hidden || touch.matches) return;
  reactor(dt);
  machine(dt, now);
  paint(now);
}, TICK);
