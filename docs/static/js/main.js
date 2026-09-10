/* Indigo — the terminal browser.

   Wiring only: restore what the reader last chose, put them where the URL
   says, and start the tube. */

import { $ } from './dom.js';
import { ROOT, S, SETTINGS, isDir, goSection, hasList, listItems, setSel } from './tree.js';
import {
  invalidateColumns, layoutCols, measureCH, restorePreferences, setPhos, PHOSPHORS,
} from './screen.js';
import { render, repaintArt, touch } from './view.js';
import { typeset } from './hydrate.js';
import { boot, finishBoot, showTerm } from './boot.js';
import './input.js';

/* ── preferences ──────────────────────────────────────────────── */
const stored = restorePreferences();
setPhos(PHOSPHORS.includes(stored) ? stored : (SETTINGS.phosphor || 'amber'));

/* ── deep links: #section/slug ────────────────────────────────── */
function applyHash(){
  const [id, slug] = decodeURIComponent(location.hash.slice(1)).split('/');
  if (!goSection(id)) return false;
  S.filter = '';
  S.focus = 'list';
  if (slug && hasList()){
    const i = listItems().findIndex(n => n.id === slug);
    // a link that names an entry opens it; on touch that is its own page,
    // on desktop the document is visible either way
    if (i >= 0){ setSel(i); if (touch.matches) S.focus = 'doc'; }
  }
  return true;
}

applyHash();

addEventListener('hashchange', () => {
  if (location.hash === S.hash) return;        // our own replaceState
  if (applyHash()) render();
});

/* ── reflow ───────────────────────────────────────────────────── */
/* Wrapped text is measured in characters, so anything that changes the
   width or the face makes every line stale. */
function reflow(){
  /* Going fullscreen resizes the window, and a re-render rebuilds the
     document's markup from scratch — which tears the fullscreen element out
     of the page and drops it straight back out again. Hold off while
     something is fullscreen, and catch up once it returns. */
  if (document.fullscreenElement) return;
  measureCH();
  invalidateColumns();
  render();
  repaintArt();
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) reflow();   // the layout moved while we waited
});

document.addEventListener('tube:repaint', repaintArt);
document.addEventListener('tube:reflow', () => requestAnimationFrame(reflow));
document.addEventListener('tube:relayout', () => {
  layoutCols();
  requestAnimationFrame(repaintArt);
});

let resizeT;
addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(reflow, 180);
});

let lastWidth = 0, observeT;
const columns = new ResizeObserver(() => {
  const w = $('#col3')?.clientWidth || 0;
  if (!w || Math.abs(w - lastWidth) < 2) return;
  lastWidth = w;
  clearTimeout(observeT);
  observeT = setTimeout(reflow, 40);
});
columns.observe($('#col2'));
columns.observe($('#col3'));

/* Whatever the page was painted with on arrival. typeset() checks for a
   delimiter before it fetches anything, so this costs nothing on the documents
   that carry no maths, which is all but two of them. */
addEventListener('load', () => { typeset($('#doc2')); typeset($('#doc3')); });

/* ── readouts, all of them real ───────────────────────────────── */
const countDocuments = nodes => nodes.reduce(
  (n, node) => n + (isDir(node) ? countDocuments(node.children) : 1), 0);
$('#rCount').textContent = countDocuments(ROOT);

$('#sub').textContent = SETTINGS.tagline || '';

(function age(){
  const born = new Date(SETTINGS.born);
  if (isNaN(born)) return;
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const before = now.getMonth() < born.getMonth()
    || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
  $('#rAge').textContent = years - (before ? 1 : 0);
})();

/* The clock reads where the operator is, so it is a setting rather than the
   reader's own zone. A bad zone string would otherwise throw here and take
   the whole module with it, so fall back to local time. */
const TIME = {hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false};
let clock;
try {
  clock = new Intl.DateTimeFormat('en-GB', {...TIME, timeZone: SETTINGS.timezone});
} catch {
  clock = new Intl.DateTimeFormat('en-GB', TIME);
}
$('#rZone').textContent = SETTINGS.timezone_label || '';
const tick = () => $('#rClock').textContent = clock.format(new Date());
tick();
setInterval(tick, 1000);

/* ── start ────────────────────────────────────────────────────── */
layoutCols();
measureCH();
/* Text is wrapped to a measured character width, so the face has to be the
   real one before anything is measured. `ready` alone can resolve before the
   webfont is in, which wraps the page to the fallback's wider glyphs. */
(async () => {
  try { await document.fonts?.load('1em VT323'); } catch {}
  try { await document.fonts?.ready; } catch {}
  reflow();
})();

/* The panes are hidden while the machine boots, so anything measured before
   the hand-off was measured against a box with no width — and the wrap fell
   back to a guess of 420 pixels, which is what the page then kept, because a
   column that already holds the right document is left alone. So the tube is
   reflowed once it is actually on screen rather than merely rendered. */
const ready = () => reflow();

$('#boot').addEventListener('click', finishBoot);

if (new URLSearchParams(location.search).has('noboot')){
  $('#boot').hidden = true;
  showTerm();
  ready();
} else {
  boot(ready);
}
