/* Couples Collective ambient background (Jack 2026-11-20: "some soothing animation in the background, something
   dainty with some type of algorithmic rythym and maybe a pulse, something suttle").

   A lamp-lit pond on the dark wood:
   - RHYTHM: drops fall on a Euclidean rhythm E(3,8), three onsets spread as evenly as possible over eight steps
     (x..x..x., the tresillo), one step = 850 ms, so a bar is 6.8 s. The bar's first drop is a little bigger.
   - PLACE: each drop lands at the next point of a Halton(2,3) sequence: an even spread that never clumps and
     never quite repeats. A drop leaves three gold hairline rings that open and fade over about 7 s.
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
  const PATTERN = euclid(3, 8);                       // [1,0,0,1,0,0,1,0]
  const BAR = STEP * PATTERN.length;                  // 6.8 s
  const PHI = (1 + Math.sqrt(5)) / 2;
  const MOTES = 26;

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
      const size = 1.2 + ((i * PHI) % 1) * 2.2;                     // px
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
      const tw = m.animate([{ opacity: 0.08 }, { opacity: 0.5 }, { opacity: 0.08 }],
                           { duration: 4200 + ((i * PHI * 13) % 1) * 2600, iterations: Infinity, easing: "ease-in-out" });
      tw.currentTime = ((i * PHI) % 1) * 4200;
      root.append(m);
      return m;
    });
  }
  lay();
  let resizeT = 0;
  addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(lay, 300); });

  // ripples: on each onset, three hairline rings scale open from the drop and fade
  let drops = 0, step = 0;
  function drop(big) {
    drops += 1;
    const R = big ? 220 : 160;
    const x = halton(drops, 2) * innerWidth, y = halton(drops, 3) * innerHeight;
    for (let k = 0; k < 3; k++) {
      const r = el(`position:absolute;left:${(x - R).toFixed(1)}px;top:${(y - R).toFixed(1)}px;width:${2 * R}px;` +
                   `height:${2 * R}px;border-radius:50%;border:1px solid rgba(${GOLD},${(0.16 - k * 0.045).toFixed(3)});` +
                   "transform:scale(.02);opacity:0");
      root.append(r);
      const a = r.animate([{ transform: "scale(.02)", opacity: 1 }, { transform: "scale(1)", opacity: 0 }],
                          { duration: 7000, delay: k * 260, easing: "cubic-bezier(.22,.61,.36,1)", fill: "both" });
      a.onfinish = () => r.remove();
    }
  }
  setInterval(() => {
    const beat = step % PATTERN.length;
    step += 1;
    if (PATTERN[beat] && !document.hidden) drop(beat === 0);
  }, STEP);
})();
