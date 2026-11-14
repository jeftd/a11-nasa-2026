/* Copy of web/explorer/ember.js (Docker build context is web-hackathon/). Keep in sync. */
/* Ember, the Fire Data Explorer mascot. A small flame with an expression engine and no dependencies.
 *
 *   <div id="ember" style="width:96px"></div>
 *   <script src="ember.js"></script>
 *   <script>
 *     const e = Ember.create(document.getElementById('ember'));   // orange flame by default
 *     e.gesture('working');                                       // see Ember.GESTURES
 *     e.flare();                                                  // one burst, then back to the gesture
 *   </script>
 *
 * Colors: Ember.create(el, { color: 'ember' | 'blue' | 'terra' | 'aqua' | 'snpp' | 'noaa20' | 'noaa21' }).
 * Follow the cursor with the eyes: Ember.create(el, { follow: true }).
 * With prefers-reduced-motion it changes gesture without springs, flicker or blinking.
 *
 * The eyes are the same system as Corve (Corvesia's mascot): two vertical pills with rounded ends, no pupils,
 * and lids painted in the color behind them, so the cut of the lid carries the emotion.
 */
(function () {
  'use strict';

  // ---- Geometry (48 x 48 box). The flame is rebuilt every frame so it can flicker. ----
  const BASE = [24, 43];                       // pivot for squash, stretch and tilt
  const INNER = { sx: .8, sy: .7 };            // inner flame = outer flame scaled from the base
  const CENTERS = [[20.6, 31.2], [27.4, 31.2]];
  const WIDTH = 4.4, HEIGHT = 8;               // same eye pill as Corve

  // s: tip sway · l: side-lick sway · h: flare (taller tip; negative = low flame)
  function flamePath(s, l, h) {
    const tx = 24 + s, ty = 5 - h * 3.2, f = n => n.toFixed(2);
    return `M${f(tx)} ${f(ty)}` +
      ` C${f(tx + 1.8)} ${f(ty + 6.5)} 36.6 ${f(18.5 - h * .6)} 36.6 30` +
      ` C36.6 38.2 31 43 24 43 C17 43 11.4 38.2 11.4 31` +
      ` C11.4 26 ${f(12.2 + l * .5)} ${f(22 - h * .4)} ${f(13.2 + l)} ${f(15.6 - h * 1.4)}` +
      ` C${f(15 + l * .5)} 19.2 16.4 20.6 17.4 20.4` +
      ` C${f(19 + s * .3)} ${f(15.5 - h)} ${f(tx - 2.4)} ${f(ty + 7.5)} ${f(tx)} ${f(ty)}Z`;
  }

  const mix = (hex, to, k) => '#' + [1, 3, 5].map(i => {
    const a = parseInt(hex.substr(i, 2), 16), b = parseInt(to.substr(i, 2), 16);
    return Math.round(a + (b - a) * k).toString(16).padStart(2, '0');
  }).join('');
  const palette = (outer, eye) => ({ outer, inner: mix(outer, '#ffffff', .52), eye: eye || '#16120f' });

  const COLORS = {
    ember:  { outer: '#ff7a1a', inner: '#ffc24a', eye: '#16120f' },
    blue:   { outer: '#4C8DFF', inner: '#bfe0ff', eye: '#0b1a33' },
    // Satellite colors used across the explorer, so each satellite can have its own flame.
    terra:  palette('#E69F00'),
    aqua:   palette('#56B4E9'),
    snpp:   palette('#009E73'),
    noaa20: palette('#CC79A7'),
    noaa21: palette('#4C8DFF')
  };

  // ---- Controls of each eye (identical to Corve) ----
  // dx, dy: gaze · s: size · sy: height · lt: upper lid (0 to 1)
  // at: upper-lid tilt in degrees (+ inward = anger, - outward = sadness)
  // lb: lower lid (0 to 1, curved: smile) · ab: lower-lid tilt · x: X eyes (0 or 1)
  const EYE = { dx: 0, dy: 0, s: 1, sy: 1, lt: 0, at: 0, lb: 0, ab: 0, x: 0 };
  // Body: tx, ty (move), rot (tilt), sx, sy (stretch), flare (flame height), jit (nervous flicker), spark (0 to 1).

  // ---- Gestures: list of steps [milliseconds, pose], looped ----
  // pose = { b: body, e: both eyes, l: left eye, r: right eye }
  const GESTURES = {
    idle:      [[1400, {}], [900, { e: { dx: .9 } }], [1300, { e: { lt: .05 } }], [900, { e: { dx: -.7, dy: .3 } }]],
    curious:   [[900, { b: { rot: -8 }, l: { s: .94, lt: .2 }, r: { s: 1.2 } }], [300, { b: { rot: -9, ty: -.8, flare: .3 }, l: { s: .94, lt: .2 }, r: { s: 1.26, dy: -.5 } }], [1000, { b: { rot: 6 }, l: { s: 1.2 }, r: { s: .94, lt: .2 } }]],
    thinking:  [[1100, { e: { dx: -1.1, dy: -1.8, lb: .14 } }], [900, { e: { dx: .7, dy: -1.9, lb: .14 } }], [700, { e: { dx: -.4, dy: -2, lb: .14, lt: .06 } }]],
    working:   [[200, { b: { ty: .4, rot: 3, flare: .25 }, e: { lt: .36, at: 9, dy: .9 } }], [200, { b: { ty: -.2, sy: 1.03, flare: .45 }, e: { lt: .36, at: 9, dy: .7 } }]],
    reading:   [[500, { e: { lt: .34, dx: -1.3, dy: .1 } }], [750, { e: { lt: .34, dx: 1.2, dy: .1 } }], [500, { e: { lt: .34, dx: -1.3, dy: .9 } }], [750, { e: { lt: .34, dx: 1.2, dy: .9 } }]],
    waiting:   [[1100, { b: { rot: -5, tx: .6 }, e: { s: 1.16, at: -14, lt: .1, dy: -.4 } }], [1100, { b: { rot: 3, tx: -.3 }, e: { s: 1.16, at: -14, lt: .1, dy: -.4, dx: .5 } }]],
    stuck:     [[150, { b: { tx: -.3, jit: 1 }, e: { lt: .42, at: -16, lb: .1, dx: -.3 } }], [150, { b: { tx: .3, jit: 1 }, e: { lt: .42, at: -16, lb: .1, dx: .3 } }], [150, { b: { tx: -.3, jit: 1 }, e: { lt: .42, at: -16, lb: .1, dx: -.3 } }], [1000, { b: { jit: .4 }, e: { lt: .46, at: -18, lb: .1, dy: .8 } }]],
    failed:    [[300, { b: { sx: 1.08, sy: .9, flare: -.6, jit: 1.6 }, e: { x: 1 } }], [110, { b: { sx: 1.08, sy: .9, flare: -.6, tx: -.5, jit: 1.6 }, e: { x: 1 } }], [110, { b: { sx: 1.08, sy: .9, flare: -.6, tx: .5, jit: 1.6 }, e: { x: 1 } }], [1000, { b: { sx: 1.05, sy: .93, flare: -.5, jit: .8 }, e: { x: 1 } }]],
    annoyed:   [[1400, { b: { flare: .6 }, e: { lt: .5, at: 24, lb: .1 } }], [300, { b: { sx: 1.05, sy: .96, flare: .9 }, e: { lt: .54, at: 26, lb: .14 } }]],
    sad:       [[1600, { b: { sy: .92, rot: 3, flare: -.8 }, e: { lt: .42, at: -26, dy: 1.3 } }], [1200, { b: { sy: .92, rot: 3, flare: -.9 }, e: { lt: .46, at: -28, dy: 1.5, dx: -.4 } }]],
    done:      [[300, { b: { ty: -3, sy: 1.06, sx: .96, flare: .8, spark: 1 }, e: { lb: .58 } }], [260, { b: { sx: 1.07, sy: .92, spark: 1 }, e: { lb: .58 } }], [800, { e: { lb: .58 } }]],
    proud:     [[1500, { b: { rot: -6, sy: 1.04, flare: .5 }, e: { lt: .34, lb: .42, dx: .6 } }], [700, { b: { rot: -6, sy: 1.05, flare: .6 }, e: { lt: .38, lb: .44, dx: .6 } }]],
    found:     [[1200, { e: { lt: .12 } }], [160, { b: { ty: -3.2, sy: 1.08, sx: .95, flare: 1.2, spark: 1 }, e: { s: 1.36, dy: -.8 } }], [1300, { b: { flare: .4 }, e: { s: 1.28, dy: -.6 } }]],
    doubt:     [[1500, { b: { rot: -4 }, l: { lt: .56, at: 4 }, r: { s: 1.14, dy: -.6 } }], [900, { b: { rot: -4 }, l: { lt: .6, at: 4 }, r: { s: 1.18, dy: -.8 } }]],
    scanning:  [[500, { e: { lt: .56, lb: .24, dx: -1.5 } }], [500, { e: { lt: .56, lb: .24, dx: 1.5 } }], [800, { e: { lt: .56, lb: .24 } }]],
    sleeping:  [[2000, { b: { sy: .86, sx: 1.04, rot: 4, flare: -1.3 }, e: { lt: .9, lb: .04, dy: 1 } }], [2000, { b: { sy: .9, sx: 1.03, rot: 4, flare: -1.1 }, e: { lt: .92, lb: .04, dy: 1 } }]],
    thankful:  [[1600, { b: { rot: -8 }, e: { lb: .64, at: -8, lt: .06 } }], [1200, { b: { rot: 6 }, e: { lb: .64, at: -8 } }]],
    burst:     [[900, { e: { lt: .1 } }], [90, { b: { sy: .9, sx: 1.06 }, e: { lt: .3, lb: .3 } }], [380, { b: { ty: -1.4, sy: 1.08, flare: 1.6, spark: 1 }, e: { lt: .34, lb: .36 } }], [500, { e: { lt: .1 } }]]
  };
  const FLARE = [[90, { b: { sy: .9, sx: 1.06 }, e: { lt: .3, lb: .3 } }], [420, { b: { ty: -1.4, sy: 1.08, flare: 1.6, spark: 1 }, e: { lt: .34, lb: .36 } }]];

  const LESS_MOTION = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SPARKS = [[17, 14, .0], [30, 11, .33], [23, 7, .66]]; // x, y, phase
  let uid = 0;

  function flat(p) {
    p = p || {};
    const o = Object.assign({ tx: 0, ty: 0, rot: 0, sx: 1, sy: 1, flare: 0, jit: 0, spark: 0 }, p.b || {});
    ['L', 'R'].forEach((k, i) => {
      const e = Object.assign({}, EYE, p.e || {}, (i ? p.r : p.l) || {});
      for (const n in e) o[k + n] = e[n];
    });
    return o;
  }

  function svg(c, id) {
    const inner = `transform="translate(${BASE[0]} ${BASE[1]}) scale(${INNER.sx} ${INNER.sy}) translate(${-BASE[0]} ${-BASE[1]})"`;
    const eyes = [0, 1].map(i =>
      `<rect class="e${i}" fill="${c.eye}"/><path class="t${i}" fill="${c.inner}"/><ellipse class="u${i}" fill="${c.inner}"/>` +
      `<path class="x${i}" stroke="${c.eye}" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0"/>`).join('');
    const sparks = SPARKS.map((_, i) => `<circle class="k${i}" r="1" fill="${c.inner}" opacity="0"/>`).join('');
    return `<svg viewBox="0 0 48 48" role="img" aria-label="Ember" style="overflow:visible;display:block;width:100%;height:auto">
<defs><clipPath id="${id}"><path class="clip" ${inner}/></clipPath></defs>
<g class="sparks">${sparks}</g>
<g class="body"><path class="outer" fill="${c.outer}"/><path class="inner" fill="${c.inner}" ${inner}/>
<g clip-path="url(#${id})">${eyes}</g></g></svg>`;
  }

  const alive = new Set();
  let running = false, last = 0;
  function loop(now) {
    const dt = Math.min(.033, (now - last) / 1000); last = now;
    alive.forEach(p => p._step(now, dt));
    if (alive.size) requestAnimationFrame(loop); else running = false;
  }
  function start() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); } }

  class Mascot {
    constructor(el, op) {
      op = op || {};
      this.c = typeof op.color === 'object' ? op.color : COLORS[op.color || 'ember'];
      el.innerHTML = svg(this.c, 'ember' + (uid++));
      const q = s => el.querySelector(s);
      this.n = { body: q('.body'), outer: q('.outer'), inner: q('.inner'), clip: q('.clip'),
        sparks: SPARKS.map((_, i) => q('.k' + i)),
        eyes: [0, 1].map(i => ({ r: q('.e' + i), t: q('.t' + i), u: q('.u' + i), x: q('.x' + i) })) };
      this.v = flat(); this.vel = {}; for (const k in this.v) this.vel[k] = 0; this.goal = flat();
      this.gaze = [0, 0]; this.blink = 0; this.blinkStart = -1; this.sparkT = 0;
      this.nextBlink = performance.now() + 1000 + Math.random() * 3000; this.phase = Math.random() * 6;
      this.name = null;
      if (op.follow) {
        this._move = e => {
          const r = el.getBoundingClientRect(), cx = r.left + r.width * .5, cy = r.top + r.height * .6;
          const lim = (v, m) => Math.max(-m, Math.min(m, v));
          this.gaze = [lim((e.clientX - cx) / innerWidth * 4, 1.6), lim((e.clientY - cy) / innerHeight * 4, 1.4)];
        };
        addEventListener('pointermove', this._move);
      }
      this.gesture(op.gesture || 'idle');
      alive.add(this); start();
    }
    /** Changes gesture. Takes a name from Ember.GESTURES or a custom list of steps. */
    gesture(g) {
      const steps = typeof g === 'string' ? GESTURES[g] : g;
      if (!steps) throw new Error('Ember: unknown gesture ' + g);
      if (typeof g === 'string') this.name = g;
      this.steps = steps; this.i = 0; this.t0 = performance.now(); this.goal = flat(steps[0][1]);
      return this;
    }
    /** Flares up once (the click reaction) and goes back to its gesture. */
    flare() {
      const back = this.name;
      this.gesture(FLARE);
      clearTimeout(this._fl);
      this._fl = setTimeout(() => this.gesture(back || 'idle'), 520);
      return this;
    }
    /** Stops it and removes it from the animation loop. */
    destroy() { alive.delete(this); if (this._move) removeEventListener('pointermove', this._move); }

    _step(now, dt) {
      const P = this.steps;
      while (now - this.t0 > P[this.i][0]) { this.t0 += P[this.i][0]; this.i = (this.i + 1) % P.length; this.goal = flat(P[this.i][1]); }
      const k = 190, d = 15; // spring: arrives, overshoots a little and settles
      for (const n in this.v) {
        let t = this.goal[n];
        if (n[1] === 'd' && n.length === 3) t += this.gaze[n[2] === 'x' ? 0 : 1];
        if (LESS_MOTION) { this.v[n] = t; continue; }
        this.vel[n] += (k * (t - this.v[n]) - d * this.vel[n]) * dt; this.v[n] += this.vel[n] * dt;
      }
      if (!LESS_MOTION) {
        if (now > this.nextBlink && this.blinkStart < 0) { this.blinkStart = now; this.double = Math.random() < .25; }
        if (this.blinkStart >= 0) {
          const e = now - this.blinkStart, len = this.double ? 340 : 150, f = e % 170 / 170;
          this.blink = e > len ? 0 : 1 - Math.abs(f * 2 - 1);
          if (e > len) { this.blinkStart = -1; this.nextBlink = now + 1800 + Math.random() * 4200; }
        }
        this.sparkT = this.v.spark > .05 ? this.sparkT + dt : 0;
      }
      this._draw(LESS_MOTION ? 0 : now);
    }
    _draw(now) {
      const v = this.v, a = (el, k, x) => el.setAttribute(k, x), t = now / 1000 + this.phase;
      // Flicker: a few incommensurate sines, so the flame never repeats the same way.
      const j = 1 + v.jit * 2.2;
      const sway = now ? (Math.sin(t * 2.1 * j) * .8 + Math.sin(t * 3.7 * j + 1.3) * .45) * (1 + v.jit) : 0;
      const lick = now ? Math.sin(t * 2.9 * j + 2) * 1.1 + Math.sin(t * 5.1 + .4) * .35 : 0;
      const breathe = now ? Math.sin(t * 4.6 * j) * .12 : 0;
      const d = flamePath(sway, lick, v.flare + breathe);
      a(this.n.outer, 'd', d); a(this.n.inner, 'd', d); a(this.n.clip, 'd', d);
      const resp = now ? Math.sin(now / 420 + this.phase) * .012 : 0;
      a(this.n.body, 'transform', `translate(${v.tx} ${v.ty}) rotate(${v.rot} ${BASE[0]} ${BASE[1]}) translate(${BASE[0]} ${BASE[1]}) scale(${v.sx * (1 + resp * .5)} ${v.sy * (1 - resp)}) translate(${-BASE[0]} ${-BASE[1]})`);
      // Sparks: rise and fade while the pose asks for them.
      this.n.sparks.forEach((c, i) => {
        const [x, y, ph] = SPARKS[i], f = (this.sparkT * 1.6 + ph) % 1;
        a(c, 'cx', x + v.tx + Math.sin((f + ph) * 7) * 1.2); a(c, 'cy', y + v.ty - f * 7);
        a(c, 'r', 1.1 * (1 - f * .6)); a(c, 'opacity', Math.max(0, Math.min(1, v.spark)) * (1 - f));
      });
      [0, 1].forEach(i => {
        const L = i ? 'R' : 'L', dir = i ? -1 : 1, g = n => v[L + n], o = this.n.eyes[i];
        const lt = Math.min(1, g('lt')), cx = CENTERS[i][0] + g('dx'), cy = CENTERS[i][1] + g('dy');
        const w = WIDTH * g('s'), h = HEIGHT * g('s') * g('sy') * (1 - .92 * (lt > .8 ? 0 : this.blink));
        a(o.r, 'x', cx - w / 2); a(o.r, 'y', cy - h / 2); a(o.r, 'width', w); a(o.r, 'height', Math.max(.2, h)); a(o.r, 'rx', Math.min(w, h) / 2);
        // Upper lid: a tilted straight edge in the inner-flame color that covers the top of the eye.
        const yT = cy - h / 2 + lt * h, m = Math.tan(g('at') * Math.PI / 180) * dir, xa = cx - w / 2 - .6, xb = cx + w / 2 + .6, top = cy - h / 2 - 3;
        a(o.t, 'd', `M${xa} ${yT + m * (xa - cx)} L${xb} ${yT + m * (xb - cx)} L${xb} ${top} L${xa} ${top}Z`);
        // Lower lid: an ellipse that rises and leaves a half-moon eye.
        const ry = h * .62, uy = cy + h / 2 + ry - g('lb') * h * 1.1;
        a(o.u, 'cx', cx); a(o.u, 'cy', uy); a(o.u, 'rx', w * .98); a(o.u, 'ry', ry); a(o.u, 'transform', `rotate(${g('ab') * dir} ${cx} ${uy})`);
        const xo = Math.min(1, Math.max(0, g('x'))), r = 1.9;
        a(o.r, 'opacity', 1 - xo); a(o.x, 'opacity', xo);
        a(o.x, 'd', `M${cx - r} ${cy - r} L${cx + r} ${cy + r} M${cx + r} ${cy - r} L${cx - r} ${cy + r}`);
      });
    }
  }

  window.Ember = {
    create: (el, op) => new Mascot(el, op),
    GESTURES, COLORS,
    geometry: { flamePath, BASE, INNER, CENTERS, WIDTH, HEIGHT }
  };
})();
