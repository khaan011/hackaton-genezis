/* Послевкусие — озвучка записи. Голос выбирается правилами системы: темп, высота, паузы и тембр
   зависят от энергии и тона дня. Можно записать и свой голос. */
(function () {
'use strict';
const PV = (globalThis.PV = globalThis.PV || {});
const U = PV.U;

const LOW = /pavel|yuri|dmitr|maxim|ivan|nikolai|aleksandr|male|мужск/i;
const BRIGHT = /irina|milena|katya|svetlana|dariya|ekaterina|alena|google|female|женск/i;

function synth() { return globalThis.speechSynthesis || null; }
function allVoices() { const s = synth(); return s ? s.getVoices() : []; }
function ready() {
  const s = synth();
  if (!s) return Promise.resolve([]);
  const v = s.getVoices();
  if (v.length) return Promise.resolve(v);
  return new Promise((res) => { const done = () => res(s.getVoices()); s.addEventListener('voiceschanged', done, { once: true }); setTimeout(done, 1500); });
}
function pick(rule) {
  const vs = allVoices();
  const ru = vs.filter((v) => /^ru/i.test(v.lang));
  const pool = ru.length ? ru : vs;
  if (!pool.length) return null;
  const want = rule && rule.timbre === 'low' ? LOW : BRIGHT;
  return pool.find((v) => want.test(v.name)) || pool.find((v) => v.localService) || pool[0];
}
function sentences(text) {
  return String(text || '').replace(/\s+/g, ' ').split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
}

/* произносим по предложениям с паузами из правил дня */
function speak(text, rule, cb = {}) {
  const s = synth();
  if (!s) return null;
  s.cancel();
  const voice = pick(rule), parts = sentences(text);
  let stopped = false, i = 0, timer = null;
  const next = () => {
    if (stopped) return;
    if (i >= parts.length) { cb.onEnd && cb.onEnd(); return; }
    const u = new SpeechSynthesisUtterance(parts[i++]);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'ru-RU';
    u.rate = rule ? rule.rate : 1; u.pitch = rule ? rule.pitch : 1; u.volume = 1;
    u.onend = () => { timer = setTimeout(next, rule ? rule.pauseMs : 400); };
    u.onerror = () => { timer = setTimeout(next, 50); };
    s.speak(u);
  };
  cb.onStart && cb.onStart(voice);
  next();
  return { stop() { stopped = true; clearTimeout(timer); s.cancel(); cb.onEnd && cb.onEnd(); }, voice };
}

/* запись своего голоса */
async function record() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => globalThis.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.start(200);
  return {
    stop() {
      return new Promise((res) => {
        rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); res(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })); };
        rec.stop();
      });
    },
  };
}

function describe(rule) {
  if (!rule) return '';
  return `${rule.timbre === 'low' ? 'низкий тембр' : 'светлый тембр'}, темп ${U.fmtNum(rule.rate, 2)}, паузы ${U.fmtNum(rule.pauseMs / 1000, 1)} с — читать ${rule.remark}`;
}

PV.Voice = { ready, pick, speak, record, describe, supported: () => !!synth() };
})();
