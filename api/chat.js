const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Accepts a bare 11-char ID or any common YouTube URL form.
function normalizeVideoId(input) {
  const s = String(input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m =
    s.match(/[?&]v=([\w-]{11})/) ||
    s.match(/youtu\.be\/([\w-]{11})/) ||
    s.match(/\/(?:live|embed|shorts)\/([\w-]{11})/);
  return m ? m[1] : null;
}

// Pulls the ytInitialData object out of the HTML using brace matching
// (more robust than a lazy regex against the closing </script>).
function extractInitialData(html) {
  const marker = html.indexOf('ytInitialData');
  if (marker === -1) return null;
  const start = html.indexOf('{', html.indexOf('=', marker));
  if (start === -1) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function runsToText(runs = []) {
  return runs
    .map((r) => {
      if (r.text) return r.text;
      if (r.emoji) return r.emoji.shortcuts?.[0] || r.emoji.emojiId || '';
      return '';
    })
    .join('')
    .trim();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const raw = req.query?.videoId;
    const videoId = normalizeVideoId(Array.isArray(raw) ? raw[0] : raw);
    if (!videoId) {
      res.status(400).json({ error: 'Missing or invalid ?videoId=' });
      return;
    }

    const resp = await fetch(`https://www.youtube.com/live_chat?v=${videoId}`, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml',
        Cookie: 'CONSENT=YES+1',
      },
    });
    if (!resp.ok) {
      res.status(502).json({ error: `YouTube responded ${resp.status}` });
      return;
    }

    const html = await resp.text();
    const data = extractInitialData(html);
    if (!data) {
      res.status(502).json({ error: 'Could not find ytInitialData (chat unavailable or blocked)' });
      return;
    }

    const actions = data?.contents?.liveChatRenderer?.actions || [];
    const messages = [];
    for (const action of actions) {
      const r = action?.addChatItemAction?.item?.liveChatTextMessageRenderer;
      if (!r) continue;
      const message = runsToText(r.message?.runs);
      if (!message) continue;
      messages.push({
        id: String(r.id),
        author: r.authorName?.simpleText || 'భక్తులు',
        message,
      });
    }

    res.status(200).json(messages);
  } catch (err) {
    console.error('Chat scrape error:', err);
    res.status(500).json({ error: 'Chat scrape failed', detail: String(err?.message || err) });
  }
}
