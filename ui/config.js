/**
 * Aether Loader Developer Configuration
 * ---------------------------------------------------------------------------
 * Edit this file to customize branding, games, and your backend API endpoints
 * (license key verification, server status, cheat/client download & launch).
 */
window.AETHER_CONFIG = {
  brandTitle: "Noname",
  brandShort: "NN",
  version: "v2.5",
  defaultUserName: "User",
  defaultLang: "ru", // "ru" | "en" | "uk"

  // Backend API endpoints (Noname License Server & SQLite)
  api: {
    statusUrl: "http://127.0.0.1:3840/api/v1/health",
    verifyKeyUrl: "http://127.0.0.1:3840/api/v1/auth/verify",
    heartbeatUrl: "http://127.0.0.1:3840/api/v1/auth/heartbeat",
    authorizeUrl: "http://127.0.0.1:3840/api/v1/software/authorize",
    telemetryUrl: "http://127.0.0.1:3840/api/v1/telemetry",
    authToken: "",
    requireKeyBeforeLaunch: true,
  },

  // Games displayed on the Home screen
  games: [
    {
      id: "cs2",
      name: "Counter-Strike 2",
      tag: "Source 2",
      version: "Build 1.40.5",
      icon: "assets/games/cs2_icon.png",
      banner: "assets/games/cs2_wide.jpg",
      defaultTarget: "steam://rungameid/730",
      sub: {
        ru: "Тактический шутер • Профиль готов",
        en: "Tactical FPS • Profile Ready",
        uk: "Тактичний шутер • Профіль готовий",
      },
      desc: {
        ru: "Актуальный профиль запуска Counter-Strike 2 с оптимизацией шейдеров, быстрым подключением и поддержкой пользовательских параметров.",
        en: "Updated Counter-Strike 2 launch profile with shader pre-caching, low-latency launch presets, and custom argument support.",
        uk: "Актуальний профіль запуску Counter-Strike 2 з оптимізацією шейдерів та швидким стартом.",
      },
      changelogSections: {
        ru: [
          {
            version: "Обновление v2.4 — 21.11.2026",
            items: [
              "Добавлен профиль запуска Vulkan / DX11 с пониженной задержкой кадра.",
              "Оптимизирован кэш текстур и предзагрузка карт для Premier и Faceit.",
              "Исправлен сброс пользовательских флагов запуска после обновлений клиента.",
            ],
          },
          {
            version: "Обновление v2.3 — 14.11.2026",
            items: [
              "Улучшена совместимость с оверлеем и быстрым переключением конфигов.",
              "Сокращено время инициализации модуля перед стартом игры.",
            ],
          },
        ],
        en: [
          {
            version: "Update v2.4 — 2026-11-21",
            items: [
              "Added low-latency Vulkan / DX11 quick-launch preset.",
              "Optimized shader cache and Premier / Faceit map preloading.",
              "Fixed custom launch flags resetting after client updates.",
            ],
          },
          {
            version: "Update v2.3 — 2026-11-14",
            items: [
              "Improved overlay compatibility and quick config switching.",
              "Reduced pre-launch module initialization time.",
            ],
          },
        ],
        uk: [
          {
            version: "Оновлення v2.4 — 21.11.2026",
            items: [
              "Додано профіль запуску Vulkan / DX11 зі зниженою затримкою.",
              "Оптимізовано кеш текстур та попереднє завантаження мап.",
              "Виправлено скидання параметрів запуску після оновлень.",
            ],
          },
        ],
      },
    },
    {
      id: "minecraft",
      name: "Minecraft",
      tag: "Java & Bedrock",
      version: "v1.21.4",
      icon: "assets/games/mc_icon.png",
      banner: "assets/games/mc_wide.jpg",
      defaultTarget: "minecraft://",
      sub: {
        ru: "Песочница • Профиль 1.21.4",
        en: "Sandbox • Profile 1.21.4",
        uk: "Пісочниця • Профіль 1.21.4",
      },
      desc: {
        ru: "Обновлённый профиль запуска Minecraft с поддержкой современных сборок (Fabric / Forge), настройкой памяти и готовым API для внешних модулей.",
        en: "Refreshed Minecraft launch profile supporting modern modpacks (Fabric / Forge), JVM tuning, and built-in LoaderAPI hooks.",
        uk: "Оновлений профіль запуску Minecraft з підтримкою сучасних збірок та готовим LoaderAPI.",
      },
      changelogSections: {
        ru: [
          {
            version: "Обновление v2.4 — 21.11.2026",
            items: [
              "Добавлена поддержка версий 1.21.4 (Fabric / NeoForge) и тихий запуск.",
              "Подключён открытый LoaderAPI для проверки ключей и скачивания клиентских модулей.",
              "Улучшены параметры сборщика мусора Java для ровного фреймтайма.",
            ],
          },
          {
            version: "Обновление v2.3 — 12.11.2026",
            items: [
              "Устранено зависание при переключении тяжёлых ресурспаков и шейдеров.",
              "Ускорена проверка локального каталога версий.",
            ],
          },
        ],
        en: [
          {
            version: "Update v2.4 — 2026-11-21",
            items: [
              "Added 1.21.4 (Fabric / NeoForge) profile support with quiet launch.",
              "Integrated LoaderAPI hooks for license key verification and client payload downloads.",
              "Tuned JVM GC flags for steadier frame pacing.",
            ],
          },
          {
            version: "Update v2.3 — 2026-11-12",
            items: [
              "Resolved hang when toggling heavy shader resource packs.",
              "Accelerated local version directory validation.",
            ],
          },
        ],
        uk: [
          {
            version: "Оновлення v2.4 — 21.11.2026",
            items: [
              "Додано підтримку версій 1.21.4 (Fabric / NeoForge) та швидкий старт.",
              "Підключено LoaderAPI для перевірки ключів та завантаження модулів.",
              "Покращено параметри пам'яті Java для стабільного FPS.",
            ],
          },
        ],
      },
    },
  ],
};
