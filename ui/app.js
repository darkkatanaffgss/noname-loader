const tauriCore = window.__TAURI__?.core;
const tauriEvent = window.__TAURI__?.event;

window.addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("keydown", (e) => {
  if (
    e.key === "F5" ||
    e.key === "F12" ||
    (e.ctrlKey && ["r", "R", "s", "S", "p", "P", "u", "U"].includes(e.key)) ||
    (e.ctrlKey && e.shiftKey && ["I", "i", "J", "j", "C", "c"].includes(e.key))
  ) {
    e.preventDefault();
  }
});

const CFG = window.AETHER_CONFIG || {};
const BASE_GAMES = Array.isArray(CFG.games) ? CFG.games : [];

const I18N = {
  ru: {
    gamesTitle: "Библиотека",
    gamesSubtitle: "Выберите игру для просмотра обновлений и запуска",
    cardOpen: "Открыть",
    settingsTitle: "Настройки",
    settingsSubtitle: "Язык, прозрачность стекла, анимации и пути запуска",
    langSection: "Язык",
    splashSection: "Прелоадер и анимации",
    splashDurationLabel: "Загрузка",
    animSpeedLabel: "Переходы",
    speedSmooth: "Плавно",
    speedSnappy: "Быстро",
    blurSection: "Прозрачность и блюр",
    glassOpacityLabel: "Затемнение стекла",
    cardBlurLabel: "Блюр карточек игр",
    pathsSection: "Пути запуска (URI / .EXE)",
    profileTitle: "Профиль",
    profileSubtitle: "Настройка круглой иконки, имени и ключа доступа",
    profileIdentity: "Профиль и аватар",
    profileUploadBtn: "Выбрать фото",
    profileResetBtn: "Сбросить",
    profileNameLabel: "Имя в нижней панели",
    profileLicenseLabel: "Ключ доступа (License Key)",
    profileKeyPrompt: "Введите ключ активации",
    profileVerifyBtn: "Активировать ключ",
    profileVerifying: "Проверка...",
    profileCopyHwid: "Копировать",
    profileCopied: "Скопировано",
    profileLogoutBtn: "Выйти / Сменить ключ",
    loginTitle: "Авторизация клиента",
    loginSubtitle: "Введите лицензионный ключ для доступа к библиотеке",
    loginSubmitBtn: "Войти в клиент",
    loginChecking: "Проверка ключа...",
    loginSuccess: "Ключ подтвержден! Добро пожаловать",
    loginHwidLabel: "Аппаратный ID (HWID):",
    loginDemoHint: "Тестовый демо-ключ:",
    keyRequiredErr: "Сначала активируйте ключ",
    modalUpdatesTitle: "Описание обновлений",
    modalStartBtn: "START",
    launchPrep: "Подготовка окружения...",
    launchVerify: "Проверка модуля...",
    launchGo: "Запуск...",
    launchMissing: "Путь не найден — укажите свой .exe в Настройках",
    launchSent: "Команда запуска отправлена!",
  },
  en: {
    gamesTitle: "Library",
    gamesSubtitle: "Select a game to inspect updates and launch",
    cardOpen: "Open",
    settingsTitle: "Settings",
    settingsSubtitle: "Language, acrylic transparency, transitions, and launch targets",
    langSection: "Language",
    splashSection: "Preloader & Animations",
    splashDurationLabel: "Preloader",
    animSpeedLabel: "Transitions",
    speedSmooth: "Smooth",
    speedSnappy: "Snappy",
    blurSection: "Transparency & Blur",
    glassOpacityLabel: "Dark glass tint",
    cardBlurLabel: "Card artwork blur",
    pathsSection: "Launch Targets (URI / .EXE)",
    profileTitle: "Profile",
    profileSubtitle: "Customize avatar icon, display name, and license key",
    profileIdentity: "Profile & Avatar",
    profileUploadBtn: "Choose Photo",
    profileResetBtn: "Reset",
    profileNameLabel: "Dock display name",
    profileLicenseLabel: "License Key",
    profileKeyPrompt: "Enter activation key",
    profileVerifyBtn: "Activate Key",
    profileVerifying: "Checking...",
    profileCopyHwid: "Copy",
    profileCopied: "Copied",
    profileLogoutBtn: "Sign Out / Change Key",
    loginTitle: "Client Authorization",
    loginSubtitle: "Enter your license access key to unlock the library",
    loginSubmitBtn: "Sign In",
    loginChecking: "Verifying key...",
    loginSuccess: "Key verified! Welcome",
    loginHwidLabel: "Hardware ID (HWID):",
    loginDemoHint: "Demo test key:",
    keyRequiredErr: "Activate a valid key first",
    modalUpdatesTitle: "Update Notes",
    modalStartBtn: "START",
    launchPrep: "Preparing environment...",
    launchVerify: "Verifying module...",
    launchGo: "Launching...",
    launchMissing: "Target not found — configure path in Settings",
    launchSent: "Launch signal dispatched!",
  },
  uk: {
    gamesTitle: "Бібліотека",
    gamesSubtitle: "Оберіть гру для перегляду оновлень та запуску",
    cardOpen: "Відкрити",
    settingsTitle: "Налаштування",
    settingsSubtitle: "Мова, прозорість блюру, анімації та шляхи запуску",
    langSection: "Мова",
    splashSection: "Прелоадер та анімації",
    splashDurationLabel: "Завантаження",
    animSpeedLabel: "Переходи",
    speedSmooth: "Плавно",
    speedSnappy: "Швидко",
    blurSection: "Прозорість і блюр",
    glassOpacityLabel: "Затемнення скла",
    cardBlurLabel: "Блюр карток ігор",
    pathsSection: "Шляхи запуску (URI / .EXE)",
    profileTitle: "Профіль",
    profileSubtitle: "Налаштування круглої іконки, імені та ключа доступу",
    profileIdentity: "Профіль та аватар",
    profileUploadBtn: "Обрати фото",
    profileResetBtn: "Скинути",
    profileNameLabel: "Ім'я у нижній панелі",
    profileLicenseLabel: "Ключ доступу (License Key)",
    profileKeyPrompt: "Введіть ключ активації",
    profileVerifyBtn: "Активувати ключ",
    profileVerifying: "Перевірка...",
    profileCopyHwid: "Копіювати",
    profileCopied: "Скопійовано",
    profileLogoutBtn: "Вийти / Змінити ключ",
    loginTitle: "Авторизація клієнта",
    loginSubtitle: "Введіть ліцензійний ключ для доступу до бібліотеки",
    loginSubmitBtn: "Увійти в клієнт",
    loginChecking: "Перевірка ключа...",
    loginSuccess: "Ключ підтверджено! Ласкаво просимо",
    loginHwidLabel: "Апаратний ID (HWID):",
    loginDemoHint: "Тестовий демо-ключ:",
    keyRequiredErr: "Спочатку активуйте ключ",
    modalUpdatesTitle: "Опис оновлень",
    modalStartBtn: "START",
    launchPrep: "Підготовка середовища...",
    launchVerify: "Перевірка модуля...",
    launchGo: "Запуск...",
    launchMissing: "Шлях не знайдено — вкажіть .exe у Налаштуваннях",
    launchSent: "Команду запуску надіслано!",
  },
};

const STORAGE_KEY = "aether_loader_state_v6";

const state = {
  lang: CFG.defaultLang || "ru",
  glassOpacity: 40,
  cardBlur: 2,
  splashMs: 1350,
  animSpeed: "smooth",
  brandTitle: CFG.brandTitle || "Aether",
  version: CFG.version || "v2.4",
  userName: CFG.defaultUserName || "User",
  userAvatar: "",
  licenseKey: "",
  keyValid: false,
  sessionId: null,
  hwid: "NN-0000-0000-0000-0000",
  targets: Object.fromEntries(BASE_GAMES.map((g) => [g.id, g.defaultTarget])),
  activeView: "login",
  selectedGameId: null,
  launching: false,
};

let heartbeatInterval = null;

function startHeartbeatLoop() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  if (!state.keyValid || !state.sessionId) return;

  heartbeatInterval = setInterval(async () => {
    if (!state.keyValid || !state.sessionId) {
      clearInterval(heartbeatInterval);
      return;
    }
    try {
      const res = await window.LoaderAPI.heartbeat(state.sessionId, state.hwid);
      if (res && res.active === false) {
        state.keyValid = false;
        state.sessionId = null;
        saveState();
        clearInterval(heartbeatInterval);
        if (tauriCore) {
          tauriCore.invoke("set_dock_visible", { visible: false });
        }
        const statusBox = document.getElementById("login-status-box");
        if (statusBox) {
          statusBox.textContent = `✕ Session terminated: ${res.message || "Key revoked"}`;
          statusBox.className = "login-status-box";
        }
        switchView("login");
      }
    } catch (_) {}
  }, 25000);
}

function renderLoginView() {
  const hwidEl = document.getElementById("login-hwid-val");
  if (hwidEl) hwidEl.textContent = state.hwid;
  const inputEl = document.getElementById("login-key-input");
  if (inputEl && state.licenseKey && !inputEl.value) {
    inputEl.value = state.licenseKey;
  }
}

async function submitLogin(key) {
  const dict = I18N[state.lang] || I18N.ru;
  const btn = document.getElementById("btn-login-submit");
  const spinner = document.getElementById("login-spinner");
  const btnText = btn.querySelector("span");
  const statusBox = document.getElementById("login-status-box");

  const cleanKey = (key || "").trim().toUpperCase();
  if (!cleanKey) {
    statusBox.textContent = "✕ " + (dict.profileKeyPrompt || "Enter license key");
    statusBox.className = "login-status-box";
    return;
  }

  btn.disabled = true;
  spinner.classList.remove("hidden");
  btnText.textContent = dict.loginChecking;
  statusBox.className = "login-status-box hidden";

  try {
    const res = await window.LoaderAPI.verifyKey(cleanKey);
    if (res && res.valid) {
      state.keyValid = true;
      state.licenseKey = cleanKey;
      state.sessionId = res.session_id || null;
      saveState();

      statusBox.textContent = "✓ " + (dict.loginSuccess || "Verified!");
      statusBox.className = "login-status-box is-success";

      await sleep(400);
      switchView("games");
      if (tauriCore) {
        tauriCore.invoke("set_dock_visible", { visible: true });
      }
      startHeartbeatLoop();
    } else {
      state.keyValid = false;
      state.sessionId = null;
      saveState();
      statusBox.textContent = "✕ " + (res?.message || "Invalid license key");
      statusBox.className = "login-status-box";
    }
  } catch (err) {
    state.keyValid = false;
    statusBox.textContent = "✕ " + String(err);
    statusBox.className = "login-status-box";
  } finally {
    btn.disabled = false;
    spinner.classList.add("hidden");
    btnText.textContent = dict.loginSubmitBtn;
  }
}

function logout() {
  state.keyValid = false;
  state.sessionId = null;
  state.licenseKey = "";
  saveState();
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (tauriCore) {
    tauriCore.invoke("set_dock_visible", { visible: false });
  }
  const statusBox = document.getElementById("login-status-box");
  if (statusBox) statusBox.className = "login-status-box hidden";
  const input = document.getElementById("login-key-input");
  if (input) input.value = "";
  switchView("login");
}

function allGames() {
  const extras = window.LoaderAPI ? window.LoaderAPI._getCustomGames() : [];
  return [...BASE_GAMES, ...extras];
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        lang: state.lang,
        glassOpacity: state.glassOpacity,
        cardBlur: state.cardBlur,
        splashMs: state.splashMs,
        animSpeed: state.animSpeed,
        userName: state.userName,
        userAvatar: state.userAvatar,
        licenseKey: state.licenseKey,
        keyValid: state.keyValid,
        sessionId: state.sessionId,
        targets: state.targets,
      })
    );
  } catch (_) {}
}

function pushDockSync() {
  if (!tauriCore) return;
  tauriCore.invoke("sync_ui_state", {
    payload: {
      lang: state.lang,
      glassOpacity: state.glassOpacity,
      userName: state.userName,
      userAvatar: state.userAvatar,
      activeView: state.activeView,
    },
  }).catch(() => {});
}

function loadSavedState() {
  try {
    const rawSaved = localStorage.getItem(STORAGE_KEY);
    if (!rawSaved) return;
    const saved = JSON.parse(rawSaved);
    if (saved.lang) state.lang = saved.lang;
    if (typeof saved.glassOpacity === "number") state.glassOpacity = saved.glassOpacity;
    if (typeof saved.cardBlur === "number") state.cardBlur = saved.cardBlur;
    if (typeof saved.splashMs === "number") state.splashMs = saved.splashMs;
    if (saved.animSpeed) state.animSpeed = saved.animSpeed;
    if (typeof saved.userName === "string") state.userName = saved.userName;
    if (typeof saved.userAvatar === "string") state.userAvatar = saved.userAvatar;
    if (typeof saved.licenseKey === "string") state.licenseKey = saved.licenseKey;
    if (typeof saved.keyValid === "boolean") state.keyValid = saved.keyValid;
    if (typeof saved.sessionId === "string") state.sessionId = saved.sessionId;
    if (saved.targets) state.targets = { ...state.targets, ...saved.targets };
  } catch (_) {}
}

function applyThemeVars() {
  const root = document.documentElement;
  root.style.setProperty("--glass-alpha", (state.glassOpacity / 100).toFixed(2));
  root.style.setProperty("--card-blur", `${state.cardBlur}px`);
  root.style.setProperty("--anim-scale", state.animSpeed === "snappy" ? "0.6" : "1");

  document.getElementById("brand-title").textContent = state.brandTitle;
  document.getElementById("brand-version").textContent = state.version;
  const initials = CFG.brandShort || state.brandTitle.trim().slice(0, 2).toUpperCase() || "NN";
  document.getElementById("brand-initials").textContent = initials;
  pushDockSync();
}

function applyTranslations() {
  const dict = I18N[state.lang] || I18N.ru;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (dict[key]) el.textContent = dict[key];
  });
  renderLoginView();
  renderGames();
  renderSettingsControls();
  renderProfileView();
  if (state.selectedGameId) populateModal(state.selectedGameId);
  pushDockSync();
}

function renderGames() {
  const container = document.getElementById("games-list");
  const dict = I18N[state.lang] || I18N.ru;
  const games = allGames();

  container.innerHTML = games
    .map(
      (g) => `
      <button class="game-card" data-game-id="${g.id}">
        <div class="game-card-bg" style="background-image: url('${g.banner}')"></div>
        <div class="game-card-vignette"></div>

        <div class="game-card-left">
          <img class="game-icon-img" src="${g.icon}" alt="${g.name}" />
          <div class="game-card-info">
            <div class="game-card-top">
              <span class="game-card-name">${g.name}</span>
              <span class="game-badge">${g.tag}</span>
            </div>
            <div class="game-card-sub">${(g.sub && (g.sub[state.lang] || g.sub.en)) || ""}</div>
          </div>
        </div>

        <div class="game-card-cta">
          <span>${dict.cardOpen}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </button>
    `
    )
    .join("");

  container.querySelectorAll(".game-card").forEach((btn) => {
    btn.addEventListener("click", () => openGameModal(btn.dataset.gameId));
  });
}

function renderSettingsControls() {
  document.querySelectorAll("#lang-switcher .seg-btn").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.lang === state.lang);
  });
  document.querySelectorAll("#splash-duration-switcher .seg-btn").forEach((b) => {
    b.classList.toggle("is-active", Number(b.dataset.ms) === state.splashMs);
  });
  document.querySelectorAll("#anim-speed-switcher .seg-btn").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.speed === state.animSpeed);
  });

  document.getElementById("range-glass-opacity").value = state.glassOpacity;
  document.getElementById("val-glass-opacity").textContent = `${state.glassOpacity}%`;
  document.getElementById("range-card-blur").value = state.cardBlur;
  document.getElementById("val-card-blur").textContent = `${state.cardBlur}px`;

  const pathsBox = document.getElementById("settings-paths");
  pathsBox.innerHTML = allGames()
    .map(
      (g) => `
    <div class="path-row">
      <span class="path-name">${g.name}</span>
      <input type="text" class="glass-input compact-input path-input" data-game-id="${g.id}" value="${escapeAttr(state.targets[g.id] || g.defaultTarget || "")}" />
    </div>
  `
    )
    .join("");

  pathsBox.querySelectorAll(".path-input").forEach((inp) => {
    inp.addEventListener("input", () => {
      state.targets[inp.dataset.gameId] = inp.value;
      saveState();
    });
  });
}

function renderProfileView() {
  document.getElementById("profile-name-input").value = state.userName;
  document.getElementById("profile-key-input").value = state.licenseKey;
  document.getElementById("profile-hwid-val").textContent = state.hwid;

  const img = document.getElementById("profile-avatar-img");
  const fallback = document.getElementById("profile-avatar-fallback");
  if (state.userAvatar) {
    img.src = state.userAvatar;
    img.classList.remove("hidden");
    fallback.classList.add("hidden");
  } else {
    img.src = "";
    img.classList.add("hidden");
    fallback.classList.remove("hidden");
  }
}

function populateModal(gameId) {
  const game = allGames().find((g) => g.id === gameId);
  if (!game) return;
  const dict = I18N[state.lang] || I18N.ru;

  const iconEl = document.getElementById("modal-mini-icon");
  iconEl.src = game.icon;
  iconEl.alt = game.name;
  document.getElementById("modal-banner-img").style.backgroundImage = `url('${game.banner}')`;
  document.getElementById("modal-game-title").textContent = game.name;
  document.getElementById("modal-game-version").textContent = game.version;
  document.getElementById("modal-game-sub").textContent = (game.sub && (game.sub[state.lang] || game.sub.en)) || "";
  document.getElementById("modal-game-desc").textContent = (game.desc && (game.desc[state.lang] || game.desc.en)) || "";

  const target = state.targets[game.id] || game.defaultTarget || "";
  document.getElementById("modal-target-label").textContent = target;

  const sections =
    (game.changelogSections && (game.changelogSections[state.lang] || game.changelogSections.en)) || [];
  document.getElementById("modal-changelog-sections").innerHTML = sections
    .map(
      (sec) => `
      <div class="chg-group">
        <div class="chg-group-title">${escapeHtml(sec.version)}</div>
        <ul class="chg-group-list">
          ${sec.items.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
        </ul>
      </div>
    `
    )
    .join("");

  document.getElementById("changelog-scroll-box").scrollTop = 0;

  const progBox = document.getElementById("launch-progress-box");
  if (!state.launching) {
    progBox.classList.add("hidden");
    document.getElementById("launch-progress-fill").style.width = "0%";
    document.getElementById("modal-start-btn").disabled = false;
    document.getElementById("launch-status-text").textContent = dict.launchPrep;
    document.getElementById("launch-percent").textContent = "0%";
  }
}

function openGameModal(gameId) {
  state.selectedGameId = gameId;
  state.launching = false;
  populateModal(gameId);
  const modal = document.getElementById("game-modal");
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function closeGameModal() {
  const modal = document.getElementById("game-modal");
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  state.selectedGameId = null;
  state.launching = false;
}

async function runLaunchSequence() {
  if (!state.selectedGameId || state.launching) return;
  const game = allGames().find((g) => g.id === state.selectedGameId);
  if (!game) return;

  const dict = I18N[state.lang] || I18N.ru;
  const progBox = document.getElementById("launch-progress-box");
  const statusEl = document.getElementById("launch-status-text");
  const pctEl = document.getElementById("launch-percent");
  const fillEl = document.getElementById("launch-progress-fill");
  const startBtn = document.getElementById("modal-start-btn");

  const setProgress = (pct, label) => {
    statusEl.textContent = label;
    pctEl.textContent = `${pct}%`;
    fillEl.style.width = `${pct}%`;
  };

  // 1. Native anti-debug and memory integrity check
  try {
    const sec = await window.LoaderAPI.checkSecurity();
    if (sec && !sec.safe) {
      progBox.classList.remove("hidden");
      setProgress(0, `Security Violation: ${sec.threat || sec.details}`);
      if (CFG.api?.telemetryUrl) {
        window.LoaderAPI.http(CFG.api.telemetryUrl, {
          method: "POST",
          body: {
            eventType: "anti_debug_triggered",
            hwid: state.hwid,
            key: state.licenseKey,
            details: sec.threat || sec.details,
          },
        }).catch(() => {});
      }
      state.launching = false;
      startBtn.disabled = false;
      return;
    }
  } catch (_) {}

  // 2. Entitlement verification check
  if (CFG.api?.requireKeyBeforeLaunch && !state.keyValid) {
    progBox.classList.remove("hidden");
    setProgress(0, dict.keyRequiredErr);
    state.launching = false;
    startBtn.disabled = false;
    return;
  }

  // 3. Server-side launch authorization ticket
  if (state.sessionId && CFG.api?.authorizeUrl) {
    progBox.classList.remove("hidden");
    setProgress(15, "Authorizing session...");
    try {
      const authRes = await window.LoaderAPI.authorizeLaunch(game.id, state.sessionId, state.hwid, "Stable");
      if (!authRes || !authRes.authorized) {
        setProgress(0, `Access Denied: ${authRes?.message || "Not authorized"}`);
        state.launching = false;
        startBtn.disabled = false;
        return;
      }
    } catch (_) {}
  }

  state.launching = true;
  startBtn.disabled = true;
  progBox.classList.remove("hidden");

  const target = state.targets[game.id] || game.defaultTarget || "";

  const jsHook = window.LoaderAPI ? window.LoaderAPI._getLaunchHook(game.id) : null;
  if (jsHook) {
    try {
      const handled = await jsHook({
        game,
        target,
        key: state.licenseKey,
        hwid: state.hwid,
        setProgress,
        invokeNative: (cmd, args) => window.LoaderAPI.invokeNative(cmd, args),
      });
      if (handled === true) {
        await sleep(800);
        state.launching = false;
        startBtn.disabled = false;
        return;
      }
    } catch (err) {
      statusEl.textContent = String(err);
      await sleep(1000);
      state.launching = false;
      startBtn.disabled = false;
      return;
    }
  }

  for (const step of [
    { pct: 34, label: dict.launchPrep, delay: 220 },
    { pct: 76, label: dict.launchVerify, delay: 250 },
    { pct: 100, label: dict.launchGo, delay: 180 },
  ]) {
    setProgress(step.pct, step.label);
    await sleep(step.delay);
  }

  if (tauriCore) {
    try {
      const hookRes = await tauriCore.invoke("api_on_launch", {
        payload: {
          game_id: game.id,
          target,
          key: state.licenseKey || null,
          hwid: state.hwid,
        },
      });
      if (hookRes && hookRes.handled) {
        statusEl.textContent = hookRes.message || dict.launchSent;
      } else {
        const res = await tauriCore.invoke("launch_game", { target });
        statusEl.textContent = res.launched ? dict.launchSent : dict.launchMissing;
      }
    } catch (err) {
      statusEl.textContent = String(err);
    }
  } else {
    statusEl.textContent = dict.launchSent;
  }

  await sleep(900);
  state.launching = false;
  startBtn.disabled = false;
}

function switchView(viewName) {
  state.activeView = viewName;
  document.querySelectorAll(".view").forEach((v) => {
    v.classList.toggle("is-active", v.id === `view-${viewName}`);
  });
  if (viewName === "login") {
    renderLoginView();
    if (tauriCore) tauriCore.invoke("set_dock_visible", { visible: false });
  } else if (viewName === "profile") {
    renderProfileView();
  }
  pushDockSync();
}

function playMainEntrance() {
  const root = document.getElementById("main-root");
  root.classList.remove("is-entered");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.add("is-entered");
    });
  });
}

function resizeAvatarDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 160;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.88));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function bindEvents() {
  document.getElementById("btn-minimize").addEventListener("click", () => {
    if (tauriCore) tauriCore.invoke("minimize_all");
  });

  document.getElementById("btn-close").addEventListener("click", () => {
    if (tauriCore) tauriCore.invoke("close_all");
  });

  document.getElementById("btn-replay-splash").addEventListener("click", () => {
    closeGameModal();
    document.getElementById("main-root").classList.remove("is-entered");
    if (tauriCore) tauriCore.invoke("replay_intro");
  });

  if (tauriEvent) {
    tauriEvent.listen("switch-view", (event) => {
      if (typeof event.payload === "string") {
        closeGameModal();
        switchView(event.payload);
      }
    });
    tauriEvent.listen("main-enter", () => {
      playMainEntrance();
      pushDockSync();
    });
  }

  document.getElementById("modal-close-btn").addEventListener("click", closeGameModal);
  document.getElementById("game-modal").addEventListener("click", (e) => {
    if (e.target.id === "game-modal") closeGameModal();
  });
  document.getElementById("modal-start-btn").addEventListener("click", runLaunchSequence);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeGameModal();
  });

  document.querySelectorAll("#lang-switcher .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.lang = btn.dataset.lang;
      saveState();
      applyTranslations();
    });
  });

  document.querySelectorAll("#splash-duration-switcher .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.splashMs = Number(btn.dataset.ms);
      saveState();
      renderSettingsControls();
    });
  });

  document.querySelectorAll("#anim-speed-switcher .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.animSpeed = btn.dataset.speed;
      saveState();
      applyThemeVars();
      renderSettingsControls();
    });
  });

  document.getElementById("range-glass-opacity").addEventListener("input", (e) => {
    state.glassOpacity = Number(e.target.value);
    document.getElementById("val-glass-opacity").textContent = `${state.glassOpacity}%`;
    applyThemeVars();
    saveState();
  });

  document.getElementById("range-card-blur").addEventListener("input", (e) => {
    state.cardBlur = Number(e.target.value);
    document.getElementById("val-card-blur").textContent = `${state.cardBlur}px`;
    applyThemeVars();
    saveState();
  });

  // Profile avatar & name
  const avatarInput = document.getElementById("profile-avatar-input");
  document.getElementById("btn-upload-avatar").addEventListener("click", () => avatarInput.click());
  avatarInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      state.userAvatar = await resizeAvatarDataUrl(file);
      saveState();
      renderProfileView();
      pushDockSync();
    } catch (_) {}
    avatarInput.value = "";
  });

  document.getElementById("btn-reset-avatar").addEventListener("click", () => {
    state.userAvatar = "";
    saveState();
    renderProfileView();
    pushDockSync();
  });

  document.getElementById("profile-name-input").addEventListener("input", (e) => {
    state.userName = e.target.value.trim() || "User";
    saveState();
    pushDockSync();
  });

  // License key verification hook
  document.getElementById("btn-verify-key").addEventListener("click", async () => {
    const dict = I18N[state.lang] || I18N.ru;
    const btn = document.getElementById("btn-verify-key");
    const box = document.getElementById("profile-key-status");
    const key = document.getElementById("profile-key-input").value.trim();

    state.licenseKey = key;
    btn.disabled = true;
    btn.querySelector("span").textContent = dict.profileVerifying;
    box.classList.add("hidden");
    box.classList.remove("is-error");

    try {
      const res = await window.LoaderAPI.verifyKey(key);
      state.keyValid = Boolean(res?.valid);
      state.sessionId = res?.session_id || null;
      saveState();
      if (!state.keyValid) box.classList.add("is-error");
      box.textContent = `${state.keyValid ? "✓" : "✕"} ${res?.plan || ""} — ${res?.message || ""}`;
      box.classList.remove("hidden");
      if (state.keyValid && state.sessionId) {
        startHeartbeatLoop();
      }
    } catch (err) {
      box.classList.add("is-error");
      box.textContent = `✕ ${String(err)}`;
      box.classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.querySelector("span").textContent = dict.profileVerifyBtn;
    }
  });

  document.getElementById("btn-copy-hwid").addEventListener("click", async () => {
    const dict = I18N[state.lang] || I18N.ru;
    const btn = document.getElementById("btn-copy-hwid");
    try {
      await navigator.clipboard.writeText(state.hwid);
      btn.textContent = dict.profileCopied;
      setTimeout(() => {
        btn.textContent = dict.profileCopyHwid;
      }, 1200);
    } catch (_) {}
  });

  // Login Gate event handlers
  const loginSubmitBtn = document.getElementById("btn-login-submit");
  if (loginSubmitBtn) {
    loginSubmitBtn.addEventListener("click", () => {
      const input = document.getElementById("login-key-input");
      submitLogin(input ? input.value : "");
    });
  }

  const loginInput = document.getElementById("login-key-input");
  if (loginInput) {
    loginInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        submitLogin(loginInput.value);
      }
    });
  }

  const copyLoginHwid = document.getElementById("btn-login-copy-hwid");
  if (copyLoginHwid) {
    copyLoginHwid.addEventListener("click", async () => {
      const dict = I18N[state.lang] || I18N.ru;
      try {
        await navigator.clipboard.writeText(state.hwid);
        copyLoginHwid.textContent = dict.profileCopied;
        setTimeout(() => {
          copyLoginHwid.textContent = dict.profileCopyHwid;
        }, 1200);
      } catch (_) {}
    });
  }

  const pasteBtn = document.getElementById("btn-login-paste");
  if (pasteBtn && loginInput) {
    pasteBtn.addEventListener("click", async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) loginInput.value = text.trim();
      } catch (_) {}
    });
  }

  const demoHint = document.querySelector(".login-demo-hint code");
  if (demoHint && loginInput) {
    demoHint.addEventListener("click", () => {
      loginInput.value = demoHint.textContent.trim();
    });
  }

  const logoutBtn = document.getElementById("btn-logout-key");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeAttr(str) {
  return String(str).replace(/"/g, "&quot;");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function init() {
  loadSavedState();
  if (window.LoaderAPI) {
    try {
      state.hwid = await window.LoaderAPI.getHwid();
    } catch (_) {}
  }
  applyThemeVars();
  applyTranslations();
  bindEvents();

  // If a valid key was previously saved, silently verify with server
  if (state.licenseKey && state.keyValid) {
    try {
      const res = await window.LoaderAPI.verifyKey(state.licenseKey);
      if (res && res.valid) {
        state.keyValid = true;
        state.sessionId = res.session_id || state.sessionId;
        saveState();
        switchView("games");
        if (tauriCore) tauriCore.invoke("set_dock_visible", { visible: true });
        startHeartbeatLoop();
        return;
      }
    } catch (_) {}
  }

  // Otherwise lock behind the login view
  state.keyValid = false;
  state.sessionId = null;
  saveState();
  switchView("login");
  if (tauriCore) tauriCore.invoke("set_dock_visible", { visible: false });
}

document.addEventListener("DOMContentLoaded", init);
