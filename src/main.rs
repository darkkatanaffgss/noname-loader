#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Manager, PhysicalPosition, WindowEvent};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const DOCK_GAP: f64 = 8.0;

static IS_SYNCING_POS: AtomicBool = AtomicBool::new(false);
static IS_MAIN_VISIBLE: AtomicBool = AtomicBool::new(false);
static IS_RAISING: AtomicBool = AtomicBool::new(false);
static SAVED_MAIN_POS: Mutex<Option<(i32, i32)>> = Mutex::new(None);

#[derive(Serialize, Deserialize, Clone, Copy)]
struct WindowStateFile {
    x: i32,
    y: i32,
}

#[derive(Serialize)]
struct LaunchResult {
    launched: bool,
    message: String,
}

#[cfg(target_os = "windows")]
#[link(name = "dwmapi")]
extern "system" {
    fn DwmSetWindowAttribute(
        hwnd: isize,
        dw_attribute: u32,
        pv_attribute: *const u32,
        cb_attribute: u32,
    ) -> i32;
}

#[cfg(target_os = "windows")]
#[link(name = "user32")]
extern "system" {
    fn SetWindowPos(
        hwnd: isize,
        hwnd_insert_after: isize,
        x: i32,
        y: i32,
        cx: i32,
        cy: i32,
        flags: u32,
    ) -> i32;
}

fn state_file_path() -> PathBuf {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    base.join("AetherLoader").join("window_state.json")
}

fn load_window_state() -> Option<WindowStateFile> {
    let raw = fs::read_to_string(state_file_path()).ok()?;
    serde_json::from_str(&raw).ok()
}

fn persist_window_state(x: i32, y: i32) {
    let path = state_file_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string(&WindowStateFile { x, y }) {
        let _ = fs::write(path, json);
    }
}

fn store_main_pos(x: i32, y: i32) {
    if let Ok(mut guard) = SAVED_MAIN_POS.lock() {
        *guard = Some((x, y));
    }
}

fn get_stored_main_pos() -> Option<(i32, i32)> {
    SAVED_MAIN_POS.lock().ok().and_then(|g| *g)
}

#[cfg(target_os = "windows")]
fn apply_native_glass(window: &tauri::WebviewWindow) {
    if let Ok(hwnd) = window.hwnd() {
        let pref: u32 = 2; // DWMWCP_ROUND
        unsafe {
            let _ = DwmSetWindowAttribute(hwnd.0 as isize, 33, &pref, std::mem::size_of::<u32>() as u32);
        }
    }
    if window_vibrancy::apply_acrylic(window, Some((13, 16, 24, 96))).is_err() {
        let _ = window_vibrancy::apply_blur(window, Some((13, 16, 24, 130)));
    }
}

#[cfg(not(target_os = "windows"))]
fn apply_native_glass(_window: &tauri::WebviewWindow) {}

#[cfg(target_os = "windows")]
fn bring_window_no_activate(window: &tauri::WebviewWindow) {
    const HWND_TOP: isize = 0;
    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOMOVE: u32 = 0x0002;
    const SWP_NOACTIVATE: u32 = 0x0010;
    if let Ok(hwnd) = window.hwnd() {
        unsafe {
            let _ = SetWindowPos(
                hwnd.0 as isize,
                HWND_TOP,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            );
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn bring_window_no_activate(_window: &tauri::WebviewWindow) {}

fn raise_pair(app: &tauri::AppHandle, focused_label: &str) {
    if IS_RAISING.swap(true, Ordering::SeqCst) {
        return;
    }
    if let (Some(main), Some(dock)) = (app.get_webview_window("main"), app.get_webview_window("dock")) {
        sync_dock_below_main(app);
        let _ = dock.show();
        if focused_label == "main" {
            bring_window_no_activate(&dock);
            bring_window_no_activate(&main);
        } else {
            bring_window_no_activate(&main);
            bring_window_no_activate(&dock);
        }
    }
    IS_RAISING.store(false, Ordering::SeqCst);
}

fn sync_dock_below_main(app: &tauri::AppHandle) {
    if IS_SYNCING_POS.swap(true, Ordering::SeqCst) {
        return;
    }
    if let (Some(main), Some(dock)) = (app.get_webview_window("main"), app.get_webview_window("dock")) {
        if let (Ok(pos), Ok(size), Ok(scale)) = (main.outer_position(), main.outer_size(), main.scale_factor()) {
            let gap = (DOCK_GAP * scale).round() as i32;
            let _ = dock.set_position(PhysicalPosition::new(pos.x, pos.y + size.height as i32 + gap));
        }
    }
    IS_SYNCING_POS.store(false, Ordering::SeqCst);
}

fn sync_main_above_dock(app: &tauri::AppHandle) {
    if IS_SYNCING_POS.swap(true, Ordering::SeqCst) {
        return;
    }
    if let (Some(main), Some(dock)) = (app.get_webview_window("main"), app.get_webview_window("dock")) {
        if let (Ok(pos), Ok(main_size), Ok(scale)) = (dock.outer_position(), main.outer_size(), main.scale_factor()) {
            let gap = (DOCK_GAP * scale).round() as i32;
            let new_x = pos.x;
            let new_y = pos.y - main_size.height as i32 - gap;
            let _ = main.set_position(PhysicalPosition::new(new_x, new_y));
            store_main_pos(new_x, new_y);
        }
    }
    IS_SYNCING_POS.store(false, Ordering::SeqCst);
}

fn place_splash_over_main(splash: &tauri::WebviewWindow, main: &tauri::WebviewWindow, main_x: i32, main_y: i32) {
    if let (Ok(main_size), Ok(splash_size)) = (main.outer_size(), splash.outer_size()) {
        let cx = main_x + (main_size.width as i32) / 2;
        let cy = main_y + (main_size.height as i32) / 2;
        let sx = cx - (splash_size.width as i32) / 2;
        let sy = cy - (splash_size.height as i32) / 2;
        let _ = splash.set_position(PhysicalPosition::new(sx, sy));
    }
}

#[tauri::command]
fn transition_to_main(app: tauri::AppHandle) {
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.hide();
    }
    if let Some(main) = app.get_webview_window("main") {
        if let Some((saved_x, saved_y)) = get_stored_main_pos() {
            let _ = main.set_position(PhysicalPosition::new(saved_x, saved_y));
        } else {
            let _ = main.center();
            if let (Ok(pos), Ok(scale)) = (main.outer_position(), main.scale_factor()) {
                let x = pos.x;
                let y = pos.y - (26.0 * scale).round() as i32;
                let _ = main.set_position(PhysicalPosition::new(x, y));
                store_main_pos(x, y);
                persist_window_state(x, y);
            }
        }
        IS_MAIN_VISIBLE.store(true, Ordering::SeqCst);
        sync_dock_below_main(&app);
        let _ = main.show();
        let _ = main.set_focus();
        if let Some(dock) = app.get_webview_window("dock") {
            let _ = dock.show();
            bring_window_no_activate(&dock);
            bring_window_no_activate(&main);
        }
        let _ = app.emit("main-enter", ());
    }
}

#[tauri::command]
fn replay_intro(app: tauri::AppHandle) {
    IS_MAIN_VISIBLE.store(false, Ordering::SeqCst);
    if let Some(main) = app.get_webview_window("main") {
        if let Ok(pos) = main.outer_position() {
            store_main_pos(pos.x, pos.y);
            persist_window_state(pos.x, pos.y);
        }
        if let Some(splash) = app.get_webview_window("splash") {
            let (mx, my) = get_stored_main_pos().unwrap_or((0, 0));
            place_splash_over_main(&splash, &main, mx, my);
            let _ = splash.show();
            let _ = splash.set_focus();
        }
        let _ = main.hide();
    }
    if let Some(dock) = app.get_webview_window("dock") {
        let _ = dock.hide();
    }
    let _ = app.emit("splash-restart", ());
}

#[tauri::command]
fn dock_switch_view(app: tauri::AppHandle, view: String) {
    let _ = app.emit("switch-view", view);
}

#[tauri::command]
fn sync_ui_state(app: tauri::AppHandle, payload: serde_json::Value) {
    let _ = app.emit("ui-state-sync", payload);
}

#[tauri::command]
fn launch_game(target: String) -> Result<LaunchResult, String> {
    let trimmed = target.trim();
    if trimmed.is_empty() {
        return Err("Launch target is empty".to_string());
    }

    let is_uri = trimmed.starts_with("steam://")
        || trimmed.starts_with("minecraft://")
        || trimmed.starts_with("https://")
        || trimmed.starts_with("http://");

    if !is_uri && !Path::new(trimmed).exists() {
        return Ok(LaunchResult {
            launched: false,
            message: format!("Target not found: {trimmed}"),
        });
    }

    #[cfg(target_os = "windows")]
    {
        if is_uri {
            Command::new("cmd")
                .args(["/C", "start", "", trimmed])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| format!("Failed to open URI: {e}"))?;
        } else {
            let mut cmd = Command::new(trimmed);
            if let Some(parent) = Path::new(trimmed).parent() {
                cmd.current_dir(parent);
            }
            cmd.spawn()
                .map_err(|e| format!("Failed to start executable: {e}"))?;
        }
    }

    Ok(LaunchResult {
        launched: true,
        message: format!("Launched {trimmed}"),
    })
}

#[tauri::command]
fn minimize_all(app: tauri::AppHandle) {
    if let Some((x, y)) = get_stored_main_pos() {
        persist_window_state(x, y);
    }
    if let Some(dock) = app.get_webview_window("dock") {
        let _ = dock.hide();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.minimize();
    }
}

#[tauri::command]
fn close_all(app: tauri::AppHandle) {
    if let Some((x, y)) = get_stored_main_pos() {
        persist_window_state(x, y);
    }
    app.exit(0);
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            for label in ["splash", "main", "dock"] {
                if let Some(win) = app.get_webview_window(label) {
                    apply_native_glass(&win);
                }
            }

            if let Some(saved) = load_window_state() {
                store_main_pos(saved.x, saved.y);
                if let (Some(splash), Some(main)) = (
                    app.get_webview_window("splash"),
                    app.get_webview_window("main"),
                ) {
                    place_splash_over_main(&splash, &main, saved.x, saved.y);
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            let label = window.label();
            let app = window.app_handle();
            match event {
                WindowEvent::Moved(pos) => {
                    if IS_MAIN_VISIBLE.load(Ordering::SeqCst) {
                        if label == "main" {
                            store_main_pos(pos.x, pos.y);
                            sync_dock_below_main(app);
                        } else if label == "dock" {
                            sync_main_above_dock(app);
                        }
                    } else if label == "splash" {
                        if let (Some(splash), Some(main)) = (
                            app.get_webview_window("splash"),
                            app.get_webview_window("main"),
                        ) {
                            if let (Ok(ss), Ok(ms)) = (splash.outer_size(), main.outer_size()) {
                                let mx = pos.x + (ss.width as i32) / 2 - (ms.width as i32) / 2;
                                let my = pos.y + (ss.height as i32) / 2 - (ms.height as i32) / 2;
                                store_main_pos(mx, my);
                            }
                        }
                    }
                }
                WindowEvent::Focused(true) => {
                    if IS_MAIN_VISIBLE.load(Ordering::SeqCst) && (label == "main" || label == "dock") {
                        raise_pair(app, label);
                    }
                }
                WindowEvent::CloseRequested { .. } => {
                    if let Some((x, y)) = get_stored_main_pos() {
                        persist_window_state(x, y);
                    }
                    app.exit(0);
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            transition_to_main,
            replay_intro,
            dock_switch_view,
            sync_ui_state,
            launch_game,
            minimize_all,
            close_all,
            api::api_get_hwid,
            api::api_verify_key,
            api::api_check_server,
            api::api_http_request,
            api::api_download_module,
            api::api_on_launch
        ])
        .run(tauri::generate_context!())
        .expect("error while running Aether Loader");
}
