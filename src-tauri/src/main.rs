// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use svg::Document;
use svg::node::element::Path;
use svg::node::element::path::Data;



// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn greet(name: &str) -> String {
    let data = Data::new()
    .move_to((10, 10))
    .line_by((0, 50))
    .line_by((50, 0))
    .line_by((0, -50))
    .close();

    let path = Path::new()
        .set("fill", "none")
        .set("stroke", "black")
        .set("stroke-width", 3)
        .set("d", data);

   let document = Document::new()
        .set("viewBox", (0, 0, 70, 70))
        .add(path);

    document.to_string()
    // svg::save("image.svg", &document).unwrap();

    // format!("Hello, {}! You've been greeted from Rust!", name)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            greet
        ])
        .plugin(tauri_plugin_clipboard::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
