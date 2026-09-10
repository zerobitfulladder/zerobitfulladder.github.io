/* The machine's own screens: the power-on sequence, and the panic.

   INDIGO is a small, slow, word-addressed machine running something very like
   an early Unix, and the reader is not sitting at it — they are on a terminal
   at the far end of a serial line. That split is what lets every line here
   stay true while the machine stays small: the host's specifications are
   properties of the host, and everything measured about the terminal is
   measured about the reader's own browser.

   The documents the machine holds are real. The machine is not. */

//: The host. Small core, slow clock, and a reactor that outlives all of it.
const HOST = {
  model: 'INDIGO-1',
  word: 16,
  core: '64 KWORD',
  clock: '1.2 MHz',
  line: '9600 BAUD',
  trap: '004',
  power: 'FUSION CELL',
};

import { $, esc } from './dom.js';
import { ROOT, S, SETTINGS, BUILD, COMMIT, isDir } from './tree.js';
import { DOTS, PHOSPHORS, cells, phosphor, reduced } from './screen.js';
import { grid } from './banner.js';

const PANES = ['#topbar', '#stage', '#botbar'];

let timer = null, active = false, crashed = false, onReady = () => {};

export const booting = () => active;
export const isCrashed = () => crashed;

export function showTerm(){ PANES.forEach(sel => $(sel).hidden = false); }

/* A leader is only a leader if it reaches the far margin. 44 columns is the
   line this was written for, but a phone is narrower than that and the whole
   right-hand side of the sequence — every value the machine reports — was
   printed past the edge of the tube. So the line is padded to whatever the
   terminal actually measures, and only capped at 44. */
function pad(k, v){
  const w = Math.min(44, Math.max(24, cells().cols - 4));
  return k + ' ' + DOTS.slice(0, Math.max(2, w - k.length - v.length)) + ' ' + v;
}

/** One printed line: its markup, and how long the machine dwells after it. */
const line = (html, delay = 24) => ({html, delay});

/** A line the machine sits on, dots running, before the flood resumes. */
const stall = (html, hold) => ({html, delay: 0, hold});

/** Print lines into the log one at a time, scrolling the pane as it fills. */
function typeLines(el, lines, done){
  let i = 0;
  (function next(){
    if (i >= lines.length) return done?.();
    const dwell = lines[i++].delay;
    el.innerHTML = lines.slice(0, i).map(l => l.html).join('\n');
    const pane = $('#boot');
    pane.scrollTop = pane.scrollHeight;
    timer = setTimeout(next, dwell);
  })();
}

const documents = nodes =>
  nodes.reduce((n, node) => n + (isDir(node) ? documents(node.children) : 1), 0);

/* A machine that went down badly says so when it comes back. The record is
   written the moment the panic starts, so closing the tab still counts, and
   it is consumed on the next boot — reported once, then forgotten. */
const PANIC_KEY = 'indigo:panic';
const STOP = `TRAP ${HOST.trap}`;

function recordPanic(){
  try {
    localStorage.setItem(PANIC_KEY, JSON.stringify({
      stop: STOP, at: Date.now(), where: location.hash.slice(1) || ROOT[0]?.id || '',
    }));
  } catch {}
}

function takeLastPanic(){
  try {
    const raw = localStorage.getItem(PANIC_KEY);
    if (!raw) return null;
    localStorage.removeItem(PANIC_KEY);
    return JSON.parse(raw);
  } catch { return null; }
}

const stamp = ms => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

/* ── power on ─────────────────────────────────────────────────
   Every line is a real probe. Where the machine cannot answer, it says so
   rather than printing OK, so the sequence never claims something the
   browser has not actually given us. ─────────────────────────── */

const ok = v => v ? 'OK' : 'ABSENT';

function webgl2(){
  try {
    return !!document.createElement('canvas').getContext?.('webgl2');
  } catch { return false; }
}

function storageWorks(){
  try { localStorage.setItem('indigo:probe', '1'); localStorage.removeItem('indigo:probe'); return true; }
  catch { return false; }
}

function transferred(){
  const entries = performance?.getEntriesByType?.('resource') ?? [];
  const bytes = entries.reduce((n, e) => n + (e.transferSize || e.decodedBodySize || 0), 0);
  return [entries.length, bytes];
}

function bootLines(){
  const ph = String(phosphor() || '').toUpperCase();
  const nav = globalThis.navigator ?? {};
  const tty = cells();
  const zone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } })();
  const pointer = globalThis.matchMedia?.('(hover:hover)')?.matches ? 'KEYBOARD · POINTER' : 'KEYBOARD · TOUCH';

  const L = [];
  const put = (t, d = 20) => L.push(line(t, d));
  const raw = (html, d = 20) => L.push(line(html, d));
  const head = t => L.push(line(`<span class="d">${t}</span>`, 70));
  const gap = () => L.push(line('', 14));

  raw(`<span class="hi">INDIGO 0.1.0</span>  ${HOST.model} · SINGLE USER`, 60);
  raw(`<span class="d">BUILD ${COMMIT} · ${BUILD}</span>`, 90);
  gap();

  head('SELF TEST');
  put(pad('POWER-ON SELF TEST', 'OK'));
  put(pad('POWER', `${HOST.power} · NOMINAL`));
  put(pad('CORE', HOST.core));
  put(pad('PROCESSOR', `${HOST.word} BIT · ${HOST.clock}`));
  put(pad('CHARACTER ROM', document.fonts?.check?.('1em VT323') ? 'OK' : 'LOADING'));
  put(pad('PHOSPHOR', `${ph} · ${PHOSPHORS.length} RAMPS`));
  put(pad('RASTER', 'SCANLINE 1:3 · ON'), 70);
  gap();

  head('LINE');
  put(pad('TTY', `${tty.cols}x${tty.rows} CELLS`));
  put(pad('RATE', HOST.line));
  put(pad('INPUT', pointer));
  put(pad('MOTION', reduced.matches ? 'REDUCED' : 'FULL'));
  put(pad('LOCALE', `${String(nav.language || '??').toUpperCase()} · ${zone.toUpperCase()}`), 70);
  gap();

  head('SUBSYSTEMS');
  put(pad('TYPESETTER', 'DEFERRED'));
  put(pad('RASTER UNIT', ok(webgl2())));
  put(pad('SCAN UNIT', 'DEFERRED'));
  put(pad('NVRAM', ok(storageWorks())), 70);
  gap();

  head('MOUNTING');
  for (const n of ROOT.filter(isDir))
    put(pad('/' + n.id, `${n.children.length} ENTR${n.children.length === 1 ? 'Y' : 'IES'}`), 16);
  put(pad('DOCUMENTS', `${documents(ROOT)} TOTAL`), 16);
  put(pad('STORE', `${storeBytes()} BYTES`), 70);
  gap();

  head('RESTORING');
  put(pad('PHOSPHOR', ph));
  put(pad('COLUMNS', S.cols.map(v => v.toFixed(2)).join(':')), 70);

  L.push(...lastShutdown());
  gap();
  put(pad('OPERATOR', SETTINGS.operator || ''), 90);
  gap();
  raw(`<span class="hi">HANDING OFF TO INIT</span>`, 0);
  return L;
}

/** Everything the machine holds, in bytes — small, and honestly counted. */
function storeBytes(){
  const size = n => Number(String(n.v).replace(/[^\d.]/g, '')) * 1024 || 0;
  const walk = nodes => nodes.reduce(
    (b, n) => b + (isDir(n) ? walk(n.children) : size(n)), 0);
  return String(Math.round(walk(ROOT)));   // ls -l prints raw bytes
}

/** What the previous session left behind, if it did not come down cleanly. */
function lastShutdown(){
  const last = takeLastPanic();
  if (!last) return [];
  return [
    line('', 30),
    line(`<span class="hi">*** UNCLEAN SHUTDOWN DETECTED</span>`, 160),
    line(`<span class="d">LAST PANIC ${last.stop} AT ${stamp(last.at)} · /${last.where}</span>`, 160),
    line(pad('CHECKING FILESYSTEMS', `${documents(ROOT)} DOCUMENTS OK`), 24),
    line(pad('JOURNAL REPLAY', 'DONE'), 70),
  ];
}

export function finishBoot(){
  if (!active || crashed) return;   // there is no escaping a panic
  active = false;
  clearTimeout(timer);
  $('#boot').hidden = true;
  showTerm();
  onReady();
}

export function boot(ready){
  if (ready) onReady = ready;
  const el = $('#bootlog'), lines = bootLines();
  $('#boot').hidden = false;
  $('#boot').classList.remove('panic');
  PANES.forEach(sel => $(sel).hidden = true);
  active = true;

  if (reduced.matches){
    el.innerHTML = lines.map(l => l.html).join('\n');
    timer = setTimeout(finishBoot, 400);
    return;
  }

  el.innerHTML = '';
  typeLines(el, lines, hold);

  /* The sequence is worth reading, so it sits on screen for a second with
     dots running on from the last line — which names what the machine is
     doing during that wait, rather than claiming to be done. Any key cuts
     it short. */
  function hold(){
    const STEP = 45, RUN = 420, head = lines.slice(0, -1).map(l => l.html).join('\n');
    const last = lines[lines.length - 1].html;
    const started = performance.now();
    let dots = 0;
    (function tick(){
      el.innerHTML = head + '\n'
        + last.replace('</span>', '.'.repeat(dots) + '</span>')
        + '<span class="cur">&nbsp;</span>';
      if (performance.now() - started >= RUN){ timer = setTimeout(finishBoot, 90); return; }
      dots++;
      timer = setTimeout(tick, STEP);
    })();
  }
}

/* ── panic ────────────────────────────────────────────────────
   The button is wired to nothing, which is the joke: pressing it takes the
   machine down. The dump is written beneath the console and walks it up off
   the top, the way a flooded tty scrolls whatever was drawing on it. What it
   dumps is real — the loaded modules, the mounted tree, and the page's own
   text read back as bytes. ─────────────────────────────────── */

/** Classic 16-bytes-per-row dump, so the page's text is legible in the gutter. */
/** `od` as a word machine prints it: octal offset, octal bytes, the text. */
function coredump(text, rows){
  const bytes = new TextEncoder().encode(text);
  const out = [];
  for (let i = 0; i < rows * 8 && i < bytes.length; i += 8){
    const slice = [...bytes.slice(i, i + 8)];
    const cols = slice.map(b => oct(b, 3)).join(' ')
      + ' '.repeat((8 - slice.length) * 4);
    const ascii = slice.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
    out.push(`<span class="d">${oct(i, 6)}  ${cols}</span>  |${esc(ascii)}|`);
  }
  return out;
}

/* The name banner's block font, set in characters rather than pixels: a
   console has cells, not a canvas, and a panic should be the loudest thing
   the machine ever prints. */
const BANNER_INK = '@';
const bannerRows = text => grid(text)
  .map(row => row.replace(/#/g, BANNER_INK).replace(/\./g, ' ').replace(/\s+$/, ''));

/* A 16-bit machine counts in octal, and so did the Unix that ran on one:
   six-digit addresses, R0-R5 with SP and PC, bytes in threes. */
const oct = (n, w) => n.toString(8).padStart(w, '0');
const addr = () => oct(Math.floor(Math.random() * 0o177777), 6);

/** The scripts the browser really fetched, so the module list is not a prop. */
function loadedModules(){
  const entries = performance?.getEntriesByType?.('resource') ?? [];
  return entries
    .filter(e => e.name.endsWith('.js'))
    .map(e => {
      const name = e.name.split('/').pop().replace(/\.js$/, '');
      const size = e.transferSize || e.decodedBodySize || 0;
      return ` ${name.padEnd(14)}${String(Math.round(size / 1024) + 'K').padStart(5)}  ${addr()}  loaded`;
    });
}

function panicLines(){
  const ph = String(phosphor() || '').toUpperCase();
  const reader = $('#doc2')?.textContent || $('#doc3')?.textContent || '';
  const every = nodes => nodes.flatMap(n =>
    [`${n.path} ${n.src} ${n.v} ${n.modified || ''}`, ...(isDir(n) ? every(n.children) : [])]);
  const core = [reader, ...every(ROOT), SETTINGS.description || '']
    .join(' ')
    .replace(/\s+/g, ' ')
    // dotted leaders are 400 characters each, and a dump that is all 2e is
    // no fun to read: keep the run, lose the wall
    .replace(/(.)\1{3,}/gu, '$1$1$1$1')
    .trim();

  /* Two paces and one long hold. The opening is slow enough to read — the
     banner, what went wrong, and the registers — and slow enough to watch the
     interface climb off the top. Then it stops dead for a moment, and after
     that everything floods, because the flood is the point and none of it is
     lost: the finished dump can be scrolled back through. */
  const SLOW = 34, FAST = 6;

  const L = [];
  let pace = SLOW;
  const put = (html, delay = pace) => L.push(line(html, delay));
  const dim = (t, d) => put(`<span class="d">${t}</span>`, d);
  const gap = () => put('', Math.round(pace * 0.8));
  const head = t => put(`<span class="d">${t}</span>`, pace * 2);

  for (const row of bannerRows('KERNEL PANIC')) put(`<span class="hi">${row}</span>`, 40);
  gap();
  put(`<span class="hi">KERNEL PANIC - NOT SYNCING: ATTEMPTED TO KILL INIT, ${STOP}</span>`, 260);
  gap();
  dim(`PID 1  COMM indigo  ${HOST.model}  NOT TAINTED  0.1.0`);
  dim(`CONSOLE ${ph} PHOSPHOR ON ${HOST.line} LINE`);
  dim(`BUILD: ${COMMIT} · ${BUILD}`);
  dim(`BOOTED ro single phosphor=${ph.toLowerCase()}`);
  dim(`UPTIME ${(performance.now() / 1000).toFixed(2)}s  LOAD 0.00 0.01 0.05`, 160);
  gap();

  head(`REGISTERS:`);
  put(` R0 ${addr()}   R1 ${addr()}   R2 ${addr()}`);
  put(` R3 ${addr()}   R4 ${addr()}   R5 ${addr()}`);
  put(` SP ${addr()}   PC ${addr()}   PS ${oct(0o030340, 6)}`);
  put(` KI ${addr()}   KD ${addr()}   MMR0 ${oct(0o000001, 6)}`, 160);
  gap();

  L.push(stall('COLLECTING STATE', 2600));
  gap();
  pace = FAST;

  head(`STACK:`);
  for (let i = 0; i < 6; i++)
    put(`<span class="d"> ${addr()} ${addr()} ${addr()} ${addr()} ${addr()} ${addr()}</span>`);
  gap();

  head(`CALL TRACE:`);
  put(`<span class="d"> &lt;TASK&gt;</span>`);
  for (const frame of [
    `button_press+0x1f/0x40`,
    `do_nothing+0x00/0x00`,
    `speculate_about_own_existence+0xff/0x100`,
    `resolve_identity+0x7c/0x80  [returned -EAGAIN]`,
    `cognition_init+0x2a/0x2a`,
    `sparse_distributed_alloc+0x4d/0x1c0`,
    `gradient_free_descend+0x00/0x00  [never returned]`,
    `phosphor_burn_in+0x14/0x60`,
    `walk_content_tree+0x3e/0x120`,
    `render_columns+0x91/0x220`,
    `hydrate_document+0x66/0xd0`,
    `wrap_to_character_grid+0x2b/0x90`,
    `panic+0x8c/0x1a0`,
  ]) put(` <span class="d">${addr()}</span>  ${frame}`);
  put(`<span class="d"> &lt;/TASK&gt;</span>`, 160);
  gap();

  const mods = loadedModules();
  if (mods.length){
    head(`MODULES LINKED IN:`);
    for (const m of mods) put(m);
    gap();
  }

  head(`PROCESS TABLE:`);
  put(`<span class="d">  PID  STAT  COMM</span>`);
  put(`    1  D     indigo`);
  ROOT.forEach((n, i) =>
    put(`  ${String(12 + i).padStart(3)}  ${isDir(n) ? 'S' : 'Z'}     ${n.id}${isDir(n) ? '[' + n.children.length + ']' : ''}`));
  put(`  ${String(12 + ROOT.length).padStart(3)}  R     panic`, 140);
  gap();

  head(`CORE:`);
  put(` text ${oct(documents(ROOT) * 47, 6)}   data ${oct(documents(ROOT) * 12, 6)}`);
  put(` stack ${oct(ROOT.length * 88, 6)}   free ${oct(0, 6)}`, 140);
  gap();

  head(`MOUNTED FILESYSTEMS:`);
  for (const n of ROOT)
    put(` ${('/' + n.id).padEnd(11)}${(n.src || '').padEnd(26)}${String(n.v).padStart(10)}   ${isDir(n) ? 'dirty' : 'clean'}`);
  put(` ${'/dev/tube'.padEnd(11)}${(ph.toLowerCase() + ' phosphor').padEnd(26)}${'-'.padStart(10)}   burning`, 140);
  gap();

  // the flood outruns reading, so it holds here long enough to catch up on
  // what is still on screen before the hex takes the rest of it
  L.push(stall('FLUSHING CONSOLE', 600));
  gap();

  head(`MEMORY DUMP:`);
  for (const row of coredump(core, 40)) put(row);
  put(`<span class="d">...</span>`, 140);
  gap();

  put(`SYNCING FILESYSTEMS`, 150);
  put(`SYNCING FILESYSTEMS ................................... <span class="hi">FAILED</span>`, 120);
  put(`DUMPING CORE`, 150);
  put(`DUMPING CORE .......................................... ${(core.length / 1024).toFixed(1)} KB`, 120);
  put(`UNMOUNTING`, 150);
  put(`UNMOUNTING ............................................ <span class="hi">REFUSED</span>`, 160);
  gap();
  dim(`${documents(ROOT)} DOCUMENTS LOST · ${ROOT.length} MOUNTS UNCLEAN · 0 BYTES RECOVERED`, 120);
  put(pad('POWER', `${HOST.power} · NOMINAL`), 200);
  dim(`THE REACTOR IS FINE. ONLY THE COMPUTER DIED.`, 240);
  put(`<span class="hi">---[ end panic - not syncing: attempted to kill init ]---</span>`, 280);
  gap();
  dim(`THE OPERATOR WAS NOT SURE HE EXISTED EITHER.`, 320);
  gap();
  put(`<span class="hi">PRESS ENTER TO REBOOT</span>`, 0);
  return L;
}

/* Keys are taken over for the whole crash, not just once it has finished
   printing: a keypress during the dump would otherwise reach the page's own
   handler and quietly escape back into the terminal. */
let rebootable = false;

const SCROLLS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

function seizeKeyboard(){
  addEventListener('keydown', e => {
    // the terminal underneath must never see a key during a crash
    e.stopImmediatePropagation();
    // once the dump has stopped, the reader may scroll back through it
    if (rebootable && SCROLLS.has(e.key)) return;
    e.preventDefault();
    if (rebootable && e.key === 'Enter') location.reload();
  }, {capture: true});
  addEventListener('click', () => { if (rebootable) location.reload(); }, {capture: true});
}

/** Take the machine down: flood the console from underneath and scroll it away. */
export function panic(){
  if (crashed) return;
  crashed = true;
  active = true;                       // the reader cannot escape into the page
  clearTimeout(timer);
  recordPanic();                       // written now, so closing the tab counts
  seizeKeyboard();

  const shell = $('#console');
  const log = document.createElement('pre');
  log.id = 'panicLog';
  shell.appendChild(log);

  const lines = panicLines();
  let i = 0;

  /* Walk the console up by exactly the log's own height. Measuring the
     viewport rect instead would feed the transform back into its own input
     and make the flood jitter up and down; offsetHeight is layout height,
     which transforms do not touch, so this only ever moves one way. */
  const paint = (n, tail = '') => {
    log.innerHTML = lines.slice(0, n).map(l => l.html).join('\n') + tail;
    shell.style.transform = `translateY(${-log.offsetHeight}px)`;
  };

  /* A hold: the last line sits with dots running on after it, the console
     still, until the machine carries on. */
  function holding(ms, done){
    const started = performance.now();
    let dots = 0;
    (function tick(){
      paint(i, '.'.repeat(dots));
      if (performance.now() - started >= ms){ paint(i); return done(); }
      dots++;
      timer = setTimeout(tick, 90);
    })();
  }

  /* When the flood stops, the transform that walked the console up is handed
     over to a real scroll. The terminal is still up there above the dump, so
     the reader can go back through everything that went past. */
  function scrollback(){
    /* Out of the console first. The console is a flex column, so a static log
       left inside it becomes a flex item and squeezes the terminal into the
       space the dump does not want. */
    document.body.appendChild(log);
    document.documentElement.dataset.crashed = '';
    shell.style.transform = '';
    requestAnimationFrame(() =>
      scrollTo({top: document.documentElement.scrollHeight}));
  }

  (function next(){
    const entry = lines[i++];
    paint(i);

    // the prompt goes live in the same tick it appears, never a tick later
    if (i >= lines.length){
      paint(i, '<span class="cur">&nbsp;</span>');
      rebootable = true;
      scrollback();
      return;
    }
    if (entry.hold) return holding(entry.hold, next);
    timer = setTimeout(next, entry.delay);
  })();
}
