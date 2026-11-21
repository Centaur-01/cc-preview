/* Couples Collective ambient background (Jack 2026-11-20: "some soothing animation in the background, something
   dainty with some type of algorithmic rythym and maybe a pulse, something suttle").

   A lamp-lit pond on the dark wood:
   - RHYTHM: drops fall on a Euclidean rhythm E(5,8), five onsets spread as evenly as possible over eight steps
     (x.xx.xx., the cinquillo), one step = 850 ms, so a bar is 6.8 s. The bar's first drop is a little bigger.
     (First shipped as E(3,8); Jack the same night: "can you make the water ripples more frequent?")
   - PLACE: each drop lands at the next point of a Halton(2,3) sequence: an even spread that never clumps and
     never quite repeats. A drop leaves three gold hairline rings that open and fade over about 7 s.
   - SHOWER: between the drops, a very light rain: one tiny single-ring droplet every half step (about two a
     second) at Halton(5,7) points, gone in 2.6 s (Jack: "almost like its raining, but just a VERY light shower").
   - PULSE: the lamp glow at the top breathes once per bar (about a calm breath).
   - DAINTY: a few gold motes drift up through the lamplight, twinkling on golden-ratio phases.

   Cost (measured 2026-11-20): every motion is a Web Animation of transform/opacity, which the browser's
   compositor runs; JavaScript only wakes once per step to drop a ripple. A first version drew a full-screen
   canvas each frame: ~0.5-0.7 s of main-thread work per 5 s in headless Chrome, against ~0 now. No <style> or
   inline style attributes (CSSOM only), so the new store's CSP allows it. Behind everything (z-index -1,
   pointer-events none); skips drops while the tab is hidden; off entirely under prefers-reduced-motion.
   Source: pokemon/brand/ambient.js; brand/make_brand.py copies it into brand/web/ (live store + vendorkit overlay). */
(() => {
  if (!window.matchMedia || matchMedia("(prefers-reduced-motion: reduce)").matches || !Element.prototype.animate) return;
  const GOLD = "212,173,102";
  const STEP = 850;                                   // ms per step
  const PATTERN = euclid(5, 8);                       // [1,0,1,1,0,1,1,0]
  const BAR = STEP * PATTERN.length;                  // 6.8 s
  const PHI = (1 + Math.sqrt(5)) / 2;
  const MOTES = 32;                                   // Jack: the first 26 at 1.2-3.4 px were "a little too dainty"

  function euclid(k, n) {                             // k onsets over n steps, as even as possible
    return Array.from({ length: n }, (_, i) => ((i * k) % n < k ? 1 : 0));
  }
  function halton(i, b) {                             // low-discrepancy sequence in [0, 1)
    let f = 1, r = 0;
    while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); }
    return r;
  }
  function el(css) {
    const d = document.createElement("div");
    d.style.cssText = css;                            // CSSOM: allowed under style-src 'self'
    return d;
  }

  const root = el("position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;contain:strict");
  root.setAttribute("aria-hidden", "true");
  document.body.prepend(root);

  // the pulse: a lamp-glow layer breathing once per bar, on the same clock as everything else
  const glow = el("position:absolute;inset:0;opacity:.35;" +
    `background:radial-gradient(120% 70% at 50% -8%, rgba(${GOLD},.07), rgba(${GOLD},0) 70%)`);
  root.append(glow);
  glow.animate([{ opacity: 0.35 }, { opacity: 1 }, { opacity: 0.35 }],
               { duration: BAR, iterations: Infinity, easing: "ease-in-out" }).startTime = 0;

  // motes: each drifts up a gently swaying path on a loop; its twinkle is a separate opacity animation
  let motes = [];
  function lay() {
    motes.forEach(m => m.remove());
    const W = innerWidth, H = innerHeight, span = H + 40;
    motes = Array.from({ length: MOTES }, (_, i) => {
      const size = 2 + ((i * PHI) % 1) * 2.6;                       // px
      const x0 = halton(i + 1, 5) * W;
      const v = 5 + ((i * PHI * 3) % 1) * 7;                        // px per second, upward
      const sway = 5 + ((i * PHI * 7) % 1) * 10;                    // px
      const dur = (span / v) * 1000;
      const m = el(`position:absolute;left:0;top:0;width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;` +
                   `border-radius:50%;background:rgba(${GOLD},1);box-shadow:0 0 ${(size * 2).toFixed(1)}px rgba(${GOLD},.6)`);
      const frames = Array.from({ length: 9 }, (_, k) => {
        const f = k / 8;
        const x = x0 + Math.sin(f * 2 * Math.PI * Math.max(1, Math.round(dur / 1000 / 12))) * sway;
        return { transform: `translate(${x.toFixed(1)}px, ${(H + 20 - f * span).toFixed(1)}px)` };
      });
      const drift = m.animate(frames, { duration: dur, iterations: Infinity });
      drift.currentTime = halton(i + 1, 7) * dur;                    // spread them over the screen at the start
      const tw = m.animate([{ opacity: 0.16 }, { opacity: 0.72 }, { opacity: 0.16 }],
                           { duration: 4200 + ((i * PHI * 13) % 1) * 2600, iterations: Infinity, easing: "ease-in-out" });
      tw.currentTime = ((i * PHI) % 1) * 4200;
      root.append(m);
      return m;
    });
  }
  lay();
  let resizeT = 0;
  addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(lay, 300); });

  // Rings come from fixed pools and are never added or removed while running: a ring is one element, centred on
  // the origin, that an animation moves (translate) and opens (scale). Creating an element per droplet cost
  // ~230 ms of main-thread work per 5 s at shower rates (measured 2026-11-20); restarting animations costs ~none.
  function pool(n, size, alphaOf) {
    return Array.from({ length: n }, (_, i) => {
      const r = el(`position:absolute;left:0;top:0;width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;` +
                   `border-radius:50%;border:1px solid rgba(${GOLD},${alphaOf(i).toFixed(3)});opacity:0`);
      root.append(r);
      return { el: r, size, anim: null };
    });
  }
  function open(ring, x, y, radius, duration, delay) {
    if (ring.anim) ring.anim.cancel();
    const at = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`, s1 = ((2 * radius) / ring.size).toFixed(3);
    ring.anim = ring.el.animate([{ transform: `${at} scale(.02)`, opacity: 1 }, { transform: `${at} scale(${s1})`, opacity: 0 }],
                                { duration, delay, easing: "cubic-bezier(.22,.61,.36,1)", fill: "both" });
  }
  const BIG = 220, SMALL = 160, DROP_RINGS = 3;
  const dropPool = pool(8 * DROP_RINGS, 2 * BIG, i => 0.16 - (i % DROP_RINGS) * 0.045);   // 8 drops can overlap
  const rainPool = pool(10, 128, () => 0.15);

  // ripples: on each onset, three hairline rings open from the drop and fade
  let drops = 0, step = 0;
  function drop(big) {
    const x = halton(drops + 1, 2) * innerWidth, y = halton(drops + 1, 3) * innerHeight;
    for (let k = 0; k < DROP_RINGS; k++) {
      open(dropPool[(drops * DROP_RINGS + k) % dropPool.length], x, y, big ? BIG : SMALL, 7000, k * 260);
    }
    drops += 1;
  }
  // the light shower: one tiny, quick droplet every half step, between the rhythmic drops
  let sprinkles = 0;
  function sprinkle() {
    sprinkles += 1;
    open(rainPool[sprinkles % rainPool.length], halton(sprinkles, 5) * innerWidth, halton(sprinkles, 7) * innerHeight,
         30 + ((sprinkles * PHI) % 1) * 34, 2600, 0);
  }
  setInterval(() => { if (!document.hidden) sprinkle(); }, STEP / 2);
  setInterval(() => {
    const beat = step % PATTERN.length;
    step += 1;
    if (PATTERN[beat] && !document.hidden) drop(beat === 0);
  }, STEP);
})();
