// Проверка аудиоанализа на синтезированных песнях (node).
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
require('../src/util.js'); require('../src/lexicon.js'); require('../src/audio.js');
const PV = globalThis.PV;
const os = require('os');
let fails = 0;
const check = (cond, msg) => { if (cond) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg); } };

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
let keysRight = 0;
if (!fs.existsSync(dir)) {
  /* без песен проверка не «проходит молча»: в CI (или с STRICT=1) это ошибка, локально — явный пропуск */
  const strict = process.env.CI || process.env.STRICT;
  console.log(`\n${strict ? '✗ ОШИБКА' : '⚠ ПРОПУЩЕНО'}: аудиоанализ не проверен — нет test/assets/music. Сгенерируйте песни: npm run assets (нужны python3, numpy, ffmpeg).`);
  process.exit(strict ? 1 : 0);
}
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.wav')).sort()) {
  const { chs, sr } = readWav(path.join(dir, f));
  const t = Date.now();
  const A = PV.Audio.analyzeSamples(chs, sr, { excerptLen: 30 });
  const ms = Date.now() - t;
  const ex = PV.Audio.finalizeExcerpt(A, A.start, 30);
  const want = +f.match(/_(\d+)\.wav$/)[1];
  console.log(`${f.padEnd(26)} bpm=${A.bpm} (conf ${A.bpmConf}) ${A.keyName} (mode conf ${A.modeConf}) loud=${A.loud} onsetN=${A.onsetN} bright=${A.brightness} dyn=${A.dynamics}dB start=${A.start.toFixed(2)} beats=${ex.beats.length} env=${ex.env.length} [${ms} ms]`);
  check(Math.abs(A.bpm - want) <= 2, `темп ${want} ±2 BPM`);
  check(A.modeConf >= 0 && A.modeConf <= 1, 'уверенность лада в [0, 1]');
  const [, note, mode] = f.match(/_([A-G])_(major|minor)_/);
  const right = A.keyName === PV.Audio.NOTE_RU[{ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[note]] + (mode === 'major' ? ' мажор' : ' минор');
  keysRight += right ? 1 : 0;
  if (A.modeConf >= 0.5) check(right, `уверенный лад верен (${A.keyName})`);
}
check(keysRight >= 4, `лад верен хотя бы в 4 песнях из 6 (${keysRight})`);

// срез MP3
const mp3 = fs.readFileSync(path.join(dir, 'ballad_C_major_72.mp3'));
const SLICE = path.join(os.tmpdir(), 'pv-slice.mp3');
const s = PV.Audio.mp3Slice(new Uint8Array(mp3), 20, 50);
fs.writeFileSync(SLICE, Buffer.from(s.data));
console.log('mp3 slice t0', s.t0.toFixed(3), 't1', s.t1.toFixed(3), 'bytes', s.data.length);
console.log(execSync('ffprobe -v error -show_entries format=duration -of csv=p=0 ' + SLICE + '').toString().trim(), 's по ffprobe');
console.log(execSync('ffmpeg -v error -i ' + SLICE + ' -f null - 2>&1 || true').toString().trim() || 'декодируется без ошибок');
const sliceDur = +execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${SLICE}"`).toString();
check(Math.abs(sliceDur - 30) < 0.2, 'срез MP3 длится 30 с');
console.log(fails ? `\nПровалено проверок: ${fails}` : '\nВсе проверки пройдены');
process.exitCode = fails ? 1 : 0;
