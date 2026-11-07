#!/usr/bin/env node
/**
 * Isolated mock Apify HTTP API for browser/release acceptance.
 * Serves users/me verification + run-sync fixtures. Zero real Apify calls.
 *
 * Env:
 *   PORT=4099
 *   MOCK_GOOD_TOKEN=mock-apify-token-acceptance-xx
 */
import http from 'node:http';

const port = Number(process.env.PORT || 4099);
const goodToken = (process.env.MOCK_GOOD_TOKEN || 'mock-apify-token-acceptance-xx').trim();

const fbFixture = [
  {
    postId: 'mock_fb_1',
    text: 'Mock Facebook post for acceptance',
    time: new Date().toISOString(),
    url: 'https://www.facebook.com/cern/posts/1',
    likes: 1,
    comments: 0,
    shares: 0,
    media: [{ type: 'image', url: 'https://example.com/fb.jpg' }],
    pageName: 'CERN',
    pageId: 'cern',
    pageUrl: 'https://www.facebook.com/cern',
    pageLogo: 'https://example.com/cern.png',
  },
];

const igFixture = [
  {
    id: 'mock_ig_1',
    caption: 'Mock Instagram post for acceptance',
    timestamp: new Date().toISOString(),
    url: 'https://www.instagram.com/p/mock1/',
    likesCount: 2,
    commentsCount: 0,
    displayUrl: 'https://example.com/ig.jpg',
    ownerUsername: 'nasa',
    ownerFullName: 'NASA',
    ownerId: 'nasa',
    ownerProfilePicUrl: 'https://example.com/nasa.png',
    type: 'Image',
  },
];

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function authOk(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return Boolean(m && m[1].trim() === goodToken);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
  res.setHeader('content-type', 'application/json');

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', service: 'mock-apify' }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/v2/users/me') {
    if (!authOk(req)) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: { type: 'invalid-token' } }));
      return;
    }
    res.writeHead(200);
    res.end(JSON.stringify({ data: { username: 'mock_apify_user' } }));
    return;
  }

  // Facebook + Instagram run-sync style endpoints
  if (req.method === 'POST' && /\/v2\/acts\/.+\/run-sync-get-dataset-items/.test(url.pathname)) {
    if (!authOk(req)) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: { type: 'invalid-token' } }));
      return;
    }
    await readBody(req);
    const isIg = /instagram/i.test(url.pathname);
    res.writeHead(200);
    res.end(JSON.stringify(isIg ? igFixture : fbFixture));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`mock-apify listening on 0.0.0.0:${port}`);
});
