/* Hydration hooks.

   Every document is Markdown or HTML — nothing else lives in the tree. When
   a document needs to *do* something rather than say it, it declares that
   with a `data-` attribute and this file wires it up after the markup lands:

       data-leader    fill with a dotted leader, sized by CSS
       data-wrap      wrap this text to real character columns
       data-count     the number of entries in a top-level list
       data-play      play an audio file on click
       data-print     open the print dialog on click
       data-crash     take the whole machine down on click
       data-splat     mount the live gaussian-splat viewer

   Adding another interactive element later means adding a hook here, and
   nothing at all to the content model. */

import { $$ } from './dom.js';
import { ROOT, isDir } from './tree.js';
import { DOTS, wrapElement } from './screen.js';
import { mountSplats } from './splat.js';
import { panic } from './boot.js';
import { enlargeable } from './lightbox.js';

/* the recording is a real file on the site, not an embedded blob */
const sounds = new Map();
function play(src){
  let audio = sounds.get(src);
  if (!audio) sounds.set(src, audio = new Audio(src));
  try { audio.currentTime = 0; audio.play(); } catch {}
}

/* KaTeX costs ~300 KB and two documents in the tree want it, so it is not in
   the page. The first document that actually carries a delimiter pulls it in;
   every other document never pays. */
const KATEX = '/static/vendor/katex/';
let katexLoading = null;

const hasMath = el => /\$\$[\s\S]*?\$\$|\$[^$\n]+\$/.test(el.textContent || '');

function load(tag, attrs){
  return new Promise((resolve, reject) => {
    const node = Object.assign(document.createElement(tag), attrs);
    node.onload = resolve;
    node.onerror = () => reject(new Error(attrs.href || attrs.src));
    document.head.appendChild(node);
  });
}

/* Resolves once renderMathInElement exists. Kept as a single promise, so
   opening a second maths document waits on the first fetch rather than
   starting another. */
function typesetter(){
  if (window.renderMathInElement) return Promise.resolve(true);
  if (katexLoading) return katexLoading;
  katexLoading = (async () => {
    await load('link', {rel: 'stylesheet', href: KATEX + 'katex.min.css'});
    await load('script', {src: KATEX + 'katex.min.js', defer: false});
    await load('script', {src: KATEX + 'auto-render.min.js', defer: false});
    return !!window.renderMathInElement;
  })().catch(() => { katexLoading = null; return false; });
  return katexLoading;
}

/* Fire and forget: callers do not wait, and a document with no maths in it
   never touches the network. */
export async function typeset(el){
  if (!el || !hasMath(el)) return false;
  if (!await typesetter()) return false;
  try {
    renderMathInElement(el, {
      delimiters: [{left:'$$', right:'$$', display:true},
                   {left:'$', right:'$', display:false}],
      throwOnError: false,
    });
    return true;
  } catch { return false; }
}

/* Anything that leaves this page opens in a new tab — another site, or
   another page of this one such as /library/, which is its own application.
   A fragment is navigation within the terminal and stays put, and a mailto:
   belongs to the mail client rather than to a tab. This covers links that
   come out of Markdown and never had a target of their own. */
function linksAway(root = document){
  const here = new URL(location.href);
  $$('a[href]', root).forEach(a => {
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#')) return;

    let url;
    try { url = new URL(href, location.href); } catch { return; }
    if (!/^https?:$/.test(url.protocol)) return;

    if (url.origin !== here.origin || url.pathname !== here.pathname){
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
  });
}

export function hydrate(root){
  $$('[data-leader]', root).forEach(el => el.textContent = DOTS);

  // links written inside a wrapped block survive the wrap
  $$('[data-wrap]', root).forEach(wrapElement);

  $$('[data-count]', root).forEach(el => {
    const node = ROOT.find(n => n.id === el.dataset.count);
    el.textContent = isDir(node) ? node.children.length : '';
  });

  $$('[data-play]', root).forEach(el =>
    el.addEventListener('click', () => play(el.dataset.play)));

  $$('[data-print]', root).forEach(el =>
    el.addEventListener('click', () => window.print()));

  $$('[data-crash]', root).forEach(el => el.addEventListener('click', panic));

  mountSplats(root);
  enlargeable(root);
  linksAway(root);
  typeset(root);
}
