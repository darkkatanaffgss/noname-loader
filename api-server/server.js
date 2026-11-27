const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { runSetup } = require('../scripts/setup-keys');
const db = require('./db');

const ENV_PATH = path.join(__dirname, '.env');
if (!fs.existsSync(ENV_PATH)) {
  const generated = runSetup({ force: false });
  if (!generated.skipped) {
    console.log('[Server] Generated fresh Ed25519 keys & ADMIN_SECRET in api-server/.env');
    console.log(`[Server] Your ADMIN_SECRET: ${generated.adminSecret}`);
  }
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim();
    if (!process.env[k]) {
      process.env[k] = v;
    }
  }
}
loadEnvFile(ENV_PATH);

const PORT = Number(process.env.PORT || 3840);
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'CHANGE_THIS_SECRET_IN_ENV';
const PRIVATE_KEY_B64 = process.env.ED25519_PRIVATE_KEY;
const ALLOWED_ADMIN_IPS = new Set(
  (process.env.ADMIN_ALLOWED_IPS || '127.0.0.1,::1').split(',').map((s) => s.trim()).filter(Boolean)
);

const PRIVATE_KEY_PEM = PRIVATE_KEY_B64 ? Buffer.from(PRIVATE_KEY_B64, 'base64').toString('utf8') : null;

// Rate limits, replay cache, admin challenge-response & session stores
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 120;
const NONCE_TTL_MS = 120_000;
const CHALLENGE_TTL_MS = 30_000;
const ADMIN_FAIL_LIMIT = 5;
const ADMIN_LOCK_MS = 15 * 60_000;
const ADMIN_SESSION_TTL_MS = 60 * 60_000;
const ADMIN_IDLE_TTL_MS = 20 * 60_000;

const rateBuckets = new Map();
const seenNonces = new Map();
const adminChallenges = new Map();
const adminFailures = new Map();
const adminSessions = new Map();

function normalizeIp(rawIp) {
  const s = String(rawIp || 'unknown');
  return s.startsWith('::ffff:') ? s.slice(7) : s;
}

function isRateLimited(ip) {
  const now = Date.now();
  const bucket = (rateBuckets.get(ip) || []).filter((ts) => now - ts < RATE_WINDOW_MS);
  bucket.push(now);
  rateBuckets.set(ip, bucket);
  return bucket.length > RATE_MAX_REQUESTS;
}

function checkAndStoreNonce(nonce) {
  if (!nonce) return true;
  const now = Date.now();
  for (const [k, exp] of seenNonces.entries()) {
    if (exp < now) seenNonces.delete(k);
  }
  if (seenNonces.has(nonce)) return false;
  seenNonces.set(nonce, now + NONCE_TTL_MS);
  return true;
}

function isAdminIpAllowed(ip) {
  if (ALLOWED_ADMIN_IPS.has('*')) return true;
  return ALLOWED_ADMIN_IPS.has(ip);
}

function isAdminIpLocked(ip) {
  const entry = adminFailures.get(ip);
  if (!entry) return false;
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) return true;
  if (entry.lockedUntil && Date.now() >= entry.lockedUntil) adminFailures.delete(ip);
  return false;
}

function recordAdminFailure(ip) {
  const entry = adminFailures.get(ip) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= ADMIN_FAIL_LIMIT) {
    entry.lockedUntil = Date.now() + ADMIN_LOCK_MS;
    db.logEvent({ eventType: 'admin_bruteforce_blocked', ip, details: `Locked 15m after ${entry.count} failed attempts` });
  }
  adminFailures.set(ip, entry);
  return entry;
}

function hashUserAgent(req) {
  return crypto.createHash('sha256').update(String(req.headers['user-agent'] || '')).digest('hex');
}

function parseCookies(req) {
  const out = {};
  const header = String(req.headers.cookie || '');
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return out;
}

function issueAdminSession(ip, req) {
  const now = Date.now();
  for (const [t, s] of adminSessions.entries()) {
    if (s.expiresAt < now || now - s.lastActiveAt > ADMIN_IDLE_TTL_MS) adminSessions.delete(t);
  }
  const token = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(24).toString('hex');
  adminSessions.set(token, {
    ip,
    uaHash: hashUserAgent(req),
    csrfToken,
    expiresAt: now + ADMIN_SESSION_TTL_MS,
    lastActiveAt: now
  });
  return { token, csrfToken };
}

function validateAdminSession(req, ip, requireCsrf = false) {
  const cookies = parseCookies(req);
  const authHeader = String(req.headers.authorization || '');
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const token = cookies.nn_admin_sid || bearerToken;

  if (!token) return null;
  const sess = adminSessions.get(token);
  if (!sess) return null;

  const now = Date.now();
  if (now > sess.expiresAt || now - sess.lastActiveAt > ADMIN_IDLE_TTL_MS) {
    adminSessions.delete(token);
    return null;
  }
  if (sess.ip !== ip) {
    adminSessions.delete(token);
    db.logEvent({ eventType: 'admin_session_hijack_blocked', ip, details: 'IP mismatch' });
    return null;
  }
  if (requireCsrf) {
    const csrfHeader = String(req.headers['x-csrf-token'] || '');
    const a = Buffer.from(csrfHeader, 'utf8');
    const b = Buffer.from(sess.csrfToken, 'utf8');
    if (a.length !== b.length || a.length === 0 || !crypto.timingSafeEqual(a, b)) {
      return null;
    }
  }

  sess.lastActiveAt = now;
  return { token, sess };
}

function signEnvelope(envelope) {
  if (!PRIVATE_KEY_PEM) return 'no-sig';
  const canonical = JSON.stringify(envelope);
  return crypto.sign(null, Buffer.from(canonical, 'utf8'), PRIVATE_KEY_PEM).toString('hex');
}

function sendJson(res, statusCode, body, extraHeaders = {}) {
  const json = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    ...extraHeaders
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 65536) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const startedAt = Date.now();
  const clientIp = normalizeIp(req.socket.remoteAddress);
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  res.on('finish', () => {
    if (url.pathname.startsWith('/api/v1/') && url.pathname !== '/api/v1/admin/analytics') {
      try {
        db.logTraffic({
          method: req.method,
          path: url.pathname,
          ip: clientIp,
          statusCode: res.statusCode,
          latencyMs: Math.max(0, Date.now() - startedAt),
          userAgent: req.headers['user-agent'] || ''
        });
      } catch (_) {}
    }
  });

  // 1. IP Ban check
  if (db.isIpBanned(clientIp)) {
    db.logEvent({ eventType: 'banned_ip_blocked', ip: clientIp, details: `Blocked ${req.method} ${url.pathname}` });
    return sendJson(res, 403, { ok: false, valid: false, error: 'Your IP address is blocked.' });
  }

  // 2. Rate limiting
  if (!url.pathname.startsWith('/api/v1/admin/analytics') && isRateLimited(clientIp)) {
    return sendJson(res, 429, { valid: false, error: 'Rate limit exceeded. Wait 1 minute.' });
  }

  // 3. Admin UI & Assets
  if (req.method === 'GET' && (url.pathname === '/admin' || url.pathname === '/admin/')) {
    if (!isAdminIpAllowed(clientIp)) {
      return sendJson(res, 403, { ok: false, error: 'Admin panel restricted to allowlisted IPs' });
    }
    const html = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none';",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    });
    return res.end(html);
  }

  if (req.method === 'GET' && url.pathname === '/admin.js') {
    if (!isAdminIpAllowed(clientIp)) {
      return sendJson(res, 403, { ok: false, error: 'Forbidden' });
    }
    const js = fs.readFileSync(path.join(__dirname, 'admin.js'), 'utf8');
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.end(js);
  }

  // 4. Public Health Check
  if (req.method === 'GET' && url.pathname === '/api/v1/health') {
    return sendJson(res, 200, {
      ok: true,
      service: 'noname-license-api',
      version: '2.5.0',
      db: 'sqlite',
      crypto: 'ed25519',
      time: Date.now()
    });
  }

  // 5. Client License Key Verification
  if (req.method === 'POST' && url.pathname === '/api/v1/auth/verify') {
    try {
      const { key, hwid, nonce } = await readBody(req);
      if (!key || !hwid) {
        return sendJson(res, 400, { valid: false, error: 'Missing key or hwid' });
      }
      if (nonce && !checkAndStoreNonce(String(nonce))) {
        db.logEvent({ eventType: 'replay_detected', key: String(key), hwid: String(hwid), ip: clientIp, details: 'Duplicate auth nonce' });
        return sendJson(res, 403, { valid: false, error: 'Replay attempt detected' });
      }

      const cleanKey = String(key).trim().toUpperCase();
      const record = db.getLicense(cleanKey);

      if (!record) {
        db.logEvent({ eventType: 'login_failed', key: cleanKey, hwid: String(hwid), ip: clientIp, details: 'Key not found' });
        return sendJson(res, 401, { valid: false, error: 'License key not found' });
      }
      if (record.revoked) {
        db.logEvent({ eventType: 'login_failed', key: cleanKey, hwid: String(hwid), ip: clientIp, details: 'Revoked key' });
        return sendJson(res, 403, { valid: false, error: 'License key has been revoked' });
      }

      const expiresMs = record.expiresAt ? Date.parse(record.expiresAt) : null;
      if (expiresMs && Date.now() > expiresMs) {
        db.logEvent({ eventType: 'login_failed', key: cleanKey, hwid: String(hwid), ip: clientIp, details: 'Expired subscription' });
        return sendJson(res, 403, { valid: false, error: 'Subscription expired' });
      }

      if (record.hwid && record.hwid !== String(hwid)) {
        db.logEvent({ eventType: 'hwid_mismatch', key: cleanKey, hwid: String(hwid), ip: clientIp, details: `Expected ${record.hwid}` });
        return sendJson(res, 403, { valid: false, error: `HWID mismatch. Key bound to ${record.hwid}` });
      }

      db.bindHwidAndTouch(cleanKey, String(hwid));
      const session = db.createSession(cleanKey, String(hwid), clientIp);
      db.logEvent({ eventType: 'login_success', key: cleanKey, hwid: String(hwid), ip: clientIp, details: `Tier: ${record.tier}` });

      const envelope = {
        valid: true,
        sessionId: session.sessionId,
        username: record.username,
        tier: record.tier,
        expiresAt: record.expiresAt || 'Lifetime',
        products: record.products,
        branches: record.branches,
        hwid: String(hwid),
        nonce: nonce || null,
        issuedAt: Date.now()
      };

      const signature = signEnvelope(envelope);
      return sendJson(res, 200, {
        valid: true,
        envelope,
        signature,
        plan: record.tier,
        expires_at: record.expiresAt || 'Lifetime',
        message: 'Key successfully verified'
      });
    } catch (err) {
      return sendJson(res, 400, { valid: false, error: 'Invalid request body' });
    }
  }

  // 6. Client Session Heartbeat
  if (req.method === 'POST' && url.pathname === '/api/v1/auth/heartbeat') {
    try {
      const { sessionId, hwid } = await readBody(req);
      const sessionRow = db.getValidSession(String(sessionId || ''), String(hwid || ''));
      if (!sessionRow) {
        return sendJson(res, 401, { active: false, error: 'Session expired or kicked' });
      }
      const record = db.getLicense(sessionRow.license_key);
      if (!record || record.revoked || (record.hwid && record.hwid !== String(hwid))) {
        db.deleteSession(String(sessionId));
        return sendJson(res, 403, { active: false, error: 'License revoked or HWID reset' });
      }
      return sendJson(res, 200, { active: true });
    } catch (_) {
      return sendJson(res, 400, { active: false });
    }
  }

  // 7. Software Launch Authorization Ticket
  if (req.method === 'POST' && url.pathname === '/api/v1/software/authorize') {
    try {
      const { sessionId, hwid, productId, branch } = await readBody(req);
      const sessionRow = db.getValidSession(String(sessionId || ''), String(hwid || ''));
      if (!sessionRow) {
        return sendJson(res, 401, { authorized: false, error: 'Invalid or expired session. Please re-authenticate.' });
      }

      const record = db.getLicense(sessionRow.license_key);
      if (!record || record.revoked) {
        return sendJson(res, 403, { authorized: false, error: 'License revoked' });
      }
      if (record.products && !record.products.includes(productId)) {
        return sendJson(res, 403, { authorized: false, error: `Your subscription does not include ${productId}` });
      }

      db.incrementLaunchCount(record.key);
      db.logEvent({
        eventType: 'launch_authorized',
        key: record.key,
        hwid: String(hwid),
        ip: clientIp,
        productId: String(productId),
        branch: String(branch || 'default'),
        details: 'Issued launch authorization ticket'
      });

      const ticket = {
        authorized: true,
        productId,
        branch: branch || 'default',
        ticketExpiresAt: Date.now() + 30_000,
        username: record.username,
        tier: record.tier
      };

      const signature = signEnvelope(ticket);
      return sendJson(res, 200, { authorized: true, ticket, signature });
    } catch (_) {
      return sendJson(res, 400, { authorized: false, error: 'Invalid launch request' });
    }
  }

  // 8. Client Telemetry & Anti-Tamper Report
  if (req.method === 'POST' && url.pathname === '/api/v1/telemetry') {
    try {
      const { eventType, details, hwid, key } = await readBody(req);
      db.logEvent({
        eventType: String(eventType || 'client_telemetry'),
        key: key ? String(key) : null,
        hwid: hwid ? String(hwid) : null,
        ip: clientIp,
        details: String(details || '')
      });
      return sendJson(res, 200, { ok: true });
    } catch (_) {
      return sendJson(res, 400, { ok: false });
    }
  }

  // -------------------------------------------------------------
  // ADMIN API ENDPOINTS (Protected with Challenge-Response / Session)
  // -------------------------------------------------------------

  if (req.method === 'GET' && url.pathname === '/api/v1/admin/challenge') {
    if (!isAdminIpAllowed(clientIp)) {
      return sendJson(res, 403, { error: 'Forbidden' });
    }
    if (isAdminIpLocked(clientIp)) {
      return sendJson(res, 429, { error: 'Admin IP locked for 15 minutes due to too many failed attempts' });
    }
    const challenge = crypto.randomBytes(24).toString('hex');
    adminChallenges.set(challenge, { ip: clientIp, expiresAt: Date.now() + CHALLENGE_TTL_MS });
    return sendJson(res, 200, { challenge });
  }

  if (req.method === 'POST' && url.pathname === '/api/v1/admin/login') {
    if (!isAdminIpAllowed(clientIp)) {
      return sendJson(res, 403, { error: 'Forbidden' });
    }
    if (isAdminIpLocked(clientIp)) {
      return sendJson(res, 429, { error: 'Admin IP locked. Try again later.' });
    }

    try {
      const { challenge, proof, rawSecret } = await readBody(req);
      let success = false;

      if (challenge && proof) {
        const entry = adminChallenges.get(challenge);
        adminChallenges.delete(challenge);
        if (entry && entry.ip === clientIp && Date.now() < entry.expiresAt) {
          const secretHashHex = crypto.createHash('sha512').update(ADMIN_SECRET, 'utf8').digest('hex');
          const expectedProof = crypto.createHmac('sha256', secretHashHex).update(challenge).digest('hex');
          const a = Buffer.from(proof, 'utf8');
          const b = Buffer.from(expectedProof, 'utf8');
          if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
            success = true;
          }
        }
      } else if (rawSecret) {
        // Fallback for simple direct login
        const a = Buffer.from(String(rawSecret), 'utf8');
        const b = Buffer.from(ADMIN_SECRET, 'utf8');
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
          success = true;
        }
      }

      if (!success) {
        const failure = recordAdminFailure(clientIp);
        db.logEvent({ eventType: 'admin_login_failed', ip: clientIp, details: `Attempt #${failure.count}` });
        return sendJson(res, 401, { error: 'Invalid admin credentials' });
      }

      adminFailures.delete(clientIp);
      const session = issueAdminSession(clientIp, req);
      db.logEvent({ eventType: 'admin_login_success', ip: clientIp, details: 'Authorized admin session' });

      return sendJson(
        res,
        200,
        { ok: true, csrfToken: session.csrfToken, token: session.token },
        {
          'Set-Cookie': `nn_admin_sid=${session.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`
        }
      );
    } catch (_) {
      return sendJson(res, 400, { error: 'Bad request' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/v1/admin/logout') {
    const admin = validateAdminSession(req, clientIp);
    if (admin) adminSessions.delete(admin.token);
    return sendJson(
      res,
      200,
      { ok: true },
      { 'Set-Cookie': 'nn_admin_sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' }
    );
  }

  // All endpoints below require active admin session
  const adminAuth = validateAdminSession(req, clientIp, req.method === 'POST');
  if (!adminAuth && url.pathname.startsWith('/api/v1/admin/')) {
    return sendJson(res, 401, { error: 'Unauthorized: valid admin session required' });
  }

  if (req.method === 'GET' && url.pathname === '/api/v1/admin/analytics') {
    return sendJson(res, 200, {
      stats: db.getStats(),
      licenses: db.listLicenses(),
      activeSessions: db.listActiveSessions(),
      trafficLogs: db.listTraffic(100),
      securityEvents: db.listEvents(80),
      blockedIps: db.listBlockedIps()
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/v1/admin/keys') {
    const body = await readBody(req);
    const { action, key, username, tier, days, products, branches } = body;

    if (action === 'create') {
      let expiresAt = null;
      if (days && days !== 'lifetime') {
        const d = Number(days);
        expiresAt = new Date(Date.now() + d * 86400 * 1000).toISOString();
      }
      const created = db.createLicense({ key, username, tier, expiresAt, products, branches });
      return sendJson(res, 200, { ok: true, license: created });
    }

    if (action === 'reset-hwid' && key) {
      db.resetLicenseHwid(key);
      db.logEvent({ eventType: 'admin_hwid_reset', key, ip: clientIp, details: 'HWID cleared by admin' });
      return sendJson(res, 200, { ok: true });
    }

    if (action === 'revoke' && key) {
      db.setLicenseRevoked(key, true);
      db.logEvent({ eventType: 'admin_key_revoked', key, ip: clientIp, details: 'Key revoked' });
      return sendJson(res, 200, { ok: true });
    }

    if (action === 'unrevoke' && key) {
      db.setLicenseRevoked(key, false);
      db.logEvent({ eventType: 'admin_key_restored', key, ip: clientIp, details: 'Key restored' });
      return sendJson(res, 200, { ok: true });
    }

    if (action === 'delete' && key) {
      db.deleteLicense(key);
      db.logEvent({ eventType: 'admin_key_deleted', key, ip: clientIp, details: 'Key deleted' });
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 400, { error: 'Unknown key action' });
  }

  if (req.method === 'POST' && url.pathname === '/api/v1/admin/sessions/kick') {
    const { sessionId } = await readBody(req);
    if (sessionId) {
      db.deleteSession(sessionId);
      db.logEvent({ eventType: 'admin_session_kicked', ip: clientIp, details: `Kicked session ${sessionId}` });
    }
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/v1/admin/ips') {
    const { action, ip, reason } = await readBody(req);
    if (action === 'ban' && ip) {
      db.banIp(ip, reason || 'Banned from admin panel');
      db.logEvent({ eventType: 'admin_ip_banned', ip, details: reason });
      return sendJson(res, 200, { ok: true });
    }
    if (action === 'unban' && ip) {
      db.unbanIp(ip);
      db.logEvent({ eventType: 'admin_ip_unbanned', ip, details: 'Unbanned by admin' });
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 400, { error: 'Invalid IP action' });
  }

  if (req.method === 'POST' && url.pathname === '/api/v1/admin/logs/clear') {
    db.clearLogs();
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n======================================================');
  console.log(`  Noname Loader API Server running on port ${PORT}`);
  console.log('======================================================');
  console.log(`  Health API   : http://127.0.0.1:${PORT}/api/v1/health`);
  console.log(`  Web Admin    : http://127.0.0.1:${PORT}/admin`);
  console.log(`  ADMIN_SECRET : ${ADMIN_SECRET}`);
  console.log('======================================================\n');
});
