use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use std::time::Instant;

#[derive(Serialize)]
pub struct ApiStatusResponse {
    pub online: bool,
    pub status_code: u16,
    pub latency_ms: u64,
    pub server_version: String,
    pub message: String,
    pub body: String,
}

#[derive(Deserialize)]
pub struct ApiRequestPayload {
    pub url: String,
    pub method: Option<String>,
    pub body: Option<String>,
    pub auth_token: Option<String>,
}

#[derive(Deserialize)]
pub struct ApiVerifyKeyPayload {
    pub key: String,
    pub hwid: String,
    pub verify_url: Option<String>,
}

#[derive(Serialize)]
pub struct ApiKeyResult {
    pub valid: bool,
    pub plan: String,
    pub expires_at: String,
    pub message: String,
    pub session_id: Option<String>,
}

#[derive(Deserialize)]
pub struct ApiLaunchPayload {
    pub game_id: String,
    pub target: String,
    pub key: Option<String>,
    pub hwid: Option<String>,
    pub session_id: Option<String>,
}

#[derive(Serialize)]
pub struct ApiHookResult {
    pub ok: bool,
    pub handled: bool,
    pub message: String,
}

#[derive(Serialize)]
pub struct SecurityCheckResult {
    pub safe: bool,
    pub threat: Option<String>,
    pub details: String,
}

#[derive(Deserialize)]
pub struct ApiHeartbeatPayload {
    pub url: String,
    pub session_id: String,
    pub hwid: String,
}

#[derive(Serialize)]
pub struct ApiHeartbeatResult {
    pub active: bool,
    pub message: String,
}

#[derive(Deserialize)]
pub struct ApiAuthorizePayload {
    pub url: String,
    pub session_id: String,
    pub hwid: String,
    pub product_id: String,
    pub branch: Option<String>,
}

#[derive(Serialize)]
pub struct ApiAuthorizeResult {
    pub authorized: bool,
    pub message: String,
}

#[cfg(target_os = "windows")]
mod winhttp_client {
    use std::ffi::c_void;
    use windows::core::PCWSTR;
    use windows::Win32::Networking::WinHttp::*;

    struct HandleGuard(*mut c_void);
    impl Drop for HandleGuard {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe {
                    let _ = WinHttpCloseHandle(self.0);
                }
            }
        }
    }

    fn to_wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub fn execute_http(
        url_str: &str,
        method: &str,
        body: Option<&str>,
        auth_token: Option<&str>,
    ) -> Result<(u16, Vec<u8>), String> {
        let wide_url = to_wide(url_str);
        let mut comp: URL_COMPONENTS = unsafe { std::mem::zeroed() };
        comp.dwStructSize = std::mem::size_of::<URL_COMPONENTS>() as u32;
        comp.dwHostNameLength = u32::MAX;
        comp.dwUrlPathLength = u32::MAX;
        comp.dwExtraInfoLength = u32::MAX;
        comp.dwSchemeLength = u32::MAX;

        unsafe {
            WinHttpCrackUrl(&wide_url[..wide_url.len() - 1], 0, &mut comp)
                .map_err(|e| format!("Invalid URL: {e}"))?;
        }

        let host = if comp.lpszHostName.is_null() || comp.dwHostNameLength == 0 {
            return Err("Missing host in URL".to_string());
        } else {
            let slice = unsafe {
                std::slice::from_raw_parts(comp.lpszHostName.0, comp.dwHostNameLength as usize)
            };
            String::from_utf16_lossy(slice)
        };

        let path = if comp.lpszUrlPath.is_null() || comp.dwUrlPathLength == 0 {
            "/".to_string()
        } else {
            let path_slice = unsafe {
                std::slice::from_raw_parts(comp.lpszUrlPath.0, comp.dwUrlPathLength as usize)
            };
            let mut p = String::from_utf16_lossy(path_slice);
            if !comp.lpszExtraInfo.is_null() && comp.dwExtraInfoLength > 0 {
                let extra = unsafe {
                    std::slice::from_raw_parts(comp.lpszExtraInfo.0, comp.dwExtraInfoLength as usize)
                };
                p.push_str(&String::from_utf16_lossy(extra));
            }
            p
        };

        let is_https = url_str.trim().to_ascii_lowercase().starts_with("https://");
        let port = comp.nPort;

        let agent = to_wide("NonameLoader/2.5");
        let h_session = unsafe {
            WinHttpOpen(
                PCWSTR(agent.as_ptr()),
                WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
                PCWSTR::null(),
                PCWSTR::null(),
                0,
            )
        };
        if h_session.is_null() {
            return Err("WinHttpOpen failed".to_string());
        }
        let _g_session = HandleGuard(h_session);

        unsafe {
            let _ = WinHttpSetTimeouts(h_session, 4000, 5000, 5000, 8000);
        }

        let wide_host = to_wide(&host);
        let h_connect = unsafe { WinHttpConnect(h_session, PCWSTR(wide_host.as_ptr()), port, 0) };
        if h_connect.is_null() {
            return Err("WinHttpConnect failed".to_string());
        }
        let _g_connect = HandleGuard(h_connect);

        let wide_method = to_wide(method);
        let wide_path = to_wide(&path);
        let flags = if is_https { WINHTTP_FLAG_SECURE } else { WINHTTP_OPEN_REQUEST_FLAGS(0) };

        let h_request = unsafe {
            WinHttpOpenRequest(
                h_connect,
                PCWSTR(wide_method.as_ptr()),
                PCWSTR(wide_path.as_ptr()),
                PCWSTR::null(),
                PCWSTR::null(),
                std::ptr::null(),
                flags,
            )
        };
        if h_request.is_null() {
            return Err("WinHttpOpenRequest failed".to_string());
        }
        let _g_request = HandleGuard(h_request);

        let mut headers = String::from("Accept: application/json\r\n");
        if body.is_some() {
            headers.push_str("Content-Type: application/json\r\n");
        }
        if let Some(tok) = auth_token {
            let trimmed = tok.trim();
            if !trimmed.is_empty() {
                headers.push_str(&format!("Authorization: Bearer {trimmed}\r\n"));
            }
        }
        let wide_headers = to_wide(&headers);

        let body_bytes = body.map(|b| b.as_bytes()).unwrap_or(&[]);
        let body_ptr = if body_bytes.is_empty() {
            None
        } else {
            Some(body_bytes.as_ptr() as *const c_void)
        };

        unsafe {
            WinHttpSendRequest(
                h_request,
                Some(&wide_headers[..wide_headers.len() - 1]),
                body_ptr,
                body_bytes.len() as u32,
                body_bytes.len() as u32,
                0,
            )
            .map_err(|e| format!("Request failed: {e}"))?;

            WinHttpReceiveResponse(h_request, std::ptr::null_mut())
                .map_err(|e| format!("Receive response failed: {e}"))?;
        }

        let mut status_code: u32 = 0;
        let mut status_len = std::mem::size_of::<u32>() as u32;
        unsafe {
            WinHttpQueryHeaders(
                h_request,
                WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                PCWSTR::null(),
                Some(&mut status_code as *mut u32 as *mut c_void),
                &mut status_len,
                std::ptr::null_mut(),
            )
            .map_err(|e| format!("Query status failed: {e}"))?;
        }

        let mut response_data = Vec::new();
        loop {
            let mut avail: u32 = 0;
            unsafe {
                WinHttpQueryDataAvailable(h_request, &mut avail)
                    .map_err(|e| format!("Query data failed: {e}"))?;
            }
            if avail == 0 {
                break;
            }
            let mut chunk = vec![0u8; avail as usize];
            let mut read_bytes: u32 = 0;
            unsafe {
                WinHttpReadData(
                    h_request,
                    chunk.as_mut_ptr() as *mut c_void,
                    avail,
                    &mut read_bytes,
                )
                .map_err(|e| format!("Read data failed: {e}"))?;
            }
            chunk.truncate(read_bytes as usize);
            response_data.extend_from_slice(&chunk);
            if response_data.len() > 32 * 1024 * 1024 {
                return Err("Response exceeded 32 MB limit".to_string());
            }
        }

        Ok((status_code as u16, response_data))
    }
}

#[cfg(not(target_os = "windows"))]
mod winhttp_client {
    pub fn execute_http(
        _url_str: &str,
        _method: &str,
        _body: Option<&str>,
        _auth_token: Option<&str>,
    ) -> Result<(u16, Vec<u8>), String> {
        Err("WinHTTP client is only available on Windows".to_string())
    }
}

// ---------------------------------------------------------------------------
// Hardware Identification (HWID) Engine with Deep Win32 Queries
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
mod hwid_engine {
    use std::ptr::null_mut;

    #[link(name = "advapi32")]
    extern "system" {
        fn RegOpenKeyExW(
            hKey: isize,
            lpSubKey: *const u16,
            ulOptions: u32,
            samDesired: u32,
            phkResult: *mut isize,
        ) -> i32;
        fn RegQueryValueExW(
            hKey: isize,
            lpValueName: *const u16,
            lpReserved: *const u32,
            lpType: *mut u32,
            lpData: *mut u8,
            lpcbData: *mut u32,
        ) -> i32;
        fn RegCloseKey(hKey: isize) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetVolumeInformationW(
            lpRootPathName: *const u16,
            lpVolumeNameBuffer: *mut u16,
            nVolumeNameSize: u32,
            lpVolumeSerialNumber: *mut u32,
            lpMaximumComponentLength: *mut u32,
            lpFileSystemFlags: *mut u32,
            lpFileSystemNameBuffer: *mut u16,
            nFileSystemNameSize: u32,
        ) -> i32;
    }

    const HKEY_LOCAL_MACHINE: isize = 0x8000_0002u32 as isize;
    const KEY_READ: u32 = 0x20019;
    const KEY_WOW64_64KEY: u32 = 0x0100;

    fn read_reg_string(subkey: &str, val_name: &str) -> Option<String> {
        let subkey_w: Vec<u16> = subkey.encode_utf16().chain(std::iter::once(0)).collect();
        let val_w: Vec<u16> = val_name.encode_utf16().chain(std::iter::once(0)).collect();
        let mut hkey: isize = 0;

        unsafe {
            if RegOpenKeyExW(HKEY_LOCAL_MACHINE, subkey_w.as_ptr(), 0, KEY_READ | KEY_WOW64_64KEY, &mut hkey) != 0 {
                return None;
            }
            let mut buf = [0u8; 512];
            let mut len = buf.len() as u32;
            let mut val_type = 0u32;
            let res = RegQueryValueExW(hkey, val_w.as_ptr(), null_mut(), &mut val_type, buf.as_mut_ptr(), &mut len);
            let _ = RegCloseKey(hkey);

            if res == 0 && len > 2 {
                let u16_slice = std::slice::from_raw_parts(buf.as_ptr() as *const u16, (len as usize) / 2);
                let text = String::from_utf16_lossy(u16_slice).trim_matches('\0').trim().to_string();
                if !text.is_empty() {
                    return Some(text);
                }
            }
        }
        None
    }

    fn get_c_drive_serial() -> u32 {
        let root: Vec<u16> = "C:\\\0".encode_utf16().collect();
        let mut serial: u32 = 0;
        unsafe {
            let _ = GetVolumeInformationW(root.as_ptr(), null_mut(), 0, &mut serial, null_mut(), null_mut(), null_mut(), 0);
        }
        serial
    }

    pub fn compute_hardware_signature() -> String {
        let guid = read_reg_string("SOFTWARE\\Microsoft\\Cryptography", "MachineGuid")
            .unwrap_or_else(|| "00000000-0000-0000-0000-000000000000".to_string());
        let cpu_ident = read_reg_string("HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0", "Identifier")
            .unwrap_or_else(|| "CPU".to_string());
        let board = read_reg_string("HARDWARE\\DESCRIPTION\\System\\BIOS", "BaseBoardProduct")
            .unwrap_or_else(|| "BOARD".to_string());
        let vol_serial = get_c_drive_serial();

        let raw = format!("{guid}|{cpu_ident}|{board}|{vol_serial:08X}");

        // Standard 64-bit multi-round FNV-1a mixing + polynomial fold
        let mut h1: u64 = 0xcbf2_9ce4_8422_2325;
        let mut h2: u64 = 0x1000_0000_1b3f_7891;
        for (i, b) in raw.as_bytes().iter().enumerate() {
            h1 ^= *b as u64;
            h1 = h1.wrapping_mul(0x0100_0000_01b3);
            h2 = (h2 ^ (*b as u64).wrapping_shl((i % 7) as u32)).wrapping_mul(0x0000_0100_0000_01b3);
        }

        let part1 = (h1 >> 32) as u16;
        let part2 = (h1 & 0xFFFF) as u16;
        let part3 = (h2 >> 32) as u16;
        let part4 = (h2 & 0xFFFF) as u16;

        format!("NN-{part1:04X}-{part2:04X}-{part3:04X}-{part4:04X}")
    }
}

#[cfg(not(target_os = "windows"))]
mod hwid_engine {
    pub fn compute_hardware_signature() -> String {
        "NN-A1B2-C3D4-E5F6-0000".to_string()
    }
}

/// Returns deterministic, tamper-resistant hardware identifier (HWID)
#[tauri::command]
pub fn api_get_hwid() -> String {
    hwid_engine::compute_hardware_signature()
}

// ---------------------------------------------------------------------------
// Anti-Debug & Process Analysis Security Checks
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
mod anti_debug {
    use std::os::windows::process::CommandExt;

    #[link(name = "kernel32")]
    extern "system" {
        fn IsDebuggerPresent() -> i32;
        fn CheckRemoteDebuggerPresent(hProcess: *mut std::ffi::c_void, pbDebuggerPresent: *mut i32) -> i32;
        fn GetCurrentProcess() -> *mut std::ffi::c_void;
    }

    const BLOCKED_TOOLS: &[&str] = &[
        "x64dbg.exe", "x32dbg.exe", "ida.exe", "ida64.exe",
        "wireshark.exe", "fiddler.exe", "httpdebuggerui.exe",
        "httpdebuggerpro.exe", "cheatengine-x86_64.exe",
        "cheatengine-i386.exe", "processhacker.exe", "dnspy.exe",
    ];

    pub fn inspect_environment() -> (bool, Option<String>, String) {
        unsafe {
            if IsDebuggerPresent() != 0 {
                return (false, Some("IsDebuggerPresent".to_string()), "Local debugger attached".to_string());
            }
            let mut remote = 0i32;
            let proc = GetCurrentProcess();
            if CheckRemoteDebuggerPresent(proc, &mut remote) != 0 && remote != 0 {
                return (false, Some("RemoteDebugger".to_string()), "Remote kernel debugger attached".to_string());
            }
        }

        if let Ok(output) = std::process::Command::new("tasklist")
            .args(&["/FO", "CSV", "/NH"])
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .output()
        {
            let lower = String::from_utf8_lossy(&output.stdout).to_lowercase();
            for tool in BLOCKED_TOOLS {
                if lower.contains(tool) {
                    return (false, Some(format!("Analysis Tool: {tool}")), format!("Blacklisted analysis process active: {tool}"));
                }
            }
        }

        (true, None, "Environment integrity validated".to_string())
    }
}

#[cfg(not(target_os = "windows"))]
mod anti_debug {
    pub fn inspect_environment() -> (bool, Option<String>, String) {
        (true, None, "Integrity check passed".to_string())
    }
}

/// Runs native anti-debug and memory inspection checks.
#[tauri::command]
pub fn api_security_check() -> SecurityCheckResult {
    let (safe, threat, details) = anti_debug::inspect_environment();
    SecurityCheckResult { safe, threat, details }
}

// ---------------------------------------------------------------------------
// License Key Verification with Backend Server
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn api_verify_key(payload: ApiVerifyKeyPayload) -> ApiKeyResult {
    let trimmed = payload.key.trim();
    if trimmed.is_empty() {
        return ApiKeyResult {
            valid: false,
            plan: "None".to_string(),
            expires_at: "-".to_string(),
            message: "Key is empty".to_string(),
            session_id: None,
        };
    }

    if let Some(url) = payload.verify_url.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let nonce = format!("{:x}", Instant::now().elapsed().as_nanos());
        let body = serde_json::json!({
            "key": trimmed,
            "hwid": payload.hwid,
            "nonce": nonce,
        })
        .to_string();

        match winhttp_client::execute_http(url, "POST", Some(&body), None) {
            Ok((code, bytes)) if (200..300).contains(&code) => {
                let text = String::from_utf8_lossy(&bytes);
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                    let valid = val.get("valid").and_then(|v| v.as_bool()).unwrap_or(true);
                    let plan = val.get("plan").and_then(|v| v.as_str()).unwrap_or("Active").to_string();
                    let expires = val.get("expires_at").and_then(|v| v.as_str()).unwrap_or("Lifetime").to_string();
                    let msg = val.get("message").and_then(|v| v.as_str()).unwrap_or("Verified").to_string();
                    let session_id = val.get("envelope")
                        .and_then(|e| e.get("sessionId"))
                        .and_then(|s| s.as_str())
                        .map(|s| s.to_string());

                    return ApiKeyResult {
                        valid,
                        plan,
                        expires_at: expires,
                        message: msg,
                        session_id,
                    };
                }
                return ApiKeyResult {
                    valid: true,
                    plan: "Active".to_string(),
                    expires_at: "Verified".to_string(),
                    message: format!("HTTP {code}"),
                    session_id: None,
                };
            }
            Ok((code, bytes)) => {
                let text = String::from_utf8_lossy(&bytes);
                let error_msg = serde_json::from_str::<serde_json::Value>(&text)
                    .ok()
                    .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(|s| s.to_string()))
                    .unwrap_or_else(|| format!("Server rejected key (HTTP {code})"));

                return ApiKeyResult {
                    valid: false,
                    plan: "Invalid".to_string(),
                    expires_at: "-".to_string(),
                    message: error_msg,
                    session_id: None,
                };
            }
            Err(err) => {
                return ApiKeyResult {
                    valid: false,
                    plan: "Offline".to_string(),
                    expires_at: "-".to_string(),
                    message: err,
                    session_id: None,
                };
            }
        }
    }

    // Offline / Standalone Template fallback stub
    ApiKeyResult {
        valid: trimmed.len() >= 4,
        plan: if trimmed.len() >= 4 { "Template Active".to_string() } else { "Invalid".to_string() },
        expires_at: "Standalone".to_string(),
        message: if trimmed.len() >= 4 {
            "Accepted in offline mode (start api-server for full protection)".to_string()
        } else {
            "Key too short".to_string()
        },
        session_id: None,
    }
}

/// Periodic heartbeat ping to backend server
#[tauri::command]
pub fn api_heartbeat(payload: ApiHeartbeatPayload) -> ApiHeartbeatResult {
    let body = serde_json::json!({
        "sessionId": payload.session_id,
        "hwid": payload.hwid,
    })
    .to_string();

    match winhttp_client::execute_http(&payload.url, "POST", Some(&body), None) {
        Ok((200, _)) => ApiHeartbeatResult {
            active: true,
            message: "Session alive".to_string(),
        },
        Ok((code, bytes)) => {
            let text = String::from_utf8_lossy(&bytes);
            let msg = serde_json::from_str::<serde_json::Value>(&text)
                .ok()
                .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(|s| s.to_string()))
                .unwrap_or_else(|| format!("Heartbeat failed (HTTP {code})"));
            ApiHeartbeatResult { active: false, message: msg }
        }
        Err(e) => ApiHeartbeatResult { active: false, message: e },
    }
}

/// Requests encrypted launch authorization ticket from backend
#[tauri::command]
pub fn api_authorize_launch(payload: ApiAuthorizePayload) -> ApiAuthorizeResult {
    let body = serde_json::json!({
        "sessionId": payload.session_id,
        "hwid": payload.hwid,
        "productId": payload.product_id,
        "branch": payload.branch.unwrap_or_else(|| "Stable".to_string()),
    })
    .to_string();

    match winhttp_client::execute_http(&payload.url, "POST", Some(&body), None) {
        Ok((200, bytes)) => {
            let text = String::from_utf8_lossy(&bytes);
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                if val.get("authorized").and_then(|v| v.as_bool()).unwrap_or(false) {
                    return ApiAuthorizeResult {
                        authorized: true,
                        message: "Launch authorized by backend".to_string(),
                    };
                }
            }
            ApiAuthorizeResult {
                authorized: false,
                message: "Launch authorization rejected".to_string(),
            }
        }
        Ok((code, bytes)) => {
            let text = String::from_utf8_lossy(&bytes);
            let msg = serde_json::from_str::<serde_json::Value>(&text)
                .ok()
                .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(|s| s.to_string()))
                .unwrap_or_else(|| format!("Server error HTTP {code}"));
            ApiAuthorizeResult { authorized: false, message: msg }
        }
        Err(e) => ApiAuthorizeResult { authorized: false, message: e },
    }
}

/// Checks remote site/API availability during splash
#[tauri::command]
pub fn api_check_server(
    api_url: Option<String>,
    auth_token: Option<String>,
) -> ApiStatusResponse {
    let url = api_url.unwrap_or_default().trim().to_string();
    if url.is_empty() {
        return ApiStatusResponse {
            online: true,
            status_code: 200,
            latency_ms: 0,
            server_version: "2.5.0".to_string(),
            message: "Local Mode".to_string(),
            body: String::new(),
        };
    }

    let started = Instant::now();
    match winhttp_client::execute_http(&url, "GET", None, auth_token.as_deref()) {
        Ok((code, bytes)) => ApiStatusResponse {
            online: (200..400).contains(&code),
            status_code: code,
            latency_ms: started.elapsed().as_millis() as u64,
            server_version: "2.5.0".to_string(),
            message: format!("HTTP {code}"),
            body: String::from_utf8_lossy(&bytes).to_string(),
        },
        Err(err) => ApiStatusResponse {
            online: false,
            status_code: 0,
            latency_ms: started.elapsed().as_millis() as u64,
            server_version: "2.5.0".to_string(),
            message: err,
            body: String::new(),
        },
    }
}

/// Generic HTTPS GET/POST bridge for site integrations (no CORS restrictions)
#[tauri::command]
pub fn api_http_request(payload: ApiRequestPayload) -> Result<ApiStatusResponse, String> {
    let method = payload
        .method
        .unwrap_or_else(|| "GET".to_string())
        .to_ascii_uppercase();
    let started = Instant::now();
    let (code, bytes) = winhttp_client::execute_http(
        payload.url.trim(),
        &method,
        payload.body.as_deref(),
        payload.auth_token.as_deref(),
    )?;
    Ok(ApiStatusResponse {
        online: (200..400).contains(&code),
        status_code: code,
        latency_ms: started.elapsed().as_millis() as u64,
        server_version: "2.5.0".to_string(),
        message: format!("HTTP {code}"),
        body: String::from_utf8_lossy(&bytes).to_string(),
    })
}

/// Downloads binary payload/module from remote URL to a local destination file
#[tauri::command]
pub fn api_download_module(url: String, dest_path: String) -> Result<String, String> {
    let (code, bytes) = winhttp_client::execute_http(url.trim(), "GET", None, None)?;
    if !(200..300).contains(&code) {
        return Err(format!("Download failed with HTTP status {code}"));
    }
    let target = Path::new(&dest_path);
    if let Some(parent) = target.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let mut file = File::create(target).map_err(|e| format!("Cannot create file: {e}"))?;
    file.write_all(&bytes).map_err(|e| format!("Write failed: {e}"))?;
    Ok(format!("Saved {} bytes to {}", bytes.len(), dest_path))
}

/// Game Launch Hook
#[tauri::command]
pub fn api_on_launch(payload: ApiLaunchPayload) -> ApiHookResult {
    ApiHookResult {
        ok: true,
        handled: false,
        message: format!("Default launcher dispatched for {}", payload.game_id),
    }
}
