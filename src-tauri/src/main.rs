// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
// use serde_derive::{Serialize, Deserialize};
use std::fs::{self, File};
use std::io::Write;


#[derive(Debug, Serialize, Deserialize)]
struct Settings  {
    top_str:String,
    top_font_size:u32,
    mid_font_size:u32,
    btm_str:String,
    btm_font_size:u32,
    output_size:u32,
}


// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn save(config: Settings) -> Result<String,String> {
    let toml = serde_json::to_string(&config).unwrap();
    let file = File::create("Setting.json");
    match file {
        Err(e) => Err(format!("error:{:?}",e)),
        Ok(mut v) => {
            let _ = write!(v,"{}",toml);
            let _ = v.flush();
            Ok("success".to_string())
        }
    }
}

#[tauri::command]
fn load() -> Result<Settings,String> {
    let s = fs::read_to_string("Setting.json");
    match s {
        Err(e) => Err(e.to_string()),
        Ok(v) => {
            match serde_json::from_str(&v){
                Err(e) => Err(e.to_string()),
                Ok(settings) => Ok(settings)
            }
        }
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            save,
            load,
        ])
        .plugin(tauri_plugin_clipboard::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
