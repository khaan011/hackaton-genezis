// Озвучка рекламного ролика (ElevenLabs, eleven_v3 с эмоциями) + слова по времени (Whisper) для титров.
// Запуск из test/out/ad3: node ../../../tools/ad_voice.mjs [id голоса]   → s*.mp3, s*.json
import fs from 'node:fs'; import { execFileSync } from 'node:child_process';
const KEY = /ELEVENLABS_API_KEY=(.+)/.exec(fs.readFileSync(process.env.HOME + '/video-studio/.env', 'utf8'))[1].trim();
const VOICE = process.argv[2] || 'Uv3rf12Omd9Asyv54Bqw';
const W = process.env.HOME + '/.local/bin/mlx_whisper';
for (const [id, text, say] of JSON.parse(fs.readFileSync('lines.json', 'utf8'))) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: say || text, model_id: 'eleven_v3', voice_settings: { stability: 0.0, similarity_boost: 0.8, use_speaker_boost: true } }) });
  if (!r.ok) { console.log(id, r.status, (await r.text()).slice(0, 200)); process.exit(1); }
  fs.writeFileSync(id + '.mp3', Buffer.from(await r.arrayBuffer()));
  execFileSync(W, [id + '.mp3', '--language', 'ru', '--word-timestamps', 'True', '--output-format', 'json', '--output-dir', '.'], { env: { ...process.env, PATH: process.env.HOME + '/.local/bin:' + process.env.PATH }, stdio: 'ignore' });
  console.log(id, 'ok');
}
