/* China Lingo: sound, voice and haptics engine (v1.3)
 *
 * Everything plays through HTML <audio> elements ("media playback"), not Web Audio:
 *   - On iPhone, Web Audio is muted by the silent switch / silent mode and needs a running
 *     AudioContext; media elements play like a video does and are far more reliable.
 *   - A pool of <audio> elements is unlocked on the first tap, so sounds triggered a moment
 *     later (combo banner, auto-play of a new phrase) are still allowed.
 *   - Built-in sound effects are rendered once to WAV files in the browser (OfflineAudioContext),
 *     then played like any other file. ElevenLabs files from audio/index.json replace them.
 *   - Web Audio is only a last-resort fallback if a media element refuses to play.
 *   - Mandarin: recorded phrase files when present, else the device's Chinese TTS voice.
 */
(function () {
  "use strict";
  const setting = (k, d) => (typeof S !== "undefined" && S && k in S ? S[k] : d);
  const LOG = [];
  const log = m => { LOG.push(new Date().toISOString().slice(11, 19) + " " + m); if (LOG.length > 60) LOG.shift(); };

  /* ---------- WAV encoding ---------- */
  function wavFromFloat(ch, rate) {
    const n = ch.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, ch[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    return new Blob([b], { type: "audio/wav" });
  }
  const SILENT = URL.createObjectURL(wavFromFloat(new Float32Array(2205), 22050));

  /* ---------- <audio> pool ---------- */
  const POOL = Array.from({ length: 6 }, () => { const a = new Audio(); a.preload = "auto"; a.setAttribute("playsinline", ""); return a; });
  const voiceEl = new Audio(); voiceEl.preload = "auto"; voiceEl.setAttribute("playsinline", "");
  try { voiceEl.preservesPitch = true; voiceEl.webkitPreservesPitch = true; } catch (e) {}
  let unlocked = false, rr = 0, lastErr = "";

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    [...POOL, voiceEl].forEach(a => {
      try { a.src = SILENT; const p = a.play(); p && p.then(() => a.pause(), e => { unlocked = false; lastErr = "unlock: " + e.name; log(lastErr); }); }
      catch (e) { unlocked = false; }
    });
    log("unlock attempted");
    renderSynth();
  }
  ["touchend", "click", "keydown", "pointerup"].forEach(ev => window.addEventListener(ev, unlock, { capture: true, passive: true }));

  function playUrl(url, label) {
    const a = POOL[rr++ % POOL.length];
    try {
      a.pause(); a.src = url; a.currentTime = 0;
      const p = a.play();
      if (p) p.then(() => log("played " + label), e => { lastErr = label + ": " + e.name + " " + e.message; log(lastErr); webAudioFallback(label); });
    } catch (e) { lastErr = label + ": " + e.message; log(lastErr); webAudioFallback(label); }
  }

  /* ---------- built-in effects: synthesized once, rendered to WAV ---------- */
  const bell = { type: "sine", layer: "triangle", g: 0.3 };
  const SYNTH = {
    tap: [[1500, 0, 0.05, { type: "sine", g: 0.18 }]],
    ok: [[880, 0, 0.16, bell], [1318.5, 0.08, 0.36, bell]],
    bad: [[196, 0, 0.22, { type: "square", g: 0.12, bend: 0.8 }], [155.6, 0.12, 0.3, { type: "square", g: 0.12, bend: 0.8 }]],
    combo: [[784, 0, 0.12, bell], [988, 0.07, 0.12, bell], [1175, 0.14, 0.12, bell], [1568, 0.21, 0.4, bell]],
    heart: [[440, 0, 0.18, { type: "triangle", g: 0.3, bend: 0.6 }], [330, 0.14, 0.32, { type: "triangle", g: 0.3, bend: 0.6 }]],
    coin: [[1318.5, 0, 0.08, { type: "square", g: 0.09 }], [1975.5, 0.07, 0.32, { type: "square", g: 0.09 }]],
    whoosh: [[300, 0, 0.2, { type: "sine", g: 0.16, bend: 3 }]],
    fanfare: [[523.3, 0, 0.14, bell], [659.3, 0.12, 0.14, bell], [784, 0.24, 0.14, bell], [1046.5, 0.36, 0.5, bell], [784, 0.36, 0.5, { type: "triangle", g: 0.14 }], [1318.5, 0.62, 0.6, bell]],
    level: [392, 523.3, 659.3, 784, 1046.5, 1318.5, 1568].map((f, i) => [f, i * 0.08, i === 6 ? 0.6 : 0.14, bell])
  };
  SYNTH.chest = SYNTH.coin; SYNTH.streak = SYNTH.combo;
  function schedule(c, dest, seq, t0) {
    seq.forEach(([f, at, dur, { type = "sine", g = 0.2, layer = null, bend = 0 } = {}]) => {
      const st = t0 + at, env = c.createGain();
      env.gain.setValueAtTime(0.0001, st); env.gain.exponentialRampToValueAtTime(g, st + 0.012); env.gain.exponentialRampToValueAtTime(0.0001, st + dur);
      env.connect(dest);
      [[type, 0], ...(layer ? [[layer, 7]] : [])].forEach(([tp, det]) => {
        const o = c.createOscillator(); o.type = tp; o.frequency.setValueAtTime(f, st);
        if (bend) o.frequency.exponentialRampToValueAtTime(f * bend, st + dur);
        o.detune.value = det; o.connect(env); o.start(st); o.stop(st + dur + 0.05);
      });
    });
  }
  const synthUrls = {};
  let rendering = false;
  function renderSynth() {
    if (rendering) return; rendering = true;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) { log("no OfflineAudioContext"); return; }
    const rate = 44100;
    Object.entries(SYNTH).forEach(([name, seq]) => {
      if (synthUrls[name]) return;
      const len = Math.max(...seq.map(([, at, dur]) => at + dur)) + 0.12;
      try {
        const c = new OAC(1, Math.ceil(len * rate), rate);
        schedule(c, c.destination, seq, 0.005);
        const done = buf => { synthUrls[name] = URL.createObjectURL(wavFromFloat(buf.getChannelData(0), rate)); };
        const p = c.startRendering();
        if (p && p.then) p.then(done, e => log("render " + name + " " + e)); else c.oncomplete = ev => done(ev.renderedBuffer);
      } catch (e) { log("render fail " + name + " " + e.message); }
    });
  }
  renderSynth();

  /* ---------- last resort: live Web Audio ---------- */
  let ctx = null;
  function webAudioFallback(name) {
    const seq = SYNTH[name]; if (!seq) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ctx = ctx || new AC();
      const go = () => schedule(ctx, ctx.destination, seq, ctx.currentTime + 0.02);
      ctx.state === "running" ? go() : ctx.resume().then(() => ctx.state === "running" && go(), () => {});
    } catch (e) {}
  }

  /* ---------- recorded audio index (ElevenLabs) ---------- */
  let INDEX = null;
  const hasRecordings = () => !!(INDEX && INDEX.zh && Object.keys(INDEX.zh).length);
  const ready = fetch("audio/index.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : null).then(j => { INDEX = j; log(j ? "audio index loaded" : "no audio index"); }).catch(() => log("no audio index"));

  function sfx(name) {
    if (!setting("sound", true)) return;
    const url = (INDEX && INDEX.sfx && INDEX.sfx[name]) || synthUrls[name];
    if (url) playUrl(url, name); else webAudioFallback(name);
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
  let zhVoice = null, voiceCount = 0;
  function pickVoice() {
    try {
      const w = document.getElementById("vw");
      const v = speechSynthesis.getVoices(); voiceCount = v.length;
      const zh = v.filter(x => /^(zh|cmn)/i.test(x.lang));
      zhVoice = zh.find(x => /zh[-_]CN/i.test(x.lang) && /premium|enhanced|natural|neural/i.test(x.name))
        || zh.find(x => /zh[-_]CN/i.test(x.lang) && x.localService) || zh.find(x => /zh[-_]CN/i.test(x.lang)) || zh[0] || null;
      if (w) w.style.display = (zhVoice || hasRecordings() || !v.length) ? "none" : "block";
    } catch (e) {}
  }
  if ("speechSynthesis" in window) { pickVoice(); try { speechSynthesis.addEventListener("voiceschanged", pickVoice); } catch (e) {} }
  ready.then(pickVoice);

  let sayTimer = 0;
  function ttsSay(text, slow, cb) {
    if (!("speechSynthesis" in window)) { cb && cb("no speechSynthesis"); return; }
    try {
      clearTimeout(sayTimer);
      const go = () => {
        const u = new SpeechSynthesisUtterance(text); u.lang = "zh-CN"; if (zhVoice) u.voice = zhVoice; u.rate = slow ? 0.5 : 0.85; u.volume = 1;
        u.onstart = () => { log("tts start"); cb && cb(null, "started"); cb = null; };
        u.onerror = e => { log("tts error " + e.error); cb && cb(e.error); cb = null; };
        speechSynthesis.speak(u);
        if (speechSynthesis.paused) speechSynthesis.resume();
      };
      if (speechSynthesis.speaking || speechSynthesis.pending) { speechSynthesis.cancel(); sayTimer = setTimeout(go, 80); } else go();
    } catch (e) { cb && cb(e.message); }
  }
  window.say = function (text, slow) {
    const file = INDEX && INDEX.zh && INDEX.zh[text];
    if (!file) return ttsSay(text, slow);
    try { speechSynthesis.cancel(); } catch (e) {}
    try {
      voiceEl.pause(); voiceEl.src = file; voiceEl.playbackRate = slow ? 0.7 : 1;
      const p = voiceEl.play();
      p && p.catch(err => { if (err && err.name !== "AbortError") { log("voice file " + err.name); ttsSay(text, slow); } });
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

  /* ---------- on-device sound check ---------- */
  function testEffect(cb) {
    const url = synthUrls.ok; if (!url) return cb("effect not rendered yet");
    const a = new Audio(url); a.setAttribute("playsinline", "");
    a.play().then(() => cb(null, "played"), e => cb(e.name + ": " + e.message));
  }
  function testVoiceFile(cb) {
    if (!hasRecordings()) return cb("no recordings yet");
    const a = new Audio(Object.values(INDEX.zh)[0]);
    a.play().then(() => cb(null, "played"), e => cb(e.name + ": " + e.message));
  }
  function testTTS(cb) {
    let answered = false;
    ttsSay("你好，欢迎！", false, (err, ok) => { answered = true; cb(err, ok); });
    setTimeout(() => { if (!answered) cb("no start event after 3s (speech engine silent)"); }, 3000);
  }
  function env() {
    const ua = navigator.userAgent, ios = (ua.match(/OS (\d+)_(\d+)/) || [])[0];
    return {
      app: typeof APP_VERSION !== "undefined" ? APP_VERSION : "?",
      device: ios ? "iOS " + ios.slice(3).replace("_", ".") : (/Android/.test(ua) ? "Android" : "other"),
      standalone: matchMedia("(display-mode: standalone)").matches || navigator.standalone === true,
      unlocked, effectsRendered: Object.keys(synthUrls).length, recordings: hasRecordings(),
      ttsVoices: voiceCount, zhVoice: zhVoice ? zhVoice.name : "none",
      vibrate: canVibrate, lastError: lastErr || "none"
    };
  }

  window.FX = {
    unlock, canVibrate, ready, hasRecordings,
    hasSfx: () => !!(INDEX && INDEX.sfx && Object.keys(INDEX.sfx).length),
    audioIndex: () => INDEX,
    state: () => ({ ctx: unlocked ? "unlocked" : "locked", recordings: hasRecordings(), sfxLoaded: Object.keys(synthUrls).length }),
    tests: { effect: testEffect, voiceFile: testVoiceFile, tts: testTTS }, env, log: () => LOG.slice()
  };
})();
