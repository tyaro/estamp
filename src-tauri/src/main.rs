// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod settings;

use settings::{LoadedSettings, Settings, SettingsStore};
use tauri::Manager;

fn settings_store(app: &tauri::AppHandle) -> Result<SettingsStore, String> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("設定の保存先を取得できません：{error}"))?;
    Ok(SettingsStore::new(directory))
}

#[tauri::command]
fn load(app: tauri::AppHandle) -> Result<LoadedSettings, String> {
    settings_store(&app)?.load()
}

#[tauri::command]
fn save(
    app: tauri::AppHandle,
    config: Settings,
    revision: Option<String>,
) -> Result<String, String> {
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
fn legacy_available() -> Result<bool, String> {
    settings::legacy_available(&legacy_path()?)
}

#[tauri::command]
fn import_legacy(
    app: tauri::AppHandle,
    revision: Option<String>,
) -> Result<LoadedSettings, String> {
    settings_store(&app)?.import_legacy(&legacy_path()?, revision.as_deref())
}

// Both the frontend and native build must explicitly opt into measurement.
// No text, dates, settings or caller-selected file paths cross this command.
struct Pr05Clock(std::time::Instant);

#[tauri::command]
fn pr05_measure(clock: tauri::State<'_, Pr05Clock>, event: String, ms: f64) -> Result<(), String> {
    if option_env!("ESTAMP_PR05_MEASURE") != Some("1") {
        return Err("計測用ビルドではありません".into());
    }
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
    let measurement_clock = Pr05Clock(std::time::Instant::now());
    tauri::Builder::default()
        .manage(measurement_clock)
        .invoke_handler(tauri::generate_handler![
            save,
            load,
            import_legacy,
            legacy_available,
            pr05_measure
        ])
        .plugin(tauri_plugin_clipboard_manager::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
