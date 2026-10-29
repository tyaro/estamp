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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            save,
            load,
            import_legacy,
            legacy_available
        ])
        .plugin(tauri_plugin_clipboard_manager::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
