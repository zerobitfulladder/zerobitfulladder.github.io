/* Everything the reader does: keys, mouse, the command line, the help card.

   Navigation asks the tree one question — does this column hold rows? — and
   nothing else. There is no section it knows by name. */

import { $ } from './dom.js';
import {
  ROOT, S, hasList, listItems, selIndex, setSel, goSection,
} from './tree.js';
import {
  PHOSPHORS, colLabel, nudgeCols, setCols, setPhos, phosphor,
} from './screen.js';
import { flash, render, scrollerFor, setKeys, touch, updateDocBar } from './view.js';
import { booting, boot, finishBoot, isCrashed } from './boot.js';

/* ── levels ───────────────────────────────────────────────────── */
/* Touch navigation keeps its own history entry per level, so the hardware
   back button walks back out the way it came. */
function setLevel(level, push){
  if (level !== S.focus){
    S.focus = level;
    if (push && touch.matches) history.pushState({level}, '');
  }
  render();
}

/* Three columns, always, so moving right is moving right — except from the
   second column of a file section, where the third stands empty. */
const descend = () => setLevel('list', true);
const openCurrent = () => { if (hasList()) setLevel('doc', true); };

addEventListener('popstate', e => {
  if (!touch.matches) return;
  const level = e.state?.level || 'menu';
  if (level !== S.focus){ S.focus = level; render(); }
});
touch.addEventListener('change', () => render());
/* The button walks back out the way the reader came in — but a reader who
   arrived on a deep link never came in that way, and there is no entry of
   ours behind them. Stepping up a level is what they meant; leaving the site
   is not. */
$('#backBtn').addEventListener('click', () => {
  if (history.state?.level) history.back();
  else setLevel(S.focus === 'doc' ? 'list' : 'menu', false);
});

/* ── mouse ────────────────────────────────────────────────────── */
/* The mouse selects by clicking. Hover only moves focus between columns,
   so the wheel and the keys act where the pointer is. */
function focusColumn(level){
  if (level === S.focus) return;
  S.focus = level;
  render();
}

for (const [id, level] of [['#col1','menu'], ['#col2','list'], ['#col3','doc']]){
  const el = $(id);
  el.addEventListener('mouseenter', () => {
    if (touch.matches || isCrashed()) return;
    if (level === 'doc' && !hasList()) return;   // that column is empty
    focusColumn(level);
  });

  /* Over a list the wheel moves the selection; over the document it does
     what a wheel normally does. One notch is one entry: a mouse reports
     about 120 pixels per notch, so the leftover is dropped rather than
     carried, and a trackpad has to travel before it steps again. */
  let acc = 0;
  el.addEventListener('wheel', e => {
    // during a crash the wheel belongs to the scrollback, not to a column
    if (touch.matches || isCrashed()) return;
    if (scrollerFor(level)) return;             // a document scrolls normally
    e.preventDefault();
    focusColumn(level);
    acc += e.deltaY;
    if (Math.abs(acc) >= 50){ move(acc > 0 ? 1 : -1); acc = 0; }
  }, {passive: false});
}

$('#menuList').addEventListener('click', e => {
  const b = e.target.closest('.row');
  if (!b) return;
  const i = +b.dataset.i;
  if (i !== S.menu){ S.menu = i; S.filter = ''; }
  descend();
});

$('#listCol').addEventListener('click', e => {
  const b = e.target.closest('.row');
  if (!b) return;
  setSel(+b.dataset.i);
  if (touch.matches) return openCurrent();   // the document is its own page
  S.focus = 'list';
  render();
});

$('#phos').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) setPhos(b.dataset.p);
});

for (const id of ['#col2', '#col3'])
  $(id).addEventListener('scroll', updateDocBar, {passive: true});

/* ── command line — no standing prompt row; it borrows the key bar ── */
const cmdIn = $('#cmdIn'), cmdWrap = $('#cmdwrap');

function openPrompt(mode){
  S.mode = mode;
  cmdWrap.hidden = false;
  $('#fkeys').hidden = true;
  $('#cmdP').textContent = mode;
  cmdIn.value = mode === '/' ? S.filter : '';
  cmdIn.focus();
}

function closePrompt(){
  S.mode = null;
  cmdWrap.hidden = true;
  $('#fkeys').hidden = false;
  cmdIn.blur();
  setKeys(S.focus);
}

cmdIn.addEventListener('input', () => {
  if (S.mode !== '/') return;
  S.filter = cmdIn.value;
  setSel(0);
  render();
});

cmdIn.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Escape'){
    if (S.mode === '/'){ S.filter = ''; render(); }
    closePrompt();
  }
  if (e.key === 'Enter'){
    const value = cmdIn.value, mode = S.mode;
    closePrompt();
    if (mode !== '/') runCmd(value);
  }
});

function jumpTo(id){
  if (!goSection(id)) return false;
  S.focus = 'list';
  render();
  return true;
}

function runCmd(line){
  const [c, ...rest] = line.trim().toLowerCase().split(/\s+/);
  const arg = rest.join(' ');
  if (!c) return;

  if (ROOT.some(n => n.id === c)) return void jumpTo(c);

  if (c === 'theme' || c === 'phosphor')
    return PHOSPHORS.includes(arg) ? setPhos(arg)
      : flash('PHOSPHORS: ' + PHOSPHORS.join(' ').toUpperCase());

  if (c === 'cols'){
    const v = arg.split(/\s+/).map(Number).filter(n => n > 0);
    if (v.length !== 3) return flash('USAGE: COLS <MENU> <LIST> <DOCUMENT>   E.G.  COLS 0.5 1 1');
    setCols(v);
    return flash(`COLUMNS  ${colLabel()}`);
  }

  if (c === 'keys' || c === 'help') return toggleHelp(true);
  if (c === 'reboot' || c === 'boot') return boot();

  if (c === 'open'){
    const items = listItems();
    const i = items.findIndex(x => x.name.toLowerCase().includes(arg));
    if (i < 0) return flash('NO MATCH: ' + arg.toUpperCase());
    setSel(i);
    S.focus = 'list';
    render();
    return openCurrent();
  }

  flash('UNKNOWN: ' + c.toUpperCase() + ' · TRY '
    + ROOT.slice(0, 3).map(n => n.id.toUpperCase()).join(', ') + ', THEME AMBER, REBOOT');
}

/* ── help ─────────────────────────────────────────────────────── */
const HELP = [
  ['h / LEFT','focus the column to the left'],
  ['l / RIGHT','focus the column to the right'],
  ['j k / UP DOWN','move the selection; scroll in the reader'],
  ['ENTER','descend into the selection'],
  ['ESC','leave the reader'],
  ['1 - 9','jump straight to a section'],
  ['/','filter the contents column'],
  [':','command line - WORK, THEME AMBER, REBOOT'],
  ['T','cycle the phosphor'],
  ['g / SHIFT-G','first entry, last entry'],
  ['[  ]','resize the focused column (or :cols 0.5 1 1)'],
  ['?','this table'],
];

/* The box is drawn in characters, so every line has to be the same number of
   them. Both columns are measured from the table itself and the frame follows
   from that — a hand-tuned width was one character out, and the right edge
   never lined up with the corners. */
(function buildHelp(){
  const key = Math.max(...HELP.map(h => h[0].length));
  const desc = Math.max(...HELP.map(h => h[1].length));
  const inner = 1 + key + 2 + desc;              // " key  description"
  const bar = '+' + '-'.repeat(inner) + '+';
  $('#helpbox').innerHTML = [
    bar,
    '|' + ' KEYS'.padEnd(inner) + '|',
    bar,
    ...HELP.map(([k, d]) => `| <span class="k">${k.padEnd(key)}</span>  ${d.padEnd(desc)}|`),
    bar, '',
    '<span class="n">The mouse works everywhere too. Every key here does something.</span>',
  ].join('\n');
})();

const help = $('#help');
const toggleHelp = (on = help.hidden) => help.hidden = !on;
help.addEventListener('click', e => { if (e.target === help) toggleHelp(false); });

/* ── keyboard ─────────────────────────────────────────────────── */
const rowPx = () => parseFloat(getComputedStyle(document.documentElement)
  .getPropertyValue('--row')) || 26;

/* A column either holds rows to step through or a document to scroll, and
   `scrollerFor` is what says which. */
function move(d){
  const box = scrollerFor(S.focus);
  if (box){ box.scrollBy({top: d * rowPx()}); return updateDocBar(); }
  if (S.focus === 'menu'){
    S.menu = (S.menu + d + ROOT.length) % ROOT.length;
    S.filter = '';
  } else {
    const n = listItems().length;
    if (!n) return;
    setSel((selIndex() + d + n) % n);
  }
  render();
}

function jump(end){
  const box = scrollerFor(S.focus);
  if (box){ box.scrollTo({top: end ? box.scrollHeight : 0}); return updateDocBar(); }
  if (S.focus === 'menu') S.menu = end ? ROOT.length - 1 : 0;
  else {
    const n = listItems().length;
    if (!n) return;
    setSel(end ? n - 1 : 0);
  }
  render();
}

function page(dir){
  const box = scrollerFor(S.focus);
  if (!box) return false;
  box.scrollBy({top: dir * box.clientHeight * 0.9});
  updateDocBar();
  return true;
}

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target === cmdIn) return;
  // a fullscreen video owns the keyboard: space pauses it rather than paging
  // the document, and arrows must not move a selection out from under it
  if (document.fullscreenElement) return;
  if (booting()){ finishBoot(); e.preventDefault(); return; }

  const k = e.key;
  if (!help.hidden){
    if (k === 'Escape' || k === '?' || k === 'Enter') toggleHelp(false);
    return;
  }

  if (k >= '1' && k <= '9'){
    const node = ROOT[k - 1];
    if (node) jumpTo(node.id);
    return;
  }

  switch (k){
    case 'ArrowDown': case 'j': case 'J': move(1); e.preventDefault(); break;
    case 'ArrowUp': case 'k': case 'K': move(-1); e.preventDefault(); break;

    case ' ': case 'PageDown': if (page(1)) e.preventDefault(); break;
    case 'b': case 'PageUp': if (page(-1)) e.preventDefault(); break;

    case 'ArrowRight': case 'l': case 'L': case 'Enter':
      if (S.focus === 'menu') descend();
      else if (S.focus === 'list') openCurrent();
      e.preventDefault(); break;

    case 'ArrowLeft': case 'h': case 'H':
      if (S.focus === 'doc') setLevel('list', false);
      else if (S.focus === 'list'){ S.focus = 'menu'; S.filter = ''; render(); }
      e.preventDefault(); break;

    case 'Escape': case 'Backspace':
      if (S.filter){ S.filter = ''; render(); }
      else if (S.focus === 'doc') setLevel('list', false);
      else if (S.focus === 'list'){ S.focus = 'menu'; render(); }
      break;

    case 'Tab':
      S.focus = S.focus === 'menu' ? 'list'
              : (S.focus === 'list' && hasList()) ? 'doc' : 'menu';
      render(); e.preventDefault(); break;

    case '/':
      if (S.focus !== 'doc' && hasList()){ openPrompt('/'); e.preventDefault(); }
      break;
    case ':': openPrompt(':'); e.preventDefault(); break;
    case '?': toggleHelp(true); break;

    case 't': case 'T':
      setPhos(PHOSPHORS[(PHOSPHORS.indexOf(phosphor()) + 1) % PHOSPHORS.length]);
      break;

    case '[': nudgeCols(-1); e.preventDefault(); break;
    case ']': nudgeCols(1); e.preventDefault(); break;
    case 'g': jump(false); break;
    case 'G': jump(true); break;
  }
});

