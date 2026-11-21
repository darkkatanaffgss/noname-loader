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

const DOCK_I18N = {
  ru: { navGames: "Главная", navSettings: "Настройки" },
  en: { navGames: "Home", navSettings: "Settings" },
  uk: { navGames: "Головна", navSettings: "Налаштування" },
};

function applyDockSync(payload) {
  if (!payload) return;
  const root = document.documentElement;
  if (typeof payload.glassOpacity === "number") {
    root.style.setProperty("--glass-alpha", (payload.glassOpacity / 100).toFixed(2));
  }

  if (typeof payload.userName === "string") {
    document.getElementById("dock-user-name").textContent = payload.userName || "User";
  }

  const avatarImg = document.getElementById("dock-avatar-img");
  const avatarFallback = document.getElementById("dock-avatar-fallback");
  if (payload.userAvatar) {
    avatarImg.src = payload.userAvatar;
    avatarImg.classList.remove("hidden");
    avatarFallback.classList.add("hidden");
  } else if (payload.userAvatar === "") {
    avatarImg.src = "";
    avatarImg.classList.add("hidden");
    avatarFallback.classList.remove("hidden");
  }

  if (payload.lang && DOCK_I18N[payload.lang]) {
    const dict = DOCK_I18N[payload.lang];
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const k = el.getAttribute("data-i18n");
      if (dict[k]) el.textContent = dict[k];
    });
  }

  if (payload.activeView) {
    document.querySelectorAll(".dock-tab").forEach((t) => {
      t.classList.toggle("is-active", t.dataset.view === payload.activeView);
    });
    document
      .getElementById("dock-user-btn")
      .classList.toggle("is-active", payload.activeView === "profile");
  }
}

function playDockEntrance() {
  const dock = document.getElementById("dock-root");
  dock.classList.remove("is-entered");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      dock.classList.add("is-entered");
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const userBtn = document.getElementById("dock-user-btn");

  userBtn.addEventListener("click", () => {
    document.querySelectorAll(".dock-tab").forEach((t) => t.classList.remove("is-active"));
    userBtn.classList.add("is-active");
    if (tauriCore) tauriCore.invoke("dock_switch_view", { view: "profile" });
  });

  document.querySelectorAll(".dock-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const view = tab.dataset.view;
      userBtn.classList.remove("is-active");
      document.querySelectorAll(".dock-tab").forEach((t) => {
        t.classList.toggle("is-active", t.dataset.view === view);
      });
      if (tauriCore) tauriCore.invoke("dock_switch_view", { view });
    });
  });

  if (tauriEvent) {
    tauriEvent.listen("ui-state-sync", (event) => {
      applyDockSync(event.payload);
    });
    tauriEvent.listen("main-enter", () => {
      playDockEntrance();
    });
  }
});
