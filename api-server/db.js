const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS licenses (
    key TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    tier TEXT NOT NULL,
    expires_at TEXT,
    hwid TEXT,
    revoked INTEGER NOT NULL DEFAULT 0,
    products_json TEXT NOT NULL,
    branches_json TEXT NOT NULL,
    launch_count INTEGER NOT NULL DEFAULT 0,
    last_seen_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    license_key TEXT NOT NULL,
    hwid TEXT NOT NULL,
    ip TEXT,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (license_key) REFERENCES licenses(key) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    license_key TEXT,
    hwid TEXT,
    ip TEXT,
    product_id TEXT,
    branch TEXT,
    details TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS traffic_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    ip TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    latency_ms INTEGER NOT NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS blocked_ips (
    ip TEXT PRIMARY KEY,
    reason TEXT,
    blocked_at TEXT NOT NULL
  );
`);

function seedInitialDemoKey() {
  const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM licenses').get();
  if (countRow && countRow.cnt === 0) {
    db.prepare(`
      INSERT INTO licenses (key, username, tier, expires_at, hwid, revoked, products_json, branches_json, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(
      'NN-DEMO-2026-OPEN',
      'Developer',
      'Enterprise',
      '2035-05-09T03:00:00.000Z',
      null,
      JSON.stringify(['cs2', 'minecraft']),
      JSON.stringify(['Stable', 'Beta', 'Nightly']),
      new Date().toISOString()
    );
  }
}
seedInitialDemoKey();

function mapLicenseRow(row) {
  if (!row) return null;
  return {
    key: row.key,
    username: row.username,
    tier: row.tier,
    expiresAt: row.expires_at,
    hwid: row.hwid,
    revoked: Boolean(row.revoked),
    products: JSON.parse(row.products_json || '[]'),
    branches: JSON.parse(row.branches_json || '[]'),
    launchCount: row.launch_count,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at
  };
}

function getLicense(key) {
  return mapLicenseRow(db.prepare('SELECT * FROM licenses WHERE key = ?').get(key));
}

function listLicenses() {
  return db.prepare('SELECT * FROM licenses ORDER BY created_at DESC').all().map(mapLicenseRow);
}

function bindHwidAndTouch(key, hwid) {
  db.prepare('UPDATE licenses SET hwid = COALESCE(hwid, ?), last_seen_at = ? WHERE key = ?').run(
    hwid,
    new Date().toISOString(),
    key
  );
}

function incrementLaunchCount(key) {
  db.prepare('UPDATE licenses SET launch_count = launch_count + 1, last_seen_at = ? WHERE key = ?').run(
    new Date().toISOString(),
    key
  );
}

function createLicense({ key, username, tier, expiresAt, products, branches }) {
  const generatedKey = (
    key ||
    `NN-${crypto.randomBytes(2).toString('hex')}-${crypto.randomBytes(2).toString('hex')}-${crypto.randomBytes(2).toString('hex')}`
  ).toUpperCase();

  db.prepare(`
    INSERT INTO licenses (key, username, tier, expires_at, hwid, revoked, products_json, branches_json, created_at)
    VALUES (?, ?, ?, ?, NULL, 0, ?, ?, ?)
  `).run(
    generatedKey,
    username || 'Customer',
    tier || 'Pro',
    expiresAt || null,
    JSON.stringify(products || ['cs2', 'minecraft']),
    JSON.stringify(branches || ['Stable', 'Beta', 'Nightly']),
    new Date().toISOString()
  );

  return getLicense(generatedKey);
}

function setLicenseRevoked(key, revoked) {
  db.prepare('UPDATE licenses SET revoked = ? WHERE key = ?').run(revoked ? 1 : 0, key);
}

function resetLicenseHwid(key) {
  db.prepare('UPDATE licenses SET hwid = NULL WHERE key = ?').run(key);
}

function deleteLicense(key) {
  db.prepare('DELETE FROM licenses WHERE key = ?').run(key);
}

function createSession(licenseKey, hwid, ip, ttlMinutes = 60) {
  const sessionId = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const expiresAt = now + ttlMinutes * 60 * 1000;

  db.prepare(`
    INSERT INTO sessions (session_id, license_key, hwid, ip, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, licenseKey, hwid, ip || null, expiresAt, now);

  return { sessionId, expiresAt };
}

function getValidSession(sessionId, hwid) {
  const row = db.prepare('SELECT * FROM sessions WHERE session_id = ? AND hwid = ?').get(sessionId, hwid);
  if (!row) return null;
  if (Date.now() > row.expires_at) {
    db.prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId);
    return null;
  }
  return row;
}

function deleteSession(sessionId) {
  db.prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId);
}

function listActiveSessions() {
  const now = Date.now();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  return db.prepare(`
    SELECT s.session_id, s.license_key, s.hwid, s.ip, s.expires_at, s.created_at, l.username, l.tier
    FROM sessions s
    LEFT JOIN licenses l ON l.key = s.license_key
    ORDER BY s.created_at DESC
  `).all();
}

function logEvent({ eventType, key, hwid, ip, productId, branch, details }) {
  db.prepare(`
    INSERT INTO analytics_events (event_type, license_key, hwid, ip, product_id, branch, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventType,
    key || null,
    hwid || null,
    ip || null,
    productId || null,
    branch || null,
    details || null,
    new Date().toISOString()
  );
}

function listEvents(limit = 100) {
  return db.prepare('SELECT * FROM analytics_events ORDER BY id DESC LIMIT ?').all(limit);
}

function logTraffic({ method, path, ip, statusCode, latencyMs, userAgent }) {
  db.prepare(`
    INSERT INTO traffic_logs (method, path, ip, status_code, latency_ms, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(method, path, ip, statusCode, latencyMs, userAgent || null, new Date().toISOString());
}

function listTraffic(limit = 120) {
  return db.prepare('SELECT * FROM traffic_logs ORDER BY id DESC LIMIT ?').all(limit);
}

function clearLogs() {
  db.exec('DELETE FROM traffic_logs; DELETE FROM analytics_events;');
}

function isIpBanned(ip) {
  const row = db.prepare('SELECT ip FROM blocked_ips WHERE ip = ?').get(ip);
  return Boolean(row);
}

function banIp(ip, reason = 'Administrative ban') {
  db.prepare('INSERT OR REPLACE INTO blocked_ips (ip, reason, blocked_at) VALUES (?, ?, ?)').run(
    ip,
    reason,
    new Date().toISOString()
  );
}

function unbanIp(ip) {
  db.prepare('DELETE FROM blocked_ips WHERE ip = ?').run(ip);
}

function listBlockedIps() {
  return db.prepare('SELECT * FROM blocked_ips ORDER BY blocked_at DESC').all();
}

function getStats() {
  const now = Date.now();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);

  const totalLicenses = db.prepare('SELECT COUNT(*) AS c FROM licenses').get().c;
  const activeLicenses = db.prepare('SELECT COUNT(*) AS c FROM licenses WHERE revoked = 0').get().c;
  const activeSessions = db.prepare('SELECT COUNT(*) AS c FROM sessions').get().c;
  const totalLaunches = db.prepare('SELECT COALESCE(SUM(launch_count), 0) AS c FROM licenses').get().c;
  const bannedCount = db.prepare('SELECT COUNT(*) AS c FROM blocked_ips').get().c;
  const alertsCount = db.prepare(`
    SELECT COUNT(*) AS c FROM analytics_events 
    WHERE event_type IN ('anti_debug_triggered', 'replay_detected', 'hwid_mismatch', 'admin_session_hijack_blocked', 'banned_ip_blocked')
  `).get().c;

  const oneMinAgo = new Date(Date.now() - 60000).toISOString();
  const rpmRow = db.prepare('SELECT COUNT(*) AS c FROM traffic_logs WHERE created_at >= ?').get(oneMinAgo);
  const latencyRow = db.prepare('SELECT COALESCE(AVG(latency_ms), 0) AS avg_lat FROM traffic_logs WHERE created_at >= ?').get(oneMinAgo);

  return {
    totalLicenses,
    activeLicenses,
    activeSessions,
    totalLaunches,
    bannedCount,
    securityAlerts: alertsCount,
    rpm: rpmRow ? rpmRow.c : 0,
    avgLatencyMs: latencyRow ? Math.round(latencyRow.avg_lat) : 0
  };
}

module.exports = {
  db,
  getLicense,
  listLicenses,
  bindHwidAndTouch,
  incrementLaunchCount,
  createLicense,
  setLicenseRevoked,
  resetLicenseHwid,
  deleteLicense,
  createSession,
  getValidSession,
  deleteSession,
  listActiveSessions,
  logEvent,
  listEvents,
  logTraffic,
  listTraffic,
  clearLogs,
  isIpBanned,
  banIp,
  unbanIp,
  listBlockedIps,
  getStats
};
