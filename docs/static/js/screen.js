/* The tube itself: character metrics, wrapping, phosphor and column widths.

   Nothing here reaches back into rendering. A change that needs the page
   redrawn dispatches an event on `document` and lets the caller decide. */

import { $, $$ } from './dom.js';
import { S, hasList } from './tree.js';

/* Leaders are drawn with real characters, so they align to the grid the
   rest of the page is on. Long enough for any column, clipped by CSS. */
export const DASH = '-'.repeat(400);
export const DOTS = '.'.repeat(400);

export const PHOSPHORS = ['green', 'amber', 'cyan', 'magenta', 'white'];

/* ── character metrics ────────────────────────────────────────── */
/* Text is printed line by line, so it has to be wrapped to real character
   columns rather than left to the browser. */
let CHW = 8;

export function measureCH(){
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
  probe.textContent = '0'.repeat(100);
  document.body.appendChild(probe);
  CHW = probe.getBoundingClientRect().width / 100 || 8;
  probe.remove();
}

const colCols = el => Math.max(20, Math.floor((el?.clientWidth || 420) / CHW) - 1);

/** The screen measured the way a terminal measures itself: in cells. */
export function cells(){
  const row = parseFloat(getComputedStyle(document.documentElement)
    .getPropertyValue('--row')) || 26;
  return {cols: Math.max(1, Math.floor(innerWidth / CHW)),
          rows: Math.max(1, Math.floor(innerHeight / row))};
}

const escLine = s => String(s).replace(/[&<>]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;'}[c]));

/* Wrapping has to survive inline markup: a link written inside a wrapped
   block must come out the other side still a link. So the block is broken
   into atoms rather than into words — a text node contributes its words, an
   element is one unbreakable atom measured by the text it shows. Each atom
   remembers whether whitespace preceded it, so punctuation that touches a
   link ("...in LIBRARY.") stays touching it. */
function atomise(el){
  const atoms = [];
  let spaced = true;                      // the start of a block is a boundary

  for (const node of el.childNodes){
    if (node.nodeType === Node.TEXT_NODE){
      for (const [run] of node.textContent.matchAll(/\n|[^\S\n]+|\S+/g)){
        if (run === '\n'){ atoms.push({br: true}); spaced = true; }
        else if (/^\s/.test(run)) spaced = true;
        else { atoms.push({len: run.length, html: escLine(run), spaced}); spaced = false; }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE){
      atoms.push({len: node.textContent.length, html: node.outerHTML, spaced});
      spaced = false;
    }
  }

  // the source's own indentation must not become blank lines on screen
  while (atoms.length && atoms[0].br) atoms.shift();
  while (atoms.length && atoms.at(-1).br) atoms.pop();
  return atoms;
}

/* The element is rewritten in place, so re-wrapping at a new width has to
   start from what was authored rather than from the last pass. */
const authored = new WeakMap();

/** Wrap one element's inline content to the character width it occupies. */
export function wrapElement(el){
  const source = authored.get(el);
  if (source === undefined) authored.set(el, el.innerHTML);
  else el.innerHTML = source;

  const cols = colCols(el);
  const lines = [];
  let line = [], len = 0;
  const flush = () => { lines.push(line); line = []; len = 0; };

  for (const atom of atomise(el)){
    if (atom.br){ flush(); continue; }
    // a line can only break where there was a space to begin with
    if (line.length && atom.spaced && len + 1 + atom.len > cols) flush();
    const gap = line.length && atom.spaced ? ' ' : '';
    line.push(gap + atom.html);
    len += gap.length + atom.len;
  }
  flush();

  el.innerHTML = lines
    .map(l => `<div class="ln">${l.length ? l.join('') : '&nbsp;'}</div>`).join('');
}

/* Wrapped text is measured in characters, so any width change makes every
   line stale: drop the rebuild guards before re-rendering. */
export function invalidateColumns(){ S.listKey = S.doc2Key = S.doc3Key = null; }

/* ── phosphor ─────────────────────────────────────────────────── */
export const phosphor = () => document.documentElement.dataset.phosphor;

export function setPhos(p){
  if (!PHOSPHORS.includes(p)) return;
  document.documentElement.dataset.phosphor = p;
  $$('#phos button').forEach(b => b.classList.toggle('on', b.dataset.p === p));
  try { localStorage.setItem('phosphor2', p); } catch {}
  document.dispatchEvent(new CustomEvent('tube:repaint'));
}

/* ── column ratios — three shares of the same width ───────────── */
const COL_KEYS = {menu: 0, list: 1, doc: 2};

/* A file section has nothing to preview, so the third column stands empty.
   Where the screen is wide that emptiness reads as margin and the document
   keeps its own share; below this it is most of the tube, and a page written
   for a column ends up wrapping at twenty characters. So under it the two
   right-hand shares are one, and the document takes the room nothing else is
   using. The threshold sits just under a 1080p screen, which is the narrowest
   width the three shares are still a layout at — above it, nothing changes. */
const MERGE = 1900;

/** Lay the grid out. There are always three columns; what a column holds is
    the view's business, not the grid's. */
export function layoutCols(){
  const el = $('.cols');
  if (!el) return;
  const merge = !hasList() && innerWidth <= MERGE;
  const [menu, list, doc] = S.cols;
  el.toggleAttribute('data-merged', merge);
  el.style.gridTemplateColumns = (merge ? [menu, list + doc, 0] : [menu, list, doc])
    .map(v => `minmax(0,${v}fr)`).join(' ');
}

/* Column widths are a way of reading one page, not a preference: they are
   not remembered, so every visit starts at the same shape. */
function clampCols(){
  S.cols = S.cols.map(v => Math.max(0.2, Math.min(4, Math.round(v * 20) / 20)));
}

export const colLabel = () => S.cols.map(v => v.toFixed(2)).join(' : ');

export function setCols(values){
  S.cols = values;
  clampCols();
  document.dispatchEvent(new CustomEvent('tube:relayout'));
}

export function nudgeCols(d){
  S.cols[COL_KEYS[S.focus] ?? 0] += d * 0.05;
  clampCols();
  document.dispatchEvent(new CustomEvent('tube:relayout'));
}

export function restorePreferences(){
  let p = null;
  try { p = localStorage.getItem('phosphor2'); } catch {}
  return p;
}

/* Motion is a preference the reader can change while the page is open, so
   the query object is shared rather than sampled once. */
export const reduced = matchMedia('(prefers-reduced-motion: reduce)');
