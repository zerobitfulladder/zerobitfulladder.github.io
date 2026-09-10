/* Painting the three columns.

   The columns are a file browser, so there is one rule and no per-section
   cases: the first column lists the root, the second lists a directory's
   children or holds a file's document, and the third holds the document of
   whatever the second column has selected. */

import { $, $$, esc } from './dom.js';
import {
  ROOT, S, SETTINGS, isDir, section, hasList, listItems, selIndex, current,
  midDoc, rightDoc, focused,
} from './tree.js';
import { DASH, layoutCols } from './screen.js';
import { drawBanner } from './banner.js';
import { hydrate } from './hydrate.js';

/* ── the key bar ──────────────────────────────────────────────── */
const FKEYS = {
  menu: [['l','ENTER'],['j k','MOVE'],['1-9','SECTION'],['T','PHOSPHOR'],[':','CMD'],['?','KEYS']],
  list: [['h','BACK'],['l','READ'],['j k','MOVE'],['/','FILTER'],['1-9','SECTION'],[':','CMD'],['?','KEYS']],
  doc:  [['h','BACK'],['j k','SCROLL'],['SPC','PAGE'],['g G','ENDS'],['1-9','SECTION'],[':','CMD'],['?','KEYS']],
};

export const setKeys = mode => $('#fkeys').innerHTML = FKEYS[mode]
  .map(([k, l]) => `<span class="fk"><i>${k}</i><span>${l}</span></span>`).join('');

let flashT;
export function flash(msg){
  clearTimeout(flashT);
  $('#fkeys').innerHTML = `<span class="fk"><span>${esc(msg)}</span></span>`;
  flashT = setTimeout(() => setKeys(S.focus), 3000);
}

/* ── banners ──────────────────────────────────────────────────── */
/* Seven pixels to the cell is the size the name wants. A phone held sideways
   has a few hundred rows in total, and at that size the banner would take a
   quarter of them, so there it comes down to a cell that still reads as the
   same block letters. Width is the canvas's own business — it fits itself to
   the box it is given. */
export function repaintArt(){
  const canvas = $('#nameBanner');
  if (canvas) drawBanner(canvas, SETTINGS.banner || '', innerHeight < 520 ? 4 : 7);
}

/* ── rows ─────────────────────────────────────────────────────── */
/* Rows read like a real listing: a directory wears a trailing slash and is
   counted in documents, a file wears its own extension and is measured on
   disk. Both values come from the tree, so neither can drift. */
const label = node => isDir(node) ? node.name + '/' : node.name + node.ext;

/* Every row sits flush against the column edge: a listing marks nothing out
   on the row itself, only in the heading above it. */
const rowHTML = (node, i, sel, tag = '') => {
  const cls = `row${isDir(node) ? ' dir' : ''}${i === sel ? ' sel' : ''}`;
  return `<button class="${cls}" role="option" aria-selected="${i === sel}" data-i="${i}">
  <span class="n">${esc(label(node))}</span>${tag ? `<span class="g">[${esc(tag)}]</span>` : ''}<span class="r">&nbsp;${DASH}</span><span class="v">${esc(node.v)}</span></button>`;
};

/* Owner and group may edit, everyone else only reads. */
const perms = node => isDir(node) ? 'drwxrwxr-x' : '-rw-rw-r--';

/* Rebuilding a column that already holds the right content reloads its
   images and restarts its paint, which reads as a flicker. Track what each
   column is showing and only rebuild when that changes. */
function markSelection(el, sel){
  $$('.row', el).forEach(row => {
    const on = +row.dataset.i === sel;
    row.classList.toggle('sel', on);
    row.setAttribute('aria-selected', String(on));
  });
}

function renderMenu(){
  $('#menuList').innerHTML = ROOT
    .map((node, i) => rowHTML(node, i, S.menu)).join('');
  $('#c1h').classList.toggle('act', S.focus === 'menu');
}

function renderList(){
  const el = $('#listCol'), here = section(), items = listItems(), sel = selIndex();
  const key = here.path + '|' + S.filter;

  if (key === S.listKey){
    markSelection(el, sel);
    $('#c2h').classList.toggle('act', S.focus === 'list');
    $('.row.sel', el)?.scrollIntoView({block: 'nearest'});
    return;
  }
  S.listKey = key;

  // a directory's own _index body, shown above its entries
  const intro = here.html && !S.filter ? here.html + '<div class="gap"></div>' : '';

  const heading = item => item.group || '';
  const sizes = new Map();
  for (const item of items){
    const g = heading(item);
    sizes.set(g, (sizes.get(g) || 0) + 1);
  }

  // the list arrives already clustered, so a heading goes wherever the
  // category changes and the row indices stay the selection's indices
  let rows = '', group = null;
  items.forEach((item, i) => {
    const g = heading(item);
    if (!S.filter && g !== group){
      group = g;
      if (g) rows += `${i ? '<div class="gap"></div>' : ''}<div class="hd${item.bright ? ' bright' : ''}"><span>${esc(g.toUpperCase())}</span><span class="r">&nbsp;${DASH}</span><span>${sizes.get(g)}</span></div>`;
    }
    rows += rowHTML(item, i, sel, item.draft ? 'DRAFT' : '');
  });

  el.innerHTML = intro + (rows || '<div class="empty">NOTHING MATCHES</div>');
  hydrate(el);

  // the first column already names this directory and counts it, so the
  // header only speaks up when a filter is narrowing what is shown
  $('#c2h').innerHTML = S.filter
    ? `<span>/${esc(S.filter)}</span><span class="r">&nbsp;${DASH}</span><span>${items.length}</span>`
    : '';
  $('#c2h').classList.toggle('act', S.focus === 'list');
  $('.row.sel', el)?.scrollIntoView({block: 'nearest'});
}

/* A document's own heading block is its metadata. Where there is none — a
   page that is already written as a panel — the body stands on its own. */
function docHTML(node){
  const meta = [];
  if (node.date) meta.push(esc(node.date));
  if (node.draft) meta.push('DRAFT');
  if (node.wonder) meta.push('CARELESS WONDER');
  if (node.reading) meta.push(node.reading + ' MIN');
  const tags = (node.tags || []).map(t => `[${esc(String(t).toUpperCase())}]`).join(' ');
  if (tags) meta.push(tags);

  if (!meta.length) return node.html || '';
  return `<div class="dt">${esc(node.name)}</div>`
       + `<div class="dm">${meta.join(' · ')}</div><div class="gap"></div>`
       + (node.html || '');
}

/** Fill one document pane, and leave it alone when it already holds this. */
function renderDoc(pane, column, node, keyName){
  const key = node ? node.path : '';
  if (key === S[keyName]) return;
  S[keyName] = key;

  pane.innerHTML = node ? docHTML(node) : '';
  if (node) hydrate(pane);
  column.scrollTop = 0;
}

/** The element a column scrolls, or null when it holds selectable rows. */
export function scrollerFor(level){
  if (level === 'menu') return null;
  if (level === 'list') return hasList() ? null : $('#col2');
  return $('#col3');
}

/* One status line for whatever is selected, in whichever column: mode, date
   and path, the way `ls -l` reads. The position rail joins it only when the
   focused column is actually scrolling a document — TOP / BOT / ALL follow
   vim rather than showing 0% and 100%. */
export function updateDocBar(){
  const st = $('#docstat'), node = focused(), box = scrollerFor(S.focus);
  st.parentElement.classList.toggle('act', !!box);

  let rail = '';
  if (box){
    const ch = box.clientHeight, sh = box.scrollHeight, top = Math.round(box.scrollTop);
    const row = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue('--row')) || 26;
    const total = Math.max(1, Math.round(sh / row));
    const cur = Math.min(total, Math.round(top / row) + 1);
    const pos = sh <= ch + 2 ? 'ALL' : top <= 1 ? 'TOP' : (top + ch >= sh - 1) ? 'BOT'
              : Math.round(top / (sh - ch) * 100) + '%';
    rail = `<span>L${cur}/${total}</span><span>${pos}</span>`;
  }

  st.innerHTML = `<span class="perm">${node ? perms(node) : ''}</span>`
    + `<span class="mod">${esc(node?.modified || '')}</span>`
    + `<span class="path">${esc(node?.src || '')}</span>`
    + rail;
}

/* ── the whole page ───────────────────────────────────────────── */
export const touch = matchMedia('(max-width:1000px)');

export function render(){
  const dir = hasList();
  // the third column stands empty for a file, so there is nothing to focus
  if (!dir && S.focus === 'doc') S.focus = 'list';

  // the geometry has to settle first: text is wrapped to the character
  // width of the column it lands in, so it must be measured at final size
  $('.cols').dataset.level = S.focus;
  document.documentElement.dataset.level = S.focus;
  layoutCols();

  renderMenu();

  // the second column carries both panes; only one is ever on screen
  $('#listCol').hidden = !dir;
  $('#doc2').hidden = dir;
  if (dir) renderList();
  renderDoc($('#doc2'), $('#col2'), midDoc(), 'doc2Key');
  renderDoc($('#doc3'), $('#col3'), rightDoc(), 'doc3Key');
  updateDocBar();

  const back = $('#backBtn');
  back.hidden = !(touch.matches && S.focus !== 'menu');
  back.textContent = S.focus === 'doc' ? '‹ ' + section().name : '‹ MENU';

  /* The header comes and goes with the level on a touch screen, so the name
     is painted here rather than only on a resize: a canvas that was measured
     while its box was off screen has nothing to show when the box returns. */
  repaintArt();

  $('#col1').classList.toggle('on', S.focus === 'menu');
  $('#col2').classList.toggle('on', S.focus === 'list');
  $('#col3').classList.toggle('on', S.focus === 'doc');
  setKeys(S.focus);

  const entry = dir ? current() : null;
  $('#crumb').innerHTML = `/<b>${esc(section().id)}</b>`
    + (entry && S.focus !== 'menu' ? '/' + esc(entry.id) : '');

  // #section/slug, so a selected entry is linkable and survives a reload
  const here = '#' + section().id + (entry ? '/' + entry.id : '');
  if (location.hash !== here){ S.hash = here; history.replaceState(null, '', here); }
}
