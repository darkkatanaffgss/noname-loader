/**
 * Aether Loader Developer API
 * ---------------------------------------------------------------------------
 * File-based extension layer for developers building loaders/launchers
 * (Minecraft clients, CS2 tools, C++/Rust modules) with key verification.
 *
 * Examples:
 *   // 1. Custom license key verification (or set `api.verifyKeyUrl` in config.js)
 *   LoaderAPI.onVerifyKey(async ({ key, hwid }) => {
 *     const res = await LoaderAPI.http("https://your-site.com/api/verify", {
 *       method: "POST",
 *       body: { key, hwid }
 *     });
 *     const data = JSON.parse(res.body || "{}");
 *     return { valid: !!data.valid, plan: data.plan || "Pro", expires_at: data.expires || "30d", message: data.msg || "OK" };
 *   });
 *
 *   // 2. Download & launch custom payload on START click
 *   LoaderAPI.onLaunch("minecraft", async (ctx) => {
 *     ctx.setProgress(30, "Downloading client...");
 *     await LoaderAPI.download("https://your-site.com/client.jar", "C:\\Games\\client.jar");
 *     ctx.setProgress(85, "Starting...");
 *     return false; // return true if you launched the process yourself
 *   });
 */
(function () {
  const customGames = [];
  const launchHooks = new Map();
  let serverCheckHook = null;
  let keyVerifyHook = null;

  function coreInvoke(command, args) {
    const core = window.__TAURI__?.core;
    if (!core) return Promise.resolve(null);
    return core.invoke(command, args);
  }

  const LoaderAPI = {
    version: "1.2.0",

    /** Register an additional game card dynamically. */
    registerGame(gameConfig) {
      if (!gameConfig || !gameConfig.id) return;
      const idx = customGames.findIndex((g) => g.id === gameConfig.id);
      if (idx >= 0) customGames[idx] = gameConfig;
      else customGames.push(gameConfig);
    },

    /** Register a custom async launch hook for `gameId` (or `"*"`). */
    onLaunch(gameId, handler) {
      if (typeof handler === "function") launchHooks.set(gameId, handler);
    },

    /** Override startup server-check hook. */
    onServerCheck(handler) {
      if (typeof handler === "function") serverCheckHook = handler;
    },

    /** Override license key verification logic. */
    onVerifyKey(handler) {
      if (typeof handler === "function") keyVerifyHook = handler;
    },

    /** Get machine HWID from Rust backend. */
    async getHwid() {
      return (await coreInvoke("api_get_hwid")) || "AE-LOCAL";
    },

    /** Verify a license key via custom JS hook, `config.js` verifyKeyUrl, or Rust stub. */
    async verifyKey(key) {
      const hwid = await LoaderAPI.getHwid();
      if (keyVerifyHook) {
        return keyVerifyHook({ key, hwid });
      }
      const verifyUrl = window.AETHER_CONFIG?.api?.verifyKeyUrl || null;
      return coreInvoke("api_verify_key", {
        payload: { key, hwid, verify_url: verifyUrl },
      });
    },

    /** CORS-free HTTPS GET/POST request via native Windows WinHTTP. */
    async http(url, options = {}) {
      const bodyStr =
        options.body === undefined || options.body === null
          ? null
          : typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body);
      return coreInvoke("api_http_request", {
        payload: {
          url,
          method: options.method || "GET",
          body: bodyStr,
          auth_token: options.authToken || window.AETHER_CONFIG?.api?.authToken || null,
        },
      });
    },

    /** Download a file from your site directly to disk. */
    async download(url, savePath, authToken = null) {
      return coreInvoke("api_download_module", {
        url,
        savePath,
        authToken: authToken || window.AETHER_CONFIG?.api?.authToken || null,
      });
    },

    /** Invoke any Rust command directly. */
    async invokeNative(command, args = {}) {
      return coreInvoke(command, args);
    },

    // Internal helpers
    _getCustomGames() {
      return customGames.slice();
    },

    _getLaunchHook(gameId) {
      return launchHooks.get(gameId) || launchHooks.get("*") || null;
    },

    async _runServerCheck() {
      if (serverCheckHook) return serverCheckHook();
      const apiCfg = window.AETHER_CONFIG?.api || {};
      return coreInvoke("api_check_server", {
        apiUrl: apiCfg.statusUrl || null,
        authToken: apiCfg.authToken || null,
      });
    },
  };

  window.LoaderAPI = LoaderAPI;
})();
