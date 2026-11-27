(function () {
  const secretInput = document.getElementById('adminSecret');
  const connectBtn = document.getElementById('connectBtn');
  const autoRefreshBtn = document.getElementById('autoRefreshBtn');
  const exportJsonBtn = document.getElementById('exportJsonBtn');
  const logoutAdminBtn = document.getElementById('logoutAdminBtn');
  const dashboard = document.getElementById('dashboard');
  const errBox = document.getElementById('errBox');

  let csrfToken = '';
  let autoRefresh = true;
  let refreshTimer = null;
  let lastSnapshot = null;

  function toHex(buffer) {
    return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function computeChallengeProof(secret, challenge) {
    if (!window.crypto || !window.crypto.subtle) {
      return { rawSecret: secret };
    }
    try {
      const enc = new TextEncoder();
      const digestBuf = await window.crypto.subtle.digest('SHA-512', enc.encode(secret));
      const digestHex = toHex(digestBuf);
      const hmacKey = await window.crypto.subtle.importKey(
        'raw',
        enc.encode(digestHex),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sigBuf = await window.crypto.subtle.sign('HMAC', hmacKey, enc.encode(challenge));
      return { proof: toHex(sigBuf) };
    } catch (_) {
      return { rawSecret: secret };
    }
  }

  async function api(path, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (csrfToken && method === 'POST') {
      headers['x-csrf-token'] = csrfToken;
    }
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers,
      body: body ? JSON.stringify(body) : null
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  }

  function makeCell(text, isCode = false) {
    const td = document.createElement('td');
    if (isCode) {
      const code = document.createElement('code');
      code.textContent = text || '-';
      td.appendChild(code);
    } else {
      td.textContent = text || '-';
    }
    return td;
  }

  function makePillCell(text, variant = '') {
    const td = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = `pill ${variant}`.trim();
    pill.textContent = text;
    td.appendChild(pill);
    return td;
  }

  function makeActionBtn(label, className, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    if (className) btn.className = className;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function setLoggedInUi(loggedIn) {
    dashboard.style.display = loggedIn ? 'flex' : 'none';
    [autoRefreshBtn, exportJsonBtn, logoutAdminBtn].forEach((el) =>
      el.classList.toggle('hidden', !loggedIn)
    );
    [secretInput, connectBtn].forEach((el) => el.classList.toggle('hidden', loggedIn));
    if (!loggedIn) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    } else {
      startAutoRefresh();
    }
  }

  function startAutoRefresh() {
    clearInterval(refreshTimer);
    if (autoRefresh) {
      refreshTimer = setInterval(refresh, 5000);
    }
  }

  function renderTables(data) {
    lastSnapshot = data;
    document.getElementById('sKeys').textContent = `${data.stats.totalLicenses} / ${data.stats.activeLicenses}`;
    document.getElementById('sSessions').textContent = data.stats.activeSessions;
    document.getElementById('sLaunches').textContent = data.stats.totalLaunches;
    document.getElementById('sRpm').textContent = data.stats.rpm;
    document.getElementById('sLatency').textContent = `${data.stats.avgLatencyMs} ms`;
    document.getElementById('sAlerts').textContent = `${data.stats.securityAlerts} / ${data.stats.bannedCount}`;

    // 1. Licenses
    const lBody = document.getElementById('licensesBody');
    lBody.innerHTML = '';
    for (const lic of data.licenses) {
      const tr = document.createElement('tr');
      tr.appendChild(makeCell(lic.key, true));
      tr.appendChild(makeCell(lic.username));
      tr.appendChild(makeCell(lic.tier));
      tr.appendChild(makeCell(lic.hwid ? `${lic.hwid.slice(0, 14)}…` : 'Unbound', true));
      tr.appendChild(makeCell(lic.expiresAt ? new Date(lic.expiresAt).toLocaleDateString() : 'Lifetime'));
      tr.appendChild(makeCell(String(lic.launchCount)));
      tr.appendChild(makePillCell(lic.revoked ? 'Revoked' : 'Active', lic.revoked ? 'red' : 'green'));

      const actTd = document.createElement('td');
      actTd.className = 'actions';
      actTd.appendChild(makeActionBtn('Copy', '', () => navigator.clipboard.writeText(lic.key)));
      actTd.appendChild(makeActionBtn('Reset HWID', '', () => postAction('/api/v1/admin/keys', { action: 'reset-hwid', key: lic.key })));
      actTd.appendChild(
        makeActionBtn(lic.revoked ? 'Restore' : 'Revoke', '', () =>
          postAction('/api/v1/admin/keys', { action: lic.revoked ? 'unrevoke' : 'revoke', key: lic.key })
        )
      );
      actTd.appendChild(makeActionBtn('Delete', 'danger', () => postAction('/api/v1/admin/keys', { action: 'delete', key: lic.key })));
      tr.appendChild(actTd);
      lBody.appendChild(tr);
    }

    // 2. Traffic Logs
    const tFilter = document.getElementById('trafficFilter').value;
    const tBody = document.getElementById('trafficBody');
    tBody.innerHTML = '';
    for (const log of data.trafficLogs || []) {
      if (tFilter === '2xx' && (log.status_code < 200 || log.status_code >= 300)) continue;
      if (tFilter === '4xx' && log.status_code < 400) continue;
      const tr = document.createElement('tr');
      tr.appendChild(makeCell(new Date(log.created_at).toLocaleTimeString()));
      tr.appendChild(makeCell(log.method, true));
      tr.appendChild(makeCell(log.path, true));
      tr.appendChild(makeCell(log.ip, true));
      const statusVariant = log.status_code >= 400 ? 'red' : 'green';
      tr.appendChild(makePillCell(String(log.status_code), statusVariant));
      tr.appendChild(makeCell(`${log.latency_ms} ms`));
      tr.appendChild(makeCell((log.user_agent || '').slice(0, 36)));
      tBody.appendChild(tr);
    }

    // 3. Active Sessions
    const sBody = document.getElementById('sessionsBody');
    sBody.innerHTML = '';
    for (const sess of data.activeSessions || []) {
      const tr = document.createElement('tr');
      tr.appendChild(makeCell(sess.session_id.slice(0, 12) + '…', true));
      tr.appendChild(makeCell(sess.license_key, true));
      tr.appendChild(makeCell(sess.username || 'Client'));
      tr.appendChild(makeCell(sess.hwid, true));
      tr.appendChild(makeCell(sess.ip || 'Local', true));
      const minLeft = Math.max(0, Math.round((sess.expires_at - Date.now()) / 60000));
      tr.appendChild(makeCell(`${minLeft} min`));

      const actTd = document.createElement('td');
      actTd.className = 'actions';
      actTd.appendChild(
        makeActionBtn('Kick', 'danger', () =>
          postAction('/api/v1/admin/sessions/kick', { sessionId: sess.session_id })
        )
      );
      tr.appendChild(actTd);
      sBody.appendChild(tr);
    }

    // 4. Blocked IPs
    const bBody = document.getElementById('bannedBody');
    bBody.innerHTML = '';
    for (const b of data.blockedIps || []) {
      const tr = document.createElement('tr');
      tr.appendChild(makeCell(b.ip, true));
      tr.appendChild(makeCell(b.reason || '-'));
      tr.appendChild(makeCell(new Date(b.blocked_at).toLocaleString()));

      const actTd = document.createElement('td');
      actTd.className = 'actions';
      actTd.appendChild(
        makeActionBtn('Unban', '', () => postAction('/api/v1/admin/ips', { action: 'unban', ip: b.ip }))
      );
      tr.appendChild(actTd);
      bBody.appendChild(tr);
    }

    // 5. Security Events
    const eBody = document.getElementById('eventsBody');
    eBody.innerHTML = '';
    for (const ev of data.securityEvents || []) {
      const tr = document.createElement('tr');
      tr.appendChild(makeCell(new Date(ev.created_at).toLocaleTimeString()));

      const isAlert = ['anti_debug_triggered', 'replay_detected', 'hwid_mismatch', 'admin_session_hijack_blocked'].includes(ev.event_type);
      tr.appendChild(makePillCell(ev.event_type, isAlert ? 'red' : 'amber'));
      tr.appendChild(makeCell(ev.license_key || '-', true));
      tr.appendChild(makeCell(ev.hwid ? ev.hwid.slice(0, 14) + '…' : '-', true));
      tr.appendChild(makeCell(ev.ip || '-', true));
      tr.appendChild(makeCell(ev.details || '-'));
      eBody.appendChild(tr);
    }
  }

  async function refresh() {
    const { status, data } = await api('/api/v1/admin/analytics');
    if (status === 200 && data.stats) {
      errBox.classList.add('hidden');
      renderTables(data);
    } else if (status === 401) {
      setLoggedInUi(false);
      errBox.textContent = 'Admin session expired. Please sign in again.';
      errBox.classList.remove('hidden');
    }
  }

  async function postAction(url, body) {
    const { status, data } = await api(url, 'POST', body);
    if (status === 200 && data.ok) {
      await refresh();
    } else {
      alert(data.error || 'Operation failed');
    }
  }

  // Event handlers
  connectBtn.addEventListener('click', async () => {
    const secret = secretInput.value.trim();
    if (!secret) return;

    errBox.classList.add('hidden');
    const chRes = await api('/api/v1/admin/challenge');
    if (chRes.status !== 200 || !chRes.data.challenge) {
      errBox.textContent = chRes.data.error || 'Failed to obtain login challenge';
      errBox.classList.remove('hidden');
      return;
    }

    const { proof, rawSecret } = await computeChallengeProof(secret, chRes.data.challenge);
    const loginRes = await api('/api/v1/admin/login', 'POST', {
      challenge: chRes.data.challenge,
      proof,
      rawSecret
    });

    if (loginRes.status === 200 && loginRes.data.ok) {
      csrfToken = loginRes.data.csrfToken || '';
      secretInput.value = '';
      setLoggedInUi(true);
      await refresh();
    } else {
      errBox.textContent = loginRes.data.error || 'Invalid credentials';
      errBox.classList.remove('hidden');
    }
  });

  logoutAdminBtn.addEventListener('click', async () => {
    await api('/api/v1/admin/logout', 'POST', {});
    csrfToken = '';
    setLoggedInUi(false);
  });

  autoRefreshBtn.addEventListener('click', () => {
    autoRefresh = !autoRefresh;
    autoRefreshBtn.textContent = autoRefresh ? 'Live: ON (5s)' : 'Live: OFF';
    startAutoRefresh();
  });

  exportJsonBtn.addEventListener('click', () => {
    if (!lastSnapshot) return;
    const blob = new Blob([JSON.stringify(lastSnapshot, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `noname-analytics-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  });

  document.getElementById('refreshNowBtn').addEventListener('click', refresh);
  document.getElementById('trafficFilter').addEventListener('change', () => {
    if (lastSnapshot) renderTables(lastSnapshot);
  });

  document.querySelectorAll('.admin-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach((b) => b.classList.remove('active-tab'));
      document.querySelectorAll('.subview').forEach((s) => s.classList.remove('active'));
      btn.classList.add('active-tab');
      const targetId = `sub-${btn.dataset.sub}`;
      const el = document.getElementById(targetId);
      if (el) el.classList.add('active');
    });
  });

  document.getElementById('createKeyBtn').addEventListener('click', async () => {
    const username = document.getElementById('newUser').value.trim();
    const tier = document.getElementById('newTier').value;
    const days = document.getElementById('newDays').value;

    const products = Array.from(document.querySelectorAll('.prod-chk:checked')).map((c) => c.value);
    const branches = Array.from(document.querySelectorAll('.br-chk:checked')).map((c) => c.value);

    await postAction('/api/v1/admin/keys', {
      action: 'create',
      username,
      tier,
      days,
      products,
      branches
    });
    document.getElementById('newUser').value = '';
  });

  document.getElementById('banIpBtn').addEventListener('click', async () => {
    const ip = document.getElementById('banIpInput').value.trim();
    const reason = document.getElementById('banReasonInput').value.trim();
    if (!ip) return;
    await postAction('/api/v1/admin/ips', { action: 'ban', ip, reason });
    document.getElementById('banIpInput').value = '';
    document.getElementById('banReasonInput').value = '';
  });

  document.getElementById('clearLogsBtn').addEventListener('click', async () => {
    if (confirm('Clear traffic logs and security event audit?')) {
      await postAction('/api/v1/admin/logs/clear', {});
    }
  });

  // Try checking existing session on page load
  refresh().then(() => {
    if (lastSnapshot) setLoggedInUi(true);
  });
})();
