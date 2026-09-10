/* Lyrics that keep the song's time.

   A quoted song can carry its timing. Each line wears data-t="start end", the
   seconds into the song where it is sung, and the block wears
   data-lyrics="rest", the seconds of quiet after the last line before the song
   starts over. The line being sung lights up, the way a lyrics view follows a
   playing track. Lines still to come stay dark, and lines already sung are
   marked .sung.

   Nothing is played, so nothing waits on the music: the clock runs from the
   first line to the last, the gaps between lines kept as they are in the song,
   then rests and goes round again from the first line. It starts when the page
   loads and keeps running while the reader is elsewhere: come back to the page
   and the song is further on, as if it had kept playing. */

import { $$ } from './dom.js';

let origin = null;           // performance.now() when the first line was first sung
const live = new WeakSet();  // blocks already running, so a repaint never doubles one

export function mountLyrics(root){
  $$('[data-lyrics]', root).forEach(block => {
    if (live.has(block)) return;
    const rest = parseFloat(block.dataset.lyrics) || 0;
    const lines = $$('[data-t]', block).map(el => {
      const [start, end] = el.dataset.t.trim().split(/\s+/).map(parseFloat);
      return {el, start, end};
    }).filter(l => l.start >= 0 && l.end > l.start);
    if (!lines.length) return;
    live.add(block);

    const first = lines[0].start;
    const round = Math.max(...lines.map(l => l.end)) + rest - first;

    let shown = '';
    const tick = () => {
      if (!block.isConnected) return;     // the page moved on, and the loop with it
      origin ??= performance.now();
      const t = first + ((performance.now() - origin) / 1000) % round;
      const state = lines.map(l => t >= l.end ? 's' : t >= l.start ? 'n' : '-').join('');
      if (state !== shown){               // touch the DOM only when a line changes
        lines.forEach((l, i) => {
          l.el.classList.toggle('sung', state[i] === 's');
          l.el.classList.toggle('now', state[i] === 'n');
        });
        shown = state;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}
