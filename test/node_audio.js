// Проверка аудиоанализа на синтезированных песнях (node).
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
require('../src/util.js'); require('../src/lexicon.js'); require('../src/audio.js');
const PV = globalThis.PV;

function readWav(file) {
  const b = fs.readFileSync(file);
  const ch = b.readUInt16LE(22), sr = b.readUInt32LE(24);
  let off = 12; while (b.toString('ascii', off, off + 4) !== 'data') off += 8 + b.readUInt32LE(off + 4);
  const n = b.readUInt32LE(off + 4) / 2 / ch; const data = off + 8;
  const chs = Array.from({ length: ch }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) chs[c][i] = b.readInt16LE(data + (i * ch + c) * 2) / 32768;
  return { chs, sr };
}

const dir = path.join(__dirname, 'assets/music');
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.wav')).sort()) {
  const { chs, sr } = readWav(path.join(dir, f));
  const t = Date.now();
  const A = PV.Audio.analyzeSamples(chs, sr, { excerptLen: 30 });
  const ms = Date.now() - t;
  const ex = PV.Audio.finalizeExcerpt(A, A.start, 30);
  console.log(`${f.padEnd(26)} bpm=${A.bpm} (conf ${A.bpmConf}) ${A.keyName} (mode conf ${A.modeConf}) loud=${A.loud} onsetN=${A.onsetN} bright=${A.brightness} dyn=${A.dynamics}dB start=${A.start.toFixed(2)} beats=${ex.beats.length} env=${ex.env.length} [${ms} ms]`);
}

// срез MP3
const mp3 = fs.readFileSync(path.join(dir, 'ballad_C_major_72.mp3'));
const s = PV.Audio.mp3Slice(new Uint8Array(mp3), 20, 50);
fs.writeFileSync('/tmp/slice.mp3', Buffer.from(s.data));
console.log('mp3 slice t0', s.t0.toFixed(3), 't1', s.t1.toFixed(3), 'bytes', s.data.length);
console.log(execSync('ffprobe -v error -show_entries format=duration -of csv=p=0 /tmp/slice.mp3').toString().trim(), 's по ffprobe');
console.log(execSync('ffmpeg -v error -i /tmp/slice.mp3 -f null - 2>&1 || true').toString().trim() || 'декодируется без ошибок');
