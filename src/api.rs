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
}

#[derive(Deserialize)]
pub struct ApiLaunchPayload {
    pub game_id: String,
    pub target: String,
    pub key: Option<String>,
    pub hwid: Option<String>,
}

#[derive(Serialize)]
pub struct ApiHookResult {
    pub ok: bool,
    pub handled: bool,
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

        let agent = to_wide("AetherLoader/2.4");
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

/// Returns a deterministic hardware identifier (HWID) for license key binding.
#[tauri::command]
pub fn api_get_hwid() -> String {
    let host = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "PC".to_string());
    let user = std::env::var("USERNAME").unwrap_or_else(|_| "USER".to_string());
    let procs = std::env::var("NUMBER_OF_PROCESSORS").unwrap_or_else(|_| "4".to_string());
    let seed = format!("{host}:{user}:{procs}");
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for b in seed.as_bytes() {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x0100_0000_01b3);
    }
    format!("AE-{:08X}-{:04X}", (hash >> 32) as u32, (hash & 0xFFFF) as u16)
}

/// Developer License Key Verification Hook.
/// If `verify_url` is provided (from `ui/config.js`), sends `{ key, hwid }` via POST.
/// Otherwise runs as an empty template stub ready for your custom validation logic.
#[tauri::command]
pub fn api_verify_key(payload: ApiVerifyKeyPayload) -> ApiKeyResult {
    let trimmed = payload.key.trim();
    if trimmed.is_empty() {
        return ApiKeyResult {
            valid: false,
            plan: "None".to_string(),
            expires_at: "-".to_string(),
            message: "Key is empty".to_string(),
        };
    }

    if let Some(url) = payload.verify_url.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        let body = serde_json::json!({
            "key": trimmed,
            "hwid": payload.hwid,
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
                    return ApiKeyResult { valid, plan, expires_at: expires, message: msg };
                }
                return ApiKeyResult {
                    valid: true,
                    plan: "Active".to_string(),
                    expires_at: "Server Verified".to_string(),
                    message: format!("HTTP {code}"),
                };
            }
            Ok((code, _)) => {
                return ApiKeyResult {
                    valid: false,
                    plan: "Invalid".to_string(),
                    expires_at: "-".to_string(),
                    message: format!("Server rejected key (HTTP {code})"),
                };
            }
            Err(err) => {
                return ApiKeyResult {
                    valid: false,
                    plan: "Offline".to_string(),
                    expires_at: "-".to_string(),
                    message: err,
                };
            }
        }
    }

    // Empty template stub: replace with your own local or remote key validation
    ApiKeyResult {
        valid: trimmed.len() >= 4,
        plan: if trimmed.len() >= 4 { "Template Active".to_string() } else { "Invalid".to_string() },
        expires_at: "Stub Mode".to_string(),
        message: if trimmed.len() >= 4 {
            "Accepted by template stub (configure verifyUrl in ui/config.js)".to_string()
        } else {
            "Key too short".to_string()
        },
    }
}

/// Checks remote site/API availability during splash.
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
            server_version: "2.4.0".to_string(),
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
            server_version: "2.4.0".to_string(),
            message: format!("HTTP {code}"),
            body: String::from_utf8_lossy(&bytes).to_string(),
        },
        Err(err) => ApiStatusResponse {
            online: false,
            status_code: 0,
            latency_ms: started.elapsed().as_millis() as u64,
            server_version: "2.4.0".to_string(),
            message: err,
            body: String::new(),
        },
    }
}

/// Generic HTTPS GET/POST bridge for site integrations (no CORS restrictions).
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
        server_version: "2.4.0".to_string(),
        message: format!("HTTP {code}"),
        body: String::from_utf8_lossy(&bytes).to_string(),
    })
}

/// Downloads a remote payload/module (e.g. client JAR/DLL/EXE/config) directly to disk.
#[tauri::command]
pub fn api_download_module(
    url: String,
    save_path: String,
    auth_token: Option<String>,
) -> Result<ApiHookResult, String> {
    let (code, bytes) =
        winhttp_client::execute_http(url.trim(), "GET", None, auth_token.as_deref())?;
    if !(200..300).contains(&code) {
        return Err(format!("Download failed with HTTP {code}"));
    }

    let dest = Path::new(&save_path);
    if let Some(parent) = dest.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| format!("Create dir failed: {e}"))?;
        }
    }
    let mut file = File::create(dest).map_err(|e| format!("Create file failed: {e}"))?;
    file.write_all(&bytes)
        .map_err(|e| format!("Write file failed: {e}"))?;

    Ok(ApiHookResult {
        ok: true,
        handled: true,
        message: format!("Saved {} bytes to {}", bytes.len(), dest.display()),
    })
}

/// Pre-launch native hook for developers (empty stub ready for C++ / Minecraft / CS2 payload logic).
#[tauri::command]
pub fn api_on_launch(payload: ApiLaunchPayload) -> ApiHookResult {
    let _ = (&payload.game_id, &payload.target, &payload.key, &payload.hwid);
    ApiHookResult {
        ok: true,
        handled: false,
        message: "Ready".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hwid_is_deterministic_and_formatted() {
        let a = api_get_hwid();
        let b = api_get_hwid();
        assert_eq!(a, b);
        assert!(a.starts_with("AE-"));
    }

    #[test]
    fn verify_key_stub_checks_length() {
        let bad = api_verify_key(ApiVerifyKeyPayload {
            key: "".to_string(),
            hwid: "AE-0000".to_string(),
            verify_url: None,
        });
        assert!(!bad.valid);

        let good = api_verify_key(ApiVerifyKeyPayload {
            key: "AETHER-1234".to_string(),
            hwid: "AE-0000".to_string(),
            verify_url: None,
        });
        assert!(good.valid);
    }
}
