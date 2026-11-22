import fs from 'node:fs';
const env = fs.readFileSync(process.env.HOME + '/video-studio/.env', 'utf8');
const KEY = /ELEVENLABS_API_KEY=(.+)/.exec(env)[1].trim();
const VOICE = process.argv[2] || 'oKxkBkm5a8Bmrd1Whf2c';
for (const [id, text] of JSON.parse(fs.readFileSync('lines.json', 'utf8'))) {
  if (fs.existsSync(id + '.mp3') && !process.env.FORCE) continue;
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true } }) });
  if (!r.ok) { console.log(id, r.status, await r.text()); continue; }
  fs.writeFileSync(id + '.mp3', Buffer.from(await r.arrayBuffer())); console.log(id, 'ok');
}
