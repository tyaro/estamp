fn main() {
    println!("cargo:rerun-if-env-changed=ESTAMP_PR05_MEASURE");
    println!("cargo:rustc-check-cfg=cfg(pr05_measure)");
    if std::env::var("ESTAMP_PR05_MEASURE").as_deref() == Ok("1") {
        println!("cargo:rustc-cfg=pr05_measure");
    }
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "load", "save", "legacy_available", "import_legacy", "pr05_measure",
        ]),
    ))
    .expect("Tauri のビルド設定を生成できません");
}
