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

const SPLASH_TEXT = {
  ru: ["Подключение к серверу", "Проверка модулей", "Готово"],
  en: ["Connecting to the server", "Checking modules", "Ready"],
  uk: ["Підключення до сервера", "Перевірка модулів", "Готово"],
};

function readSplashPrefs() {
  const defaults = window.AETHER_CONFIG || {};
  let lang = defaults.defaultLang || "ru";
  let splashMs = 1350;
  try {
    const raw = localStorage.getItem("aether_loader_state_v6");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.lang) lang = parsed.lang;
      if (typeof parsed.splashMs === "number") splashMs = parsed.splashMs;
    }
  } catch (_) {}
  return { lang, splashMs };
}

async function runSplash() {
  const root = document.getElementById("splash-root");
  const statusEl = document.getElementById("splash-status");
  const { lang, splashMs } = readSplashPrefs();
  const labels = SPLASH_TEXT[lang] || SPLASH_TEXT.en;

  root.classList.remove("is-leaving");
  root.classList.add("is-ready");
  statusEl.textContent = labels[0];

  if (window.LoaderAPI) {
    try {
      await window.LoaderAPI._runServerCheck();
    } catch (_) {}
  }

  await new Promise((r) => setTimeout(r, splashMs * 0.55));
  statusEl.textContent = labels[1];
  await new Promise((r) => setTimeout(r, splashMs * 0.35));
  statusEl.textContent = labels[2];
  await new Promise((r) => setTimeout(r, 120));

  root.classList.add("is-leaving");
  await new Promise((r) => setTimeout(r, 180));

  if (tauriCore) {
    await tauriCore.invoke("transition_to_main");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (tauriEvent) {
    tauriEvent.listen("splash-restart", () => {
      runSplash();
    });
  }
  runSplash();
});
