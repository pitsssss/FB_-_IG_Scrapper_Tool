import http from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'test', 'fixtures');

function loadFixtureItems(fixturePath) {
  if (fixturePath) {
    return JSON.parse(readFileSync(fixturePath, 'utf8'));
  }
  let files = [];
  try {
    files = readdirSync(fixturesDir).filter((f) => /^apify-.+\.json$/i.test(f)).sort();
  } catch {
    files = [];
  }
  if (files.length) {
    return JSON.parse(readFileSync(join(fixturesDir, files[0]), 'utf8'));
  }
  return syntheticItems();
}

function syntheticItems() {
  const pageId = '100064792144187';
  const texts = [
    'Hello world 🌍 from the page',
    'مرحبا بالعالم ✨ Arabic post',
    'Mixed: CERN news 🚀 and تحديث',
    'Another English update 🙂',
    'منشور بالعربية 🎉',
    'Post six with emoji 🧪',
    'سابع منشور 🌟',
    'Eighth item — science!',
    'تاسع عنصر 📚',
    'Tenth post 🔭',
    'Eleventh 🧩',
    'Twelfth / الثاني عشر 💡',
  ];
  return texts.map((text, i) => ({
    facebookUrl: `https://www.facebook.com/cern/posts/syn${i}`,
    postId: `syn${i}`,
    pageName: 'cern',
    url: `https://www.facebook.com/cern/posts/syn${i}`,
    time: new Date(Date.UTC(2026, 9, 20 - i)).toISOString(),
    timestamp: Date.UTC(2026, 9, 20 - i) / 1000,
    user: {
      id: pageId,
      name: 'CERN',
      profileUrl: 'https://www.facebook.com/cern',
      profilePic: 'https://cdn.example/logo.jpg',
    },
    text,
    likes: 10 + i,
    comments: i,
    shares: 1,
    topReactionsCount: 10 + i,
    media: [{ thumbnail: `https://cdn.example/img${i}.jpg`, image: { uri: `https://cdn.example/img${i}.jpg` } }],
    topLevelUrl: `https://www.facebook.com/cern/posts/syn${i}`,
    facebookId: pageId,
    inputUrl: 'https://www.facebook.com/cern',
  }));
}

/** Synthetic dataset matching Apify Instagram Post Scraper field names (basicData). */
export function syntheticInstagramItems(username = 'nasa') {
  const ownerId = '232192182';
  const ownerFullName = username.toUpperCase() === 'NASA' ? 'NASA' : username;
  const texts = [
    'Launch day 🚀',
    'مرحبا من الفضاء ✨',
    'Carousel science 🧪',
    'Empty caption allowed',
    'Reel preview 🎥',
    'Arabic: تحديث مهم 🌟',
    'Pinned-looking but dated',
    'Post eight',
    'Post nine 📚',
    'Post ten 🔭',
    'Post eleven',
    'Post twelve',
  ];
  return texts.map((caption, i) => {
    const shortCode = `IgSyn${i}AbCd`;
    const ts = new Date(Date.UTC(2026, 9, 20 - i)).toISOString();
    const base = {
      inputUrl: `https://www.instagram.com/${username}/`,
      id: `370000000000000000${i}`,
      type: i === 2 ? 'Sidecar' : i === 4 ? 'Video' : 'Image',
      shortCode,
      caption: i === 3 ? '' : caption,
      url: `https://www.instagram.com/p/${shortCode}/`,
      commentsCount: i,
      likesCount: i === 7 ? -1 : 100 + i,
      timestamp: ts,
      ownerFullName,
      ownerUsername: username,
      ownerId,
      ownerProfilePicUrl: i % 3 === 0
        ? `https://cdn.example/ig/${username}.jpg`
        : undefined,
      isPinned: i === 6,
      displayUrl: `https://cdn.example/ig/img${i}.jpg`,
      images: [],
      childPosts: [],
      videoUrl: undefined,
    };
    if (i === 2) {
      base.childPosts = [
        { displayUrl: `https://cdn.example/ig/car${i}a.jpg` },
        { displayUrl: `https://cdn.example/ig/car${i}b.jpg` },
      ];
    }
    if (i === 4) {
      base.videoUrl = `https://cdn.example/ig/vid${i}.mp4`;
      base.productType = 'clips';
    }
    // Error-shaped junk must be ignored by normalizer
    if (i === 11) {
      return { error: 'private_profile', errorDescription: 'skip me' };
    }
    return base;
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(payload);
}

export function startFakeUpstream({
  port = 0,
  host = '127.0.0.1',
  fixturePath = null,
  instagramItems = null,
} = {}) {
  const items = loadFixtureItems(fixturePath);
  const igItems = Array.isArray(instagramItems) ? instagramItems : syntheticInstagramItems('nasa');
  let mode = 'ok';
  let calls = 0;
  let lastUrl = '';
  let lastActor = '';

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');

    try {
      if (req.method === 'GET' && url.pathname === '/__mode') {
        return send(res, 200, { mode });
      }
      if (req.method === 'POST' && url.pathname === '/__mode') {
        const body = await readJson(req);
        if (['ok', 'fail', 'empty', 'slow'].includes(body.mode)) mode = body.mode;
        return send(res, 200, { mode });
      }
      if (req.method === 'GET' && url.pathname === '/__stats') {
        return send(res, 200, { calls, lastActor });
      }
      if (req.method === 'GET' && url.pathname === '/__last') {
        return send(res, 200, { url: lastUrl, actor: lastActor });
      }
      if (req.method === 'POST' && url.pathname === '/__reset') {
        await readJson(req).catch(() => ({}));
        mode = 'ok';
        calls = 0;
        lastUrl = '';
        lastActor = '';
        return send(res, 200, { mode, calls });
      }

      if (req.method === 'POST' && /\/v2\/acts\/.+\/run-sync-get-dataset-items/.test(url.pathname)) {
        const auth = req.headers.authorization || '';
        const bearer = /^Bearer\s+(\S+)/i.exec(auth);
        if (!bearer || !bearer[1]) {
          return send(res, 401, { error: 'unauthorized' });
        }

        lastUrl = req.url || '';
        const isInstagram = /instagram-post-scraper/i.test(url.pathname);
        lastActor = isInstagram ? 'instagram-post-scraper' : 'facebook-posts-scraper';
        calls += 1;
        let body = {};
        try { body = await readJson(req); }
        catch { /* ignore bad json; still serve */ }

        const limitRaw = body?.resultsLimit;
        const limit = Number.parseInt(limitRaw, 10);
        const pool = isInstagram ? igItems : items;
        // For Instagram, optionally filter by requested username in body.username[0]
        let working = pool;
        if (isInstagram && Array.isArray(body.username) && body.username[0]) {
          const raw = String(body.username[0]);
          const m = /instagram\.com\/([A-Za-z0-9._]+)/i.exec(raw);
          const user = (m ? m[1] : raw).toLowerCase().replace(/\/$/, '');
          working = syntheticInstagramItems(user);
        }
        const sliced = Number.isFinite(limit) && limit > 0 ? working.slice(0, limit) : working;

        if (mode === 'fail') return send(res, 500, { error: 'boom' });
        if (mode === 'empty') return send(res, 201, []);
        if (mode === 'slow') {
          await new Promise((r) => setTimeout(r, 8000));
          return send(res, 201, sliced);
        }
        return send(res, 201, sliced);
      }

      return send(res, 404, { error: 'not found' });
    } catch (err) {
      console.error('[fake-upstream] error:', err?.message || err);
      return send(res, 500, { error: 'internal' });
    }
  });

  const ready = new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({ port: addr.port, host });
    });
    server.on('error', reject);
  });

  return {
    server,
    get port() {
      const addr = server.address();
      return addr ? addr.port : null;
    },
    ready,
    async close() {
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

async function mainCli() {
  const portArg = Number.parseInt(process.argv[2] || '0', 10);
  // CLI defaults to 0.0.0.0 so Docker Compose / smoke containers can reach the fake.
  // Programmatic e2e callers still default to 127.0.0.1 via startFakeUpstream().
  const hostArg = process.argv[3] || '0.0.0.0';
  const fake = startFakeUpstream({
    port: Number.isFinite(portArg) ? portArg : 0,
    host: hostArg,
  });
  const { port, host } = await fake.ready;
  console.log(`fake-upstream listening on http://${host}:${port}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  mainCli().catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
}
