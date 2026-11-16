/* China Lingo: sound, voice and haptics engine.
 *
 * Audio sources, best first:
 *   1. Recorded files from audio/index.json (ElevenLabs sound effects + Mandarin phrase recordings)
 *   2. Fallbacks: synthesized effects (Web Audio oscillators) and the device's Chinese TTS voice
 *
 * iPhone notes:
 *   - Web Audio only starts inside a user gesture; we resume on every gesture until it is running,
 *     and never schedule sounds against a suspended clock (that was the "no sound" bug).
 *   - navigator.audioSession "playback" (iOS 17+) lets effects play with the ring switch on silent.
 *   - Phrase recordings play through one <audio> element that is unlocked on the first tap,
 *     so later playback (e.g. auto-play on a new card) is allowed.
 *   - Safari has no Vibration API; iOS 18+ gives a system tap when a switch checkbox is toggled.
 */
(function () {
  "use strict";
  const AC = window.AudioContext || window.webkitAudioContext;
  const setting = (k, d) => (typeof S !== "undefined" && S && k in S ? S[k] : d);
  let ctx = null, out = null;

  /* ---------- tiny silent WAV (used to unlock media elements) ---------- */
  const SILENT = (() => {
    const n = 800, b = new Uint8Array(44 + n), v = new DataView(b.buffer);
    const w = (o, s) => [...s].forEach((c, i) => b[o + i] = c.charCodeAt(0));
    w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, "data"); v.setUint32(40, n, true);
    b.fill(128, 44);
    let s = ""; b.forEach(x => s += String.fromCharCode(x));
    return "data:audio/wav;base64," + btoa(s);
  })();

  function applySession() {
    try { if (navigator.audioSession) navigator.audioSession.type = setting("silentSound", true) ? "playback" : "ambient"; } catch (e) {}
  }
  function ensure() {
    if (!AC) return null;
    if (!ctx) {
      try { ctx = new AC({ latencyHint: "interactive" }); } catch (e) { ctx = new AC(); }
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.ratio.value = 3;
      out = ctx.createGain(); out.gain.value = 0.9;
      out.connect(comp).connect(ctx.destination);
    }
    return ctx;
  }
  /* run fn once the context is running (or give up and use the fallback) */
  function whenRunning(fn, fallback) {
    const c = ensure();
    if (!c) { fallback && fallback(); return; }
    if (c.state === "running") { fn(c); return; }
    c.resume().then(() => { c.state === "running" ? fn(c) : fallback && fallback(); }, () => fallback && fallback());
  }

  /* ---------- voice element (phrase recordings) ---------- */
  const voiceEl = new Audio();
  voiceEl.preload = "auto";
  try { voiceEl.preservesPitch = true; voiceEl.webkitPreservesPitch = true; } catch (e) {}
  let voiceUnlocked = false, speechPrimed = false;

  function unlock() {
    applySession();
    const c = ensure();
    if (c && c.state !== "running") {
      c.resume().catch(() => {});
      try { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (e) {}
    }
    if (!voiceUnlocked) {
      voiceUnlocked = true;
      try { voiceEl.src = SILENT; const p = voiceEl.play(); p && p.then(() => voiceEl.pause(), () => { voiceUnlocked = false; }); } catch (e) { voiceUnlocked = false; }
    }
    if (!speechPrimed && "speechSynthesis" in window && !hasRecordings()) {
      speechPrimed = true;
      try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); } catch (e) {}
    }
    loadSfxBuffers();
  }
  ["pointerdown", "touchend", "click", "keydown"].forEach(ev => window.addEventListener(ev, unlock, { capture: true, passive: true }));
  document.addEventListener("visibilitychange", () => { if (!document.hidden && ctx && ctx.state !== "running") ctx.resume().catch(() => {}); });

  /* ---------- recorded audio index ---------- */
  let INDEX = null;
  const hasRecordings = () => !!(INDEX && INDEX.zh && Object.keys(INDEX.zh).length);
  const ready = fetch("audio/index.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : null).then(j => { INDEX = j; }).catch(() => {});

  const buffers = {};
  let loadingSfx = false;
  function loadSfxBuffers() {
    if (loadingSfx || !INDEX || !INDEX.sfx) return;
    const c = ensure(); if (!c) return;
    loadingSfx = true;
    Object.entries(INDEX.sfx).forEach(([name, url]) => {
      fetch(url).then(r => r.arrayBuffer()).then(ab => new Promise((res, rej) => c.decodeAudioData(ab, res, rej)))
        .then(buf => { buffers[name] = buf; }).catch(() => {});
    });
  }
  ready.then(() => { if (ctx) loadSfxBuffers(); });

  function playFile(name, gain) {
    const url = INDEX.sfx[name];
    const html = () => { try { const a = new Audio(url); a.volume = Math.min(1, gain); a.play().catch(() => {}); } catch (e) {} };
    if (!buffers[name]) return html();
    whenRunning(c => {
      const src = c.createBufferSource(), g = c.createGain();
      src.buffer = buffers[name]; g.gain.value = gain;
      src.connect(g).connect(out); src.start();
    }, html);
  }

  /* ---------- synthesized fallback effects ---------- */
  function note(c, f, t0, dur, { type = "sine", g = 0.2, layer = null, bend = 0 } = {}) {
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(g, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    env.connect(out);
    const mk = (tp, det) => {
      const o = c.createOscillator(); o.type = tp; o.frequency.setValueAtTime(f, t0);
      if (bend) o.frequency.exponentialRampToValueAtTime(f * bend, t0 + dur);
      o.detune.value = det; o.connect(env); o.start(t0); o.stop(t0 + dur + 0.05);
    };
    mk(type, 0); if (layer) mk(layer, 7);
  }
  const bell = { type: "sine", layer: "triangle", g: 0.22 };
  const SYNTH = {
    tap: [[1400, 0, 0.04, { type: "sine", g: 0.05 }]],
    ok: [[880, 0, 0.16, bell], [1318.5, 0.08, 0.32, bell]],
    bad: [[196, 0, 0.22, { type: "square", g: 0.08, bend: 0.8 }], [155.6, 0.12, 0.3, { type: "square", g: 0.08, bend: 0.8 }]],
    combo: [[784, 0, 0.12, bell], [988, 0.07, 0.12, bell], [1175, 0.14, 0.12, bell], [1568, 0.21, 0.35, bell]],
    heart: [[440, 0, 0.18, { type: "triangle", g: 0.2, bend: 0.6 }], [330, 0.14, 0.3, { type: "triangle", g: 0.2, bend: 0.6 }]],
    coin: [[1318.5, 0, 0.08, { type: "square", g: 0.06 }], [1975.5, 0.07, 0.3, { type: "square", g: 0.06 }]],
    whoosh: [[300, 0, 0.18, { type: "sine", g: 0.08, bend: 3 }]],
    fanfare: [[523.3, 0, 0.14, bell], [659.3, 0.12, 0.14, bell], [784, 0.24, 0.14, bell], [1046.5, 0.36, 0.5, bell], [784, 0.36, 0.5, { type: "triangle", g: 0.1 }], [1318.5, 0.62, 0.6, bell]],
    level: [392, 523.3, 659.3, 784, 1046.5, 1318.5, 1568].map((f, i) => [f, i * 0.08, i === 6 ? 0.6 : 0.14, bell])
  };
  SYNTH.chest = SYNTH.coin; SYNTH.streak = SYNTH.combo;
  function playSynth(name) {
    const seq = SYNTH[name]; if (!seq) return;
    whenRunning(c => { const now = c.currentTime + 0.02; seq.forEach(([f, at, dur, opt]) => note(c, f, now + at, dur, opt)); });
  }

  const GAIN = { tap: 0.35, whoosh: 0.5 };
  function sfx(name) {
    if (!setting("sound", true)) return;
    if (INDEX && INDEX.sfx && INDEX.sfx[name]) playFile(name, GAIN[name] || 0.9);
    else playSynth(name);
  }
  window.SFX = {};
  ["tap", "ok", "bad", "combo", "heart", "coin", "whoosh", "fanfare", "level", "chest", "streak"].forEach(n => window.SFX[n] = () => sfx(n));

  /* ---------- haptics ---------- */
  const canVibrate = typeof navigator.vibrate === "function";
  function iosTap() {
    try {
      const label = document.createElement("label");
      label.setAttribute("aria-hidden", "true"); label.style.display = "none";
      const input = document.createElement("input"); input.type = "checkbox"; input.setAttribute("switch", "");
      label.appendChild(input); document.head.appendChild(label); label.click(); document.head.removeChild(label);
    } catch (e) {}
  }
  window.buzz = function (p) {
    if (!setting("haptic", true)) return;
    if (canVibrate) { try { navigator.vibrate(p); } catch (e) {} return; }
    const arr = Array.isArray(p) ? p : [p];
    iosTap();
    let t = 0;
    for (let i = 2; i < arr.length && i < 8; i += 2) { t += (arr[i - 1] || 60) + (arr[i - 2] || 20); setTimeout(iosTap, t); }
  };
  window.tick = function () { window.SFX.tap(); window.buzz(8); };

  /* ---------- Mandarin voice ---------- */
  let zhVoice = null;
  function pickVoice() {
    try {
      const w = document.getElementById("vw");
      if (hasRecordings()) { if (w) w.style.display = "none"; }
      const v = speechSynthesis.getVoices(); if (!v.length) return;
      const zh = v.filter(x => /^(zh|cmn)/i.test(x.lang));
      zhVoice = zh.find(x => /zh[-_]CN/i.test(x.lang) && /premium|enhanced|natural|neural/i.test(x.name))
        || zh.find(x => /zh[-_]CN/i.test(x.lang) && x.localService) || zh.find(x => /zh[-_]CN/i.test(x.lang)) || zh[0] || null;
      if (w) w.style.display = zhVoice || hasRecordings() ? "none" : "block";
    } catch (e) {}
  }
  if ("speechSynthesis" in window) { pickVoice(); try { speechSynthesis.addEventListener("voiceschanged", pickVoice); } catch (e) {} }
  ready.then(pickVoice);

  let sayTimer = 0;
  function ttsSay(text, slow) {
    try {
      clearTimeout(sayTimer);
      const go = () => { const u = new SpeechSynthesisUtterance(text); u.lang = "zh-CN"; if (zhVoice) u.voice = zhVoice; u.rate = slow ? 0.5 : 0.85; speechSynthesis.speak(u); };
      if (speechSynthesis.speaking || speechSynthesis.pending) { speechSynthesis.cancel(); sayTimer = setTimeout(go, 80); } else go();
    } catch (e) {}
  }
  window.say = function (text, slow) {
    const file = INDEX && INDEX.zh && INDEX.zh[text];
    if (!file) return ttsSay(text, slow);
    try { speechSynthesis.cancel(); } catch (e) {}
    try {
      voiceEl.pause();
      voiceEl.src = file;
      voiceEl.playbackRate = slow ? 0.7 : 1;
      const p = voiceEl.play();
      p && p.catch(err => { if (err && err.name !== "AbortError") ttsSay(text, slow); });
    } catch (e) { ttsSay(text, slow); }
  };
  window.hush = function () { try { clearTimeout(sayTimer); speechSynthesis.cancel(); } catch (e) {} try { voiceEl.pause(); } catch (e) {} };

  /* ---------- speech recognition (speaking exercises) ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  window.ASR = {
    supported: !!SR,
    listen(onDone, onInterim) {
      const r = new SR();
      r.lang = "zh-CN"; r.interimResults = true; r.maxAlternatives = 5; r.continuous = false;
      let finals = [], done = false;
      const finish = err => { if (done) return; done = true; onDone(err, finals); };
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

  window.FX = {
    unlock, applySession, canVibrate, ready,
    hasRecordings, hasSfx: () => !!(INDEX && INDEX.sfx && Object.keys(INDEX.sfx).length),
    audioIndex: () => INDEX,
    state: () => ({ ctx: ctx ? ctx.state : "none", recordings: hasRecordings(), sfxLoaded: Object.keys(buffers).length })
  };
})();
