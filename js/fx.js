/* China Lingo: sound, speech and haptics engine.
   Why the old version was silent/still on phones:
   - Web Audio must be created AND resumed inside a real user gesture, and iOS needs a
     buffer played during that gesture to "unlock" output. We unlock on the first touch.
   - On iPhone the ring/silent switch mutes Web Audio by default. iOS 17+ exposes
     navigator.audioSession; type "playback" lets effects play even in silent mode.
   - Safari has no navigator.vibrate. iOS 18+ gives a system haptic tap when a
     <input type="checkbox" switch> is toggled through its label, so we use that there. */
(function () {
  "use strict";
  const AC = window.AudioContext || window.webkitAudioContext;
  const setting = (k, d) => (typeof S !== "undefined" && S && k in S ? S[k] : d);
  let ctx = null, out = null, unlocked = false;

  function applySession() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = setting("silentSound", true) ? "playback" : "ambient";
    } catch (e) {}
  }
  function ensure() {
    if (!AC) return null;
    if (!ctx) {
      try { ctx = new AC({ latencyHint: "interactive" }); } catch (e) { ctx = new AC(); }
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      out = ctx.createGain(); out.gain.value = 0.9;
      out.connect(comp).connect(ctx.destination);
    }
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    return ctx;
  }
  function unlock() {
    applySession();
    const c = ensure();
    if (c && !(unlocked && c.state === "running")) {
      try {
        const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource();
        s.buffer = b; s.connect(c.destination); s.start(0);
        unlocked = c.state === "running";
      } catch (e) {}
    }
    /* iOS: the first speech must also start inside a gesture */
    if (!speechPrimed && "speechSynthesis" in window) {
      speechPrimed = true;
      try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); } catch (e) {}
    }
  }
  let speechPrimed = false;
  ["pointerdown", "touchend", "click", "keydown"].forEach(ev =>
    window.addEventListener(ev, unlock, { capture: true, passive: true }));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && ctx && ctx.state !== "running") ctx.resume().catch(() => {});
  });

  /* one voice: oscillator (+ optional detuned layer) through an envelope */
  function note(f, t0, dur, { type = "sine", g = 0.2, layer = null, bend = 0 } = {}) {
    const c = ctx, env = c.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(g, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    env.connect(out);
    const mk = (tp, det) => {
      const o = c.createOscillator(); o.type = tp; o.frequency.setValueAtTime(f, t0);
      if (bend) o.frequency.exponentialRampToValueAtTime(f * bend, t0 + dur);
      o.detune.value = det; o.connect(env); o.start(t0); o.stop(t0 + dur + 0.05);
    };
    mk(type, 0);
    if (layer) mk(layer, 7);
  }
  function play(seq) {
    if (!setting("sound", true)) return;
    const c = ensure();
    if (!c) return;
    const now = c.currentTime + 0.01;
    seq.forEach(([f, at, dur, opt]) => note(f, now + at, dur, opt));
  }
  const bell = { type: "sine", layer: "triangle", g: 0.22 };
  window.SFX = {
    tap: () => play([[1400, 0, 0.04, { type: "sine", g: 0.05 }]]),
    ok: () => play([[880, 0, 0.16, bell], [1318.5, 0.08, 0.32, bell]]),
    bad: () => play([[196, 0, 0.22, { type: "square", g: 0.08, bend: 0.8 }], [155.6, 0.12, 0.3, { type: "square", g: 0.08, bend: 0.8 }]]),
    combo: () => play([[784, 0, 0.12, bell], [988, 0.07, 0.12, bell], [1175, 0.14, 0.12, bell], [1568, 0.21, 0.35, bell]]),
    heart: () => play([[440, 0, 0.18, { type: "triangle", g: 0.2, bend: 0.6 }], [330, 0.14, 0.3, { type: "triangle", g: 0.2, bend: 0.6 }]]),
    coin: () => play([[1318.5, 0, 0.08, { type: "square", g: 0.06 }], [1975.5, 0.07, 0.3, { type: "square", g: 0.06 }]]),
    whoosh: () => play([[300, 0, 0.18, { type: "sine", g: 0.08, bend: 3 }]]),
    fanfare: () => play([[523.3, 0, 0.14, bell], [659.3, 0.12, 0.14, bell], [784, 0.24, 0.14, bell], [1046.5, 0.36, 0.5, bell], [784, 0.36, 0.5, { type: "triangle", g: 0.1 }], [1318.5, 0.62, 0.6, bell]]),
    level: () => play([392, 523.3, 659.3, 784, 1046.5, 1318.5, 1568].map((f, i) => [f, i * 0.08, i === 6 ? 0.6 : 0.14, bell]))
  };

  /* ---------- haptics ---------- */
  const canVibrate = typeof navigator.vibrate === "function";
  function iosTap() {
    try {
      const label = document.createElement("label");
      label.setAttribute("aria-hidden", "true");
      label.style.display = "none";
      const input = document.createElement("input");
      input.type = "checkbox"; input.setAttribute("switch", "");
      label.appendChild(input);
      document.head.appendChild(label);
      label.click();
      document.head.removeChild(label);
    } catch (e) {}
  }
  /* pattern: number (ms) or [on, off, on, ...] like navigator.vibrate */
  window.buzz = function (p) {
    if (!setting("haptic", true)) return;
    if (canVibrate) { try { navigator.vibrate(p); } catch (e) {} return; }
    const arr = Array.isArray(p) ? p : [p];
    iosTap();
    let t = 0;
    for (let i = 2; i < arr.length && i < 8; i += 2) { t += (arr[i - 1] || 60) + (arr[i - 2] || 20); setTimeout(iosTap, t); }
  };
  /* light tick for every tap/selection */
  window.tick = function () { window.SFX.tap(); window.buzz(8); };
  window.FX = { unlock, applySession, canVibrate };

  /* ---------- speech (Mandarin TTS) ---------- */
  let zhVoice = null;
  function pickVoice() {
    try {
      const v = speechSynthesis.getVoices();
      if (!v.length) return;
      const zh = v.filter(x => /^(zh|cmn)/i.test(x.lang));
      zhVoice = zh.find(x => /zh[-_]CN/i.test(x.lang) && /premium|enhanced|natural|neural/i.test(x.name))
        || zh.find(x => /zh[-_]CN/i.test(x.lang) && x.localService)
        || zh.find(x => /zh[-_]CN/i.test(x.lang)) || zh[0] || null;
      const w = document.getElementById("vw");
      if (w) w.style.display = zhVoice ? "none" : "block";
    } catch (e) {}
  }
  if ("speechSynthesis" in window) { pickVoice(); try { speechSynthesis.addEventListener("voiceschanged", pickVoice); } catch (e) {} }
  /* Safari drops an utterance queued in the same tick as cancel(), so wait a beat when interrupting */
  let sayTimer = 0;
  window.say = function (text, slow) {
    try {
      clearTimeout(sayTimer);
      const go = () => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "zh-CN"; if (zhVoice) u.voice = zhVoice;
        u.rate = slow ? 0.5 : 0.85;
        speechSynthesis.speak(u);
      };
      if (speechSynthesis.speaking || speechSynthesis.pending) { speechSynthesis.cancel(); sayTimer = setTimeout(go, 80); }
      else go();
    } catch (e) {}
  };
  window.hush = function () { try { clearTimeout(sayTimer); speechSynthesis.cancel(); } catch (e) {} };

  /* ---------- speech recognition (speaking exercises) ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  window.ASR = {
    supported: !!SR,
    listen(onDone, onInterim) {
      const r = new SR();
      r.lang = "zh-CN"; r.interimResults = true; r.maxAlternatives = 5; r.continuous = false;
      let finals = [], done = false;
      const finish = (err) => { if (done) return; done = true; onDone(err, finals); };
      r.onresult = ev => {
        const res = ev.results[ev.results.length - 1];
        const alts = Array.from(res).map(a => a.transcript);
        if (onInterim) onInterim(alts[0] || "");
        if (res.isFinal) { finals = alts; try { r.stop(); } catch (e) {} finish(null); }
      };
      r.onerror = ev => finish(ev.error || "error");
      r.onend = () => finish(finals.length ? null : "no-speech");
      try { r.start(); } catch (e) { finish("start-failed"); }
      return () => { try { r.stop(); } catch (e) {} };
    }
  };
})();
