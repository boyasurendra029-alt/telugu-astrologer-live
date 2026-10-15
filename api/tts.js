import { EdgeTTS } from '@andresaya/edge-tts';

const VOICE = 'te-IN-MohanNeural';
const MAX_CHARS = 800;

export default async function handler(req, res) {
  try {
    const raw = req.query?.text;
    const text = (Array.isArray(raw) ? raw[0] : raw || '').toString().trim().slice(0, MAX_CHARS);

    if (!text) {
      res.status(400).json({ error: 'Missing ?text= query parameter' });
      return;
    }

    const tts = new EdgeTTS();
    await tts.synthesize(text, VOICE, { rate: '-4%', pitch: '-2Hz' });
    const audio = tts.toBuffer();

    if (!audio || !audio.length) {
      res.status(502).json({ error: 'TTS returned empty audio' });
      return;
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audio.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(Buffer.from(audio));
  } catch (err) {
    console.error('TTS error:', err);
    res.status(500).json({ error: 'TTS synthesis failed', detail: String(err?.message || err) });
  }
}
