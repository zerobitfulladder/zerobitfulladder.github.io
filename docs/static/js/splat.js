/* Live gaussian splat.

   The scan is shown as it was captured — no phosphor ramp, no raster over
   it. A reconstruction is a measurement, and tinting it would be lying about
   what the camera saw.

   A document declares a scan with

       <div data-splat="/path.splat" data-alpha data-beta data-base></div>

   and each distinct file keeps its own host node. The node is moved back in
   rather than rebuilt, because a detached canvas keeps its WebGL context and
   its contents: leaving and re-entering a scan does not reload it. */

import { $, $$ } from './dom.js';
import { reduced } from './screen.js';

const GSPLAT_URL = '/static/vendor/gsplat/gsplat.js';

const hosts = new Map();

function buildHost(){
  const wrap = document.createElement('div');
  wrap.className = 'splatbox';
  wrap.innerHTML = `
    <canvas class="splatsrc"></canvas>
    <div class="splatload"><span class="splatpct">RECONSTRUCTING 0%</span></div>`;
  return wrap;
}

async function start(box, view){
  const src = $('.splatsrc', box);
  const fail = m => { const l = $('.splatload', box); if (l) l.textContent = m; };

  let SPLAT;
  try { SPLAT = await import(GSPLAT_URL); } catch { return fail('VIEWER FAILED TO LOAD'); }

  try {
    const renderer = new SPLAT.WebGLRenderer(src);
    renderer.backgroundColor = new SPLAT.Color32(4, 6, 10, 255);
    const scene = new SPLAT.Scene(), camera = new SPLAT.Camera();

    /* the opening view, dialled in against the live scan and baked into
       the document that declares it */
    const alpha = Number(view.alpha), beta = Number(view.beta), base = Number(view.base);
    const controls = new SPLAT.OrbitControls(camera, src, alpha, beta, base);
    controls.setCameraTarget(new SPLAT.Vector3(0, 0, 0));
    controls.minZoom = base * 0.15; controls.maxZoom = base * 6.0;
    controls.orbitSpeed = 1.6; controls.panSpeed = 1.4;

    function size(){
      const w = box.clientWidth, h = box.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      renderer.setSize(Math.round(w * dpr), Math.round(h * dpr));
    }
    new ResizeObserver(size).observe(box);
    size();

    const splat = await SPLAT.Loader.LoadAsync(view.splat, scene, p => {
      const el = $('.splatpct', box);
      if (el) el.textContent = 'RECONSTRUCTING ' + Math.round(p * 100) + '%';
    });
    $('.splatload', box)?.classList.add('done');

    const MAX_YAW = 20 * Math.PI / 180, RESUME = 3000;
    let sway = 0, lastInput = -1e9, dragging = false;
    const mark = () => lastInput = performance.now();
    src.addEventListener('contextmenu', e => e.preventDefault());
    src.addEventListener('wheel', mark, {passive: true});
    src.addEventListener('mousedown', () => { dragging = true; mark(); });
    src.addEventListener('touchstart', () => { dragging = true; mark(); }, {passive: true});
    src.addEventListener('touchmove', mark, {passive: true});
    for (const ev of ['mouseup', 'touchend', 'touchcancel', 'blur'])
      addEventListener(ev, () => { if (dragging){ dragging = false; mark(); } });

    let visible = true;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(box);

    (function frame(){
      if (visible && src.isConnected){
        // a drag that never got its mouseup would idle the sway forever
        if (dragging && performance.now() - lastInput > 10000) dragging = false;
        const idle = !dragging && performance.now() - lastInput > RESUME;
        if (idle && !reduced.matches){
          sway += 0.006;
          splat.rotation = SPLAT.Quaternion.FromEuler(
            new SPLAT.Vector3(0, Math.sin(sway) * MAX_YAW, 0));
        }
        controls.update();
        renderer.render(scene, camera);
      }
      requestAnimationFrame(frame);
    })();
  } catch (err){
    console.error(err);
    fail('SCAN FAILED: ' + (err?.message || err));
  }
}

/** Give every `[data-splat]` in freshly rendered content its viewer back. */
export function mountSplats(root){
  $$('[data-splat]', root).forEach(slot => {
    const file = slot.dataset.splat;
    let host = hosts.get(file);
    if (host){ slot.appendChild(host); return; }
    host = buildHost();
    hosts.set(file, host);
    slot.appendChild(host);
    requestAnimationFrame(() => start(host, {...slot.dataset}));
  });
}
