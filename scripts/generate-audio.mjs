#!/usr/bin/env node
/* Generate China Lingo audio with ElevenLabs.
 *
 *   ELEVENLABS_API_KEY=... node scripts/generate-audio.mjs
 *
 * Env:
 *   ELEVENLABS_API_KEY   required
 *   ELEVENLABS_VOICE_ID  voice for Mandarin phrases (pick a native Mandarin voice from the Voice Library)
 *   ELEVENLABS_MODEL_ID  TTS model (default eleven_multilingual_v2)
 *   FORCE=true           regenerate everything
 *
 * Output (committed to the repo, served as static files):
 *   audio/sfx/<name>.mp3        game sound effects
 *   audio/zh/<hash>.mp3         one recording per phrase (hash of text + voice + model)
 *   audio/index.json            { sfx: {name: file}, zh: {text: file}, voice, model }
 *
 * Idempotent: existing files are reused; files no longer referenced are deleted.
 */
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
const MODEL = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
const FORCE = /^(1|true|yes)$/i.test(process.env.FORCE || "");
const API = process.env.ELEVENLABS_API_BASE || "https://api.elevenlabs.io/v1";
const FORMAT = "mp3_44100_128";

if (!KEY) { console.error("ELEVENLABS_API_KEY is not set."); process.exit(1); }
if (!process.env.ELEVENLABS_VOICE_ID) console.warn("⚠️  ELEVENLABS_VOICE_ID not set: using a default English-native voice. Set a native Mandarin voice for best pronunciation.");

/* ---- sound effects: name -> [prompt, seconds] ---- */
const SFX = {
  ok:      ["Bright, cheerful two-note chime for a correct answer in a mobile language-learning game. Clean, short, satisfying, no reverb tail.", 1.0],
  bad:     ["Soft, low, muted two-tone buzz for a wrong answer in a friendly learning app. Gentle, not harsh, short.", 0.8],
  tap:     ["Very short, soft UI tap click, subtle wooden pop, like pressing a button in a mobile app.", 0.5],
  combo:   ["Rising sparkly four-note arpeggio with a shimmer, reward for a streak of correct answers in a mobile game.", 1.2],
  heart:   ["Short descending deflating 'bloop' for losing a life in a casual mobile game. Cute, not scary.", 0.8],
  coin:    ["Quick bright coin and gem collect sparkle, reward pickup in a mobile game.", 0.8],
  whoosh:  ["Quick soft airy whoosh, screen transition swipe in a mobile app.", 0.6],
  fanfare: ["Short triumphant celebratory fanfare with bells and chimes, lesson complete in a mobile learning game. Happy and bright.", 2.5],
  level:   ["Magical level-up jingle with ascending chimes and sparkle, mobile game.", 2.0],
  chest:   ["Wooden treasure chest creaking open followed by a magical sparkle and coins jingling.", 1.6],
  streak:  ["Fire igniting whoosh followed by a celebratory sparkle, daily streak extended in a mobile game.", 1.6]
};

/* ---- phrase texts: same strings the app passes to say() ---- */
async function phraseTexts() {
  const src = await fs.readFile(path.join(ROOT, "js/data.js"), "utf8");
  const UNITS = vm.runInNewContext(src + "\n;UNITS");
  const isA = c => /[A-Za-z0-9]/.test(c);
  const joinZh = ch => { let s = ""; ch.forEach((c, i) => { if (i && (isA(s.slice(-1)) || isA(c[0]))) s += " "; s += c; }); return s; };
  const texts = new Set();
  for (const u of UNITS) for (const r of u.items) texts.add(joinZh(r[0].split(" ")));
  ["妈", "麻", "马", "骂", "你好，欢迎！"].forEach(t => texts.add(t));
  return [...texts];
}

const fnv = s => { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, "0"); };
const exists = p => fs.access(p).then(() => true, () => false);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(url, body, label) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, { method: "POST", headers: { "xi-api-key": KEY, "Content-Type": "application/json", Accept: "audio/mpeg" }, body: JSON.stringify(body) });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const msg = (await res.text()).slice(0, 300);
    if ((res.status === 429 || res.status >= 500) && attempt < 5) { const wait = 1500 * attempt; console.warn(`  ↻ ${label}: HTTP ${res.status}, retrying in ${wait}ms`); await sleep(wait); continue; }
    throw new Error(`${label}: HTTP ${res.status} ${msg}`);
  }
}

async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } })); }

async function main() {
  const sfxDir = path.join(ROOT, "audio/sfx"), zhDir = path.join(ROOT, "audio/zh");
  await fs.mkdir(sfxDir, { recursive: true }); await fs.mkdir(zhDir, { recursive: true });
  const prev = await fs.readFile(path.join(ROOT, "audio/index.json"), "utf8").then(JSON.parse, () => ({}));
  const index = { generated: new Date().toISOString(), voice: VOICE, model: MODEL, sfx: {}, zh: {} };
  let made = 0, reused = 0;

  /* SFX: file name includes a hash of the prompt so editing a prompt regenerates it */
  await pool(Object.entries(SFX), 2, async ([name, [prompt, secs]]) => {
    const file = `audio/sfx/${name}-${fnv(prompt + secs)}.mp3`;
    index.sfx[name] = file;
    if (!FORCE && await exists(path.join(ROOT, file))) { reused++; return; }
    const buf = await call(`${API}/sound-generation?output_format=${FORMAT}`, { text: prompt, duration_seconds: secs, prompt_influence: 0.6 }, `sfx ${name}`);
    await fs.writeFile(path.join(ROOT, file), buf); made++; console.log(`  🔊 ${name}`);
  });

  /* Mandarin phrases */
  const texts = await phraseTexts();
  await pool(texts, 3, async text => {
    const file = `audio/zh/${fnv(text + "|" + VOICE + "|" + MODEL)}.mp3`;
    index.zh[text] = file;
    if (!FORCE && await exists(path.join(ROOT, file))) { reused++; return; }
    const buf = await call(`${API}/text-to-speech/${VOICE}?output_format=${FORMAT}`, {
      text, model_id: MODEL,
      voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0, use_speaker_boost: true }
    }, `tts ${text}`);
    await fs.writeFile(path.join(ROOT, file), buf); made++; console.log(`  🗣️  ${text}`);
  });

  /* prune files that are no longer referenced */
  const keep = new Set([...Object.values(index.sfx), ...Object.values(index.zh)]);
  let pruned = 0;
  for (const dir of ["audio/sfx", "audio/zh"]) for (const f of await fs.readdir(path.join(ROOT, dir))) {
    const rel = `${dir}/${f}`; if (!keep.has(rel)) { await fs.unlink(path.join(ROOT, rel)); pruned++; }
  }
  await fs.writeFile(path.join(ROOT, "audio/index.json"), JSON.stringify(index, null, 1) + "\n");
  console.log(`\nDone: ${made} generated, ${reused} reused, ${pruned} pruned. ${Object.keys(index.zh).length} phrases, ${Object.keys(index.sfx).length} sound effects.`);
  if (prev.voice && prev.voice !== VOICE) console.log(`Voice changed ${prev.voice} → ${VOICE}`);
}
main().catch(e => { console.error("❌", e.message); process.exit(1); });
