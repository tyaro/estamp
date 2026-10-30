use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    Emitter, PhysicalPosition, PhysicalSize,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Geometry {
    pub position: PhysicalPosition<i32>,
    pub size: PhysicalSize<u32>, // client area; position is the outer frame
}

#[derive(Default)]
pub struct SettingsWindow(pub Mutex<Option<Geometry>>);

// Use physical coordinates throughout, including negative monitor origins and
// taskbar/titlebar space. Width remains the original 250 logical pixels.
pub fn expanded_geometry(
    original: Geometry,
    outer: PhysicalSize<u32>,
    work_position: PhysicalPosition<i32>,
    work_size: PhysicalSize<u32>,
    scale: f64,
) -> Geometry {
    let chrome = outer.height.saturating_sub(original.size.height);
    let height =
        ((560.0 * scale).round() as u32).min(work_size.height.saturating_sub(chrome).max(1));
    let frame_height = height.saturating_add(chrome);
    let bottom = i64::from(work_position.y) + i64::from(work_size.height);
    let y = i64::from(original.position.y)
        .min(bottom - i64::from(frame_height))
        .max(i64::from(work_position.y));
    // Also handle a window dragged partly beyond the left/right work-area edge.
    let rightmost = (i64::from(work_position.x) + i64::from(work_size.width)
        - i64::from(outer.width))
    .max(i64::from(work_position.x));
    let x = i64::from(original.position.x).clamp(i64::from(work_position.x), rightmost);
    Geometry {
        position: PhysicalPosition::new(x as i32, y as i32),
        size: PhysicalSize::new(original.size.width, height),
    }
}

pub fn menu_entries(open: bool) -> [(&'static str, &'static str); 5] {
    [
        (
            "settings",
            if open {
                "設定を閉じる（Alt+S）"
            } else {
                "設定を開く（Alt+S）"
            },
        ),
        ("copy", "印影をコピー"),
        ("today", "今日の日付に戻す"),
        ("about", "estampについて"),
        ("quit", "終了"),
    ]
}

#[tauri::command]
pub fn show_settings_menu(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, SettingsWindow>,
    keyboard: bool,
) -> Result<(), String> {
    super::require_main(window.label())?;
    let open = state.0.lock().map_err(|e| e.to_string())?.is_some();
    let menu = Menu::new(&window).map_err(|e| e.to_string())?;
    for (id, text) in menu_entries(open) {
        // Alt+S is handled in the WebView; no second native accelerator handler.
        let item =
            MenuItem::with_id(&window, id, text, true, None::<&str>).map_err(|e| e.to_string())?;
        menu.append(&item).map_err(|e| e.to_string())?;
    }
    if keyboard {
        // Keyboard invocation must work even when the pointer is outside the app.
        window.popup_menu_at(&menu, tauri::LogicalPosition::new(16.0, 16.0))
    } else {
        window.popup_menu(&menu)
    }
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_settings_expanded(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, SettingsWindow>,
    expanded: bool,
) -> Result<(), String> {
    super::require_main(window.label())?;
    // A native popup can leave keyboard focus outside the browser content.
    // WebviewWindow::set_focus only focuses the outer window in Tauri 2.12.2;
    // explicitly focus its Webview too, before JS focuses the heading/seal.
    window.set_focus().map_err(|e| e.to_string())?;
    window.as_ref().set_focus().map_err(|e| e.to_string())?;
    let mut saved = state.0.lock().map_err(|e| e.to_string())?;
    if expanded && saved.is_none() {
        let original = Geometry {
            position: window.outer_position().map_err(|e| e.to_string())?,
            size: window.inner_size().map_err(|e| e.to_string())?,
        };
        let monitor = window
            .current_monitor()
            .map_err(|e| e.to_string())?
            .ok_or("現在のモニターを取得できません")?;
        let work = monitor.work_area();
        let target = expanded_geometry(
            original,
            window.outer_size().map_err(|e| e.to_string())?,
            work.position,
            work.size,
            window.scale_factor().map_err(|e| e.to_string())?,
        );
        window
            .set_position(target.position)
            .map_err(|e| e.to_string())?;
        if let Err(error) = window.set_size(target.size) {
            let _ = window.set_position(original.position);
            return Err(error.to_string());
        }
        *saved = Some(original);
    } else if !expanded {
        if let Some(original) = *saved {
            // Restore the monitor/position before the physical client size,
            // so a DPI change during the move cannot rescale the restored size.
            window
                .set_position(original.position)
                .map_err(|e| e.to_string())?;
            window.set_size(original.size).map_err(|e| e.to_string())?;
            *saved = None;
        }
    }
    Ok(())
}

pub fn menu_event(app: &tauri::AppHandle, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        "quit" => app.exit(0),
        action @ ("settings" | "copy" | "today" | "about") => {
            let _ = app.emit_to("main", "settings-menu-action", action);
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn geometry(x: i32, y: i32, width: u32, height: u32) -> Geometry {
        Geometry {
            position: PhysicalPosition::new(x, y),
            size: PhysicalSize::new(width, height),
        }
    }
    #[test]
    fn native_menu_items_and_order() {
        assert_eq!(
            menu_entries(false),
            [
                ("settings", "設定を開く（Alt+S）"),
                ("copy", "印影をコピー"),
                ("today", "今日の日付に戻す"),
                ("about", "estampについて"),
                ("quit", "終了")
            ]
        );
        assert_eq!(menu_entries(true)[0], ("settings", "設定を閉じる（Alt+S）"));
    }
    #[test]
    fn expands_down_then_moves_up_then_shrinks_with_decorations() {
        let work = PhysicalPosition::new(0, 40);
        let area = PhysicalSize::new(1920, 1000);
        let original = geometry(100, 100, 250, 120);
        let outer = PhysicalSize::new(266, 159);
        assert_eq!(
            expanded_geometry(original, outer, work, area, 1.0),
            geometry(100, 100, 250, 560)
        );
        assert_eq!(
            expanded_geometry(geometry(100, 950, 250, 120), outer, work, area, 1.0),
            geometry(100, 441, 250, 560)
        );
        assert_eq!(
            expanded_geometry(original, outer, work, PhysicalSize::new(1920, 400), 1.0),
            geometry(100, 40, 250, 361)
        );
        // Even a work area below 120px does not retain a minimum client height.
        assert_eq!(
            expanded_geometry(original, outer, work, PhysicalSize::new(1920, 100), 1.0)
                .size
                .height,
            61
        );
    }
    #[test]
    fn negative_monitor_origins_and_dpi() {
        for scale in [1.0, 1.5, 2.0] {
            let width = (250.0 * scale) as u32;
            let chrome = (40.0 * scale) as u32;
            let original = geometry(-1900, -300, width, (120.0 * scale) as u32);
            let result = expanded_geometry(
                original,
                PhysicalSize::new(width + 16, original.size.height + chrome),
                PhysicalPosition::new(-1920, -900),
                PhysicalSize::new(1920, 900),
                scale,
            );
            assert_eq!(result.size.width, width);
            assert_eq!(
                result.size.height,
                ((560.0 * scale) as u32).min(900 - chrome)
            );
            assert!(result.position.y >= -900);
            assert!(i64::from(result.position.y) + i64::from(result.size.height + chrome) <= 0);
        }
    }
    #[test]
    fn horizontal_edges_preserve_width() {
        let result = expanded_geometry(
            geometry(1900, 10, 250, 120),
            PhysicalSize::new(266, 159),
            PhysicalPosition::new(0, 0),
            PhysicalSize::new(1920, 1080),
            1.0,
        );
        assert_eq!(result.position.x, 1654);
        assert_eq!(result.size.width, 250);
    }
}
