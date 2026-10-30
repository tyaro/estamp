// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod settings;
mod settings_window;

use settings::{LoadedSettings, Settings, SettingsStore};
use settings_window::{set_settings_expanded, show_settings_menu, SettingsWindow};
use std::sync::Mutex;
use tauri::Manager;

#[derive(Default)]
struct Startup(Mutex<bool>);

fn require_main(label: &str) -> Result<(), String> {
    if label == "main" {
        Ok(())
    } else {
        Err("この操作はメインウィンドウからのみ実行できます".into())
    }
}

// Defense in depth: the ACL also restricts every custom command to local main.
// The injected window is supplied by Tauri, never by a caller's JSON arguments.
fn local_navigation(url: &tauri::Url, development: bool) -> bool {
    let origin = url.origin().ascii_serialization();
    (url.scheme() == "tauri" && url.host_str() == Some("localhost") && url.port().is_none())
        || origin == "http://tauri.localhost"
        || (development && origin == "http://localhost:1420")
}

fn settings_store(app: &tauri::AppHandle) -> Result<SettingsStore, String> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("設定の保存先を取得できません：{error}"))?;
    Ok(SettingsStore::new(directory))
}

#[tauri::command]
fn load(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    startup: tauri::State<'_, Startup>,
) -> Result<LoadedSettings, String> {
    require_main(window.label())?;
    let mut counted = startup.0.lock().map_err(|e| e.to_string())?;
    let result = settings_store(&app)?.load_session(!*counted)?;
    *counted = true;
    Ok(result)
}

#[tauri::command]
fn save(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    config: Settings,
    revision: Option<String>,
) -> Result<String, String> {
    require_main(window.label())?;
    settings_store(&app)?.save(&config, revision.as_deref())
}

fn legacy_path() -> Result<std::path::PathBuf, String> {
    // Review scope: executable-adjacent file only, independent of shortcut/development CWD.
    let executable = std::env::current_exe()
        .map_err(|error| format!("旧設定の場所を取得できません：{error}"))?;
    let directory = executable
        .parent()
        .ok_or("実行ファイルの場所を取得できません")?;
    Ok(directory.join("Setting.json"))
}

#[tauri::command]
fn legacy_available(window: tauri::WebviewWindow) -> Result<bool, String> {
    require_main(window.label())?;
    settings::legacy_available(&legacy_path()?)
}

#[tauri::command]
fn import_legacy(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    revision: Option<String>,
) -> Result<LoadedSettings, String> {
    require_main(window.label())?;
    settings_store(&app)?.import_legacy(&legacy_path()?, revision.as_deref())
}

// Both the frontend and native build must explicitly opt into measurement.
// No text, dates, settings or caller-selected file paths cross this command.
#[cfg(pr05_measure)]
struct Pr05Clock(std::time::Instant);

#[cfg(pr05_measure)]
#[tauri::command]
fn pr05_measure(window: tauri::WebviewWindow, clock: tauri::State<'_, Pr05Clock>, event: String, ms: f64) -> Result<(), String> {
    require_main(window.label())?;
    if !matches!(event.as_str(), "first-window-paint" | "fonts-ready" | "first-stamp-render")
        || !ms.is_finite() || !(0.0..=3_600_000.0).contains(&ms)
    {
        return Err("不正な計測値です".into());
    }
    let path = std::env::var_os("ESTAMP_PR05_METRICS").ok_or("計測先がありません")?;
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new().create(true).append(true).open(path)
        .map_err(|e| e.to_string())?;
    writeln!(file, "{event},{ms:.3},{:.3}", clock.0.elapsed().as_secs_f64() * 1000.0).map_err(|e| e.to_string())
}

fn main() {
    let builder = tauri::Builder::default()
        .manage(SettingsWindow::default())
        .manage(Startup::default())
        .on_menu_event(settings_window::menu_event)
        .plugin(tauri::plugin::Builder::<tauri::Wry>::new("local-navigation")
            .on_navigation(|_, url| local_navigation(url, cfg!(dev)))
            .build())
        .plugin(tauri_plugin_clipboard_manager::init());
    #[cfg(not(pr05_measure))]
    let builder = builder.invoke_handler(tauri::generate_handler![save, load, import_legacy, legacy_available, show_settings_menu, set_settings_expanded]);
    #[cfg(pr05_measure)]
    let builder = builder
        .manage(Pr05Clock(std::time::Instant::now()))
        .setup(|app| {
            // Fixed, local-main-only grant exists only in the opt-in native build.
            app.add_capability(r#"{
                "identifier":"pr05-measurement", "local":true, "windows":["main"],
                "permissions":["allow-pr05-measure"]
            }"#)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save,
            load,
            import_legacy,
            legacy_available,
            pr05_measure,
            show_settings_menu,
            set_settings_expanded
        ]);
    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod access_tests {
    use super::*;

    #[test]
    fn only_the_exact_main_label_is_allowed() {
        assert!(require_main("main").is_ok());
        for label in ["", "settings", "main-child", "MAIN", "*"] {
            assert!(require_main(label).is_err());
        }
    }

    #[test]
    fn settings_commands_and_event_permissions_are_local_main_only() {
        let capability: serde_json::Value = serde_json::from_str(include_str!("../capabilities/main-window.json")).unwrap();
        assert_eq!(capability["local"], true);
        assert_eq!(capability["windows"], serde_json::json!(["main"]));
        assert!(capability.get("remote").is_none());
        let permissions = capability["permissions"].as_array().unwrap();
        for permission in ["allow-show-settings-menu", "allow-set-settings-expanded", "core:event:allow-listen", "core:event:allow-unlisten"] {
            assert!(permissions.contains(&serde_json::json!(permission)));
        }
        assert!(!permissions.iter().any(|p| p.as_str().unwrap().starts_with("core:window:") || p.as_str().unwrap().starts_with("core:menu:")));
    }

    #[test]
    fn navigation_accepts_only_app_origins_and_the_exact_dev_origin() {
        for url in ["tauri://localhost/", "http://tauri.localhost/index.html"] {
            assert!(local_navigation(&url.parse().unwrap(), false));
        }
        let dev = "http://localhost:1420/".parse().unwrap();
        assert!(local_navigation(&dev, true));
        assert!(!local_navigation(&dev, false));
        for url in ["https://example.com/", "http://tauri.localhost.evil/", "http://localhost:1421/", "file:///tmp/index.html", "data:text/html,test", "about:blank"] {
            assert!(!local_navigation(&url.parse().unwrap(), false), "{url}");
        }
    }
}
