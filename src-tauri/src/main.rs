// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

#[derive(Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum DateMode {
    #[default]
    Auto,
    Manual,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum DateFormat {
    #[default]
    Gregorian,
    Wareki,
}

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
struct Settings {
    top_str: String,
    top_font_size: u32,
    mid_font_size: u32,
    btm_str: String,
    btm_font_size: u32,
    output_size: u32,
    #[serde(default)]
    date_mode: DateMode,
    #[serde(default)]
    date_format: DateFormat,
    #[serde(default)]
    manual_date: Option<String>,
}

#[tauri::command]
fn save(config: Settings) -> Result<String, String> {
    save_to_path(&config, Path::new("Setting.json"))
}

fn save_to_path(config: &Settings, path: &Path) -> Result<String, String> {
    let toml = serde_json::to_string(config).unwrap();
    let file = File::create(path);
    match file {
        Err(e) => Err(format!("error:{:?}", e)),
        Ok(mut v) => {
            let _ = write!(v, "{}", toml);
            let _ = v.flush();
            Ok("success".to_string())
        }
    }
}

#[tauri::command]
fn load() -> Result<Settings, String> {
    load_from_path(Path::new("Setting.json"))
}

fn load_from_path(path: &Path) -> Result<Settings, String> {
    let s = fs::read_to_string(path);
    match s {
        Err(e) => Err(e.to_string()),
        Ok(v) => match serde_json::from_str(&v) {
            Err(e) => Err(e.to_string()),
            Ok(settings) => Ok(settings),
        },
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save, load])
        .plugin(tauri_plugin_clipboard_manager::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir()
                .join(format!("estamp-settings-{}-{nonce}", std::process::id()));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn legacy_settings_default_to_automatic_gregorian() {
        let legacy = r#"{
            "top_str": "所属", "top_font_size": 80, "mid_font_size": 60,
            "btm_str": "名前", "btm_font_size": 80, "output_size": 100
        }"#;
        let settings: Settings = serde_json::from_str(legacy).unwrap();
        assert_eq!(settings.date_mode, DateMode::Auto);
        assert_eq!(settings.date_format, DateFormat::Gregorian);
        assert_eq!(settings.manual_date, None);
    }

    #[test]
    fn settings_save_load_round_trip() {
        let directory = TestDirectory::new();
        let path = directory.0.join("Setting.json");
        let expected = Settings {
            top_str: "品質・デバッグ部\n\"確認\"".to_string(),
            top_font_size: 17,
            mid_font_size: 23,
            btm_str: "山田\\太郎".to_string(),
            btm_font_size: 19,
            output_size: 512,
            date_mode: DateMode::Manual,
            date_format: DateFormat::Wareki,
            manual_date: Some("2019-05-01".to_string()),
        };

        assert_eq!(save_to_path(&expected, &path).unwrap(), "success");
        let restored = load_from_path(&path).unwrap();
        assert_eq!(restored, expected);
    }
}
