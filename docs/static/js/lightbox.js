/* Click a picture to see it as it was taken.

   In the document a capture wears the phosphor wash and the page's raster
   runs over it. Opening it lifts it clear of both — the frame sits above the
   raster layer, so what is on screen is the file itself. */

import { $, $$ } from './dom.js';

let frame = null;

function onKey(e){
  if (e.key !== 'Escape') return;
  // the reader is looking at a picture, not driving the terminal
  e.preventDefault();
  e.stopImmediatePropagation();
  close();
}

function close(){
  if (!frame || frame.hidden) return;
  frame.hidden = true;
  $('img', frame).removeAttribute('src');      // stop holding the decode
  removeEventListener('keydown', onKey, {capture: true});
}

function build(){
  const el = document.createElement('div');
  el.id = 'lightbox';
  el.hidden = true;
  el.innerHTML = '<img alt="">';
  el.addEventListener('click', close);
  document.body.appendChild(el);
  return el;
}

function open(src, alt){
  frame ??= build();
  const img = $('img', frame);
  img.src = src;
  img.alt = alt || '';
  frame.hidden = false;
  addEventListener('keydown', onKey, {capture: true});
}

/** Give every capture in freshly rendered content a click-to-enlarge.

    The portrait is left out: it is a dithered piece of the page rather than
    a screenshot to be examined, and its detail is the dither. */
export function enlargeable(root){
  $$('img.docimg', root)
    .filter(img => !img.closest('.scan'))
    .forEach(img => {
      img.addEventListener('click', () => open(img.currentSrc || img.src, img.alt));
    });
}
