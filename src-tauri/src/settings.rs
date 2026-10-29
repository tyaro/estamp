use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const SCHEMA_VERSION: u32 = 1;

fn schema_version() -> u32 {
    SCHEMA_VERSION
}

// Schema contracts only; date behavior and controls belong to PR-04.
#[derive(Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DateMode {
    #[default]
    Auto,
    Manual,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DateFormat {
    #[default]
    Gregorian,
    Wareki,
}

// Unknown styles use the existing dated-stamp rendering, but retain their wire value.
// Keep this lossless when adding styles; no style control is exposed in this PR.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(from = "String", into = "String")]
pub enum StampType {
    #[default]
    DatedStamp,
    Unknown(String),
}

impl From<String> for StampType {
    fn from(value: String) -> Self {
        match value.as_str() {
            "dated_stamp" => Self::DatedStamp,
            _ => Self::Unknown(value),
        }
    }
}

impl From<StampType> for String {
    fn from(value: StampType) -> Self {
        match value {
            StampType::DatedStamp => "dated_stamp".to_string(),
            StampType::Unknown(value) => value,
        }
    }
}

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    #[serde(default = "schema_version")]
    pub schema_version: u32,
    pub top_str: String,
    pub top_font_size: u32,
    pub mid_font_size: u32,
    pub btm_str: String,
    pub btm_font_size: u32,
    pub output_size: u32,
    #[serde(default)]
    pub date_mode: DateMode,
    #[serde(default)]
    pub date_format: DateFormat,
    #[serde(default)]
    pub manual_date: Option<String>,
    #[serde(default)]
    pub stamp_type: StampType,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            top_str: "所属".to_string(),
            top_font_size: 80,
            mid_font_size: 60,
            btm_str: "名前".to_string(),
            btm_font_size: 80,
            output_size: 100,
            date_mode: DateMode::default(),
            date_format: DateFormat::default(),
            manual_date: None,
            stamp_type: StampType::default(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct LoadedSettings {
    pub settings: Settings,
    // Opaque compare-and-swap token: the previous file contents, or null if absent.
    // Comparing bytes avoids hash collisions and does not require another dependency.
    pub revision: Option<String>,
    pub warning: Option<String>,
}

enum DecodeError {
    Corrupt(String),
    Unsupported(String),
}

impl DecodeError {
    fn message(self) -> String {
        match self {
            Self::Corrupt(message) | Self::Unsupported(message) => message,
        }
    }
}

fn decode(bytes: &[u8]) -> Result<Settings, DecodeError> {
    let json = bytes.strip_prefix(b"\xef\xbb\xbf").unwrap_or(bytes);
    let value: BTreeMap<String, Box<serde_json::value::RawValue>> = serde_json::from_slice(json)
        .map_err(|error| DecodeError::Corrupt(format!("設定の JSON が壊れています：{error}")))?;
    // Check the version before attempting to deserialize fields unknown to this build.
    if let Some(version) = value.get("schema_version") {
        let version: u64 = serde_json::from_str(version.get()).map_err(|_| {
            DecodeError::Corrupt("schema_version は非負の整数で指定してください".to_string())
        })?;
        if version != u64::from(SCHEMA_VERSION) {
            return Err(DecodeError::Unsupported(format!(
                "この設定の schema（{version}）には対応していません。ファイルを変更せず、読込・保存を中止しました。"
            )));
        }
    }
    // Deserialize only known fields. Unknown values never cross the numeric JS boundary.
    serde_json::from_slice(json)
        .map_err(|error| DecodeError::Corrupt(format!("設定の形式が正しくありません：{error}")))
}

pub struct SettingsStore {
    directory: PathBuf,
}

impl SettingsStore {
    pub fn new(directory: PathBuf) -> Self {
        Self { directory }
    }

    fn path(&self) -> PathBuf {
        self.directory.join("Setting.json")
    }

    fn lock(&self) -> Result<File, String> {
        fs::create_dir_all(&self.directory)
            .map_err(|error| format!("設定フォルダーを作成できません：{error}"))?;
        // Keep this lock file in place; removing it could create two independent locks.
        let lock = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(self.directory.join("Setting.lock"))
            .map_err(|error| format!("設定のロックを開けません：{error}"))?;
        retry(
            || lock.try_lock(),
            |error| matches!(error, std::fs::TryLockError::WouldBlock),
        )
        .map_err(|error| {
            format!("設定を使用中です。他の操作が終わってから再試行してください：{error}")
        })?;
        Ok(lock)
    }

    pub fn load(&self) -> Result<LoadedSettings, String> {
        let _lock = self.lock()?;
        let Some(bytes) = read_optional(&self.path())? else {
            return Ok(LoadedSettings {
                settings: Settings::default(),
                revision: None,
                warning: None,
            });
        };
        match decode(&bytes) {
            Ok(settings) => Ok(LoadedSettings {
                settings,
                revision: Some(String::from_utf8(bytes).map_err(|error| error.to_string())?),
                warning: None,
            }),
            Err(DecodeError::Unsupported(message)) => Err(message),
            Err(DecodeError::Corrupt(message)) => {
                let backup = unique_path(&self.directory, "corrupt.json");
                rename_with_retry(&self.path(), &backup).map_err(|error| {
                    format!("{message}。退避できないため読込を中止しました：{error}")
                })?;
                Ok(LoadedSettings {
                    settings: Settings::default(),
                    revision: None,
                    warning: Some(format!(
                        "△ {message}。{} に退避し、既定値を読み込みました。",
                        backup.display()
                    )),
                })
            }
        }
    }

    pub fn save(&self, config: &Settings, revision: Option<&str>) -> Result<String, String> {
        let _lock = self.lock()?;
        self.check_revision(revision)?;
        // The lock and revision comparison above guarantee this is the current file.
        self.write(config, revision)
    }

    fn check_revision(&self, revision: Option<&str>) -> Result<(), String> {
        let current = read_optional(&self.path())?;
        // Import and save both protect unsupported/corrupt destination data.
        if let Some(bytes) = &current {
            decode(bytes).map_err(DecodeError::message)?;
        }
        if current.as_deref() != revision.map(str::as_bytes) {
            return Err("別のウィンドウで設定が更新されました。再読込してから保存してください（編集中の値は再読込で置き換わります）。".to_string());
        }
        Ok(())
    }

    pub fn import_legacy(
        &self,
        source: &Path,
        revision: Option<&str>,
    ) -> Result<LoadedSettings, String> {
        let _lock = self.lock()?;
        self.check_revision(revision)?;
        let bytes = fs::read(source).map_err(|error| {
            format!("実行ファイルと同じフォルダーの旧 Setting.json を読めません：{error}")
        })?;
        let settings = decode(&bytes).map_err(DecodeError::message)?;
        let original = std::str::from_utf8(&bytes).map_err(|error| error.to_string())?;
        let revision = self.write(&settings, Some(original))?;
        Ok(LoadedSettings {
            settings,
            revision: Some(revision),
            warning: None,
        })
    }

    // Caller holds the lock from the read/version check through replacement.
    fn write(&self, config: &Settings, original: Option<&str>) -> Result<String, String> {
        if config.schema_version != SCHEMA_VERSION {
            return Err("対応していない schema の設定は保存できません。".to_string());
        }
        // RawValue preserves each unknown value's original bytes, including large
        // integers, decimal notation, escapes and whitespace inside nested objects.
        // raw_value is a feature of the already locked serde_json, not a new crate.
        let mut fields: BTreeMap<String, Box<serde_json::value::RawValue>> = original
            .map(|json| serde_json::from_str(json.trim_start_matches('\u{feff}')))
            .transpose()
            .map_err(|error| format!("設定を変換できません：{error}"))?
            .unwrap_or_default();
        let known = serde_json::to_string(config)
            .map_err(|error| format!("設定を変換できません：{error}"))?;
        let known: BTreeMap<String, Box<serde_json::value::RawValue>> =
            serde_json::from_str(&known).map_err(|error| error.to_string())?;
        fields.extend(known);
        let json = serde_json::to_string_pretty(&fields)
            .map_err(|error| format!("設定を変換できません：{error}"))?;
        let temporary_path = unique_path(&self.directory, "tmp");
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary_path)
            .map_err(|error| format!("設定の一時ファイルを作成できません：{error}"))?;
        let temporary = TemporaryFile(temporary_path);
        let written = file
            .write_all(json.as_bytes())
            .and_then(|_| file.sync_all());
        // Close before rename, including on Windows. std::fs::rename replaces existing files.
        drop(file);
        written.map_err(|error| format!("設定を書き込めません：{error}"))?;
        rename_with_retry(&temporary.0, &self.path())
            .map_err(|error| format!("設定ファイルを置き換えられません：{error}"))?;
        Ok(json)
    }
}

// Bound synchronous IPC waiting to 300 ms; do not retry permanent failures.
fn retry<T, E>(
    mut operation: impl FnMut() -> Result<T, E>,
    transient: impl Fn(&E) -> bool,
) -> Result<T, E> {
    let deadline = Instant::now() + Duration::from_millis(300);
    loop {
        match operation() {
            Err(error) if transient(&error) && Instant::now() < deadline => {
                thread::sleep(Duration::from_millis(20));
            }
            result => return result,
        }
    }
}

fn rename_with_retry(source: &Path, destination: &Path) -> io::Result<()> {
    retry(
        || fs::rename(source, destination),
        |error| cfg!(windows) && matches!(error.raw_os_error(), Some(5 | 32 | 33)),
    )
}

pub fn legacy_available(source: &Path) -> Result<bool, String> {
    match fs::metadata(source) {
        Ok(metadata) => Ok(metadata.is_file()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!("旧 Setting.json の存在を確認できません：{error}")),
    }
}

fn read_optional(path: &Path) -> Result<Option<Vec<u8>>, String> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("設定ファイルを読み込めません：{error}")),
    }
}

fn unique_path(directory: &Path, suffix: &str) -> PathBuf {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    directory.join(format!(
        "Setting.{}-{time}-{}.{suffix}",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ))
}

struct TemporaryFile(PathBuf);

impl Drop for TemporaryFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LEGACY_JSON: &[u8] = r#"{
        "top_str":"所属", "top_font_size":90, "mid_font_size":60,
        "btm_str":"名前", "btm_font_size":110, "output_size":50
    }"#
    .as_bytes();

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let path = unique_path(&std::env::temp_dir(), "test");
            fs::create_dir(&path).unwrap();
            Self(path)
        }

        fn store(&self) -> SettingsStore {
            SettingsStore::new(self.0.join("config"))
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn unknown_stamp_and_raw_fields_survive_load_ipc_edit_and_save() {
        let directory = TestDirectory::new();
        let store = directory.store();
        fs::create_dir_all(&store.directory).unwrap();
        let original = r#"{"schema_version":1,"stamp_type":"future_角印",
          "future_field":9007199254740993,
          "future_options":{ "nested": [9007199254740993, 123456789012345678901234567890, 1.2300e+40, "\u5024", { "enabled":true }] }}"#;
        fs::write(store.path(), &original).unwrap();
        let loaded = store.load().unwrap();
        assert_eq!(
            loaded.settings.stamp_type,
            StampType::Unknown("future_角印".into())
        );
        assert!(loaded.warning.is_none());
        assert_eq!(fs::read_to_string(store.path()).unwrap(), original);
        // Match the frontend IPC round trip, including its settings snapshot.
        let ipc = serde_json::to_value(&loaded.settings).unwrap();
        assert!(ipc.get("future_field").is_none());
        assert!(ipc.get("future_options").is_none());
        let mut edited: Settings = serde_json::from_value(ipc).unwrap();
        edited.top_str = "編集済み".into();
        let mut revision = loaded.revision.unwrap();
        for _ in 0..2 {
            revision = store.save(&edited, Some(&revision)).unwrap();
            assert_eq!(store.load().unwrap().settings, edited);
            assert_raw_extras_equal(original, &fs::read_to_string(store.path()).unwrap());
        }
        assert_eq!(fs::read_dir(&store.directory).unwrap().count(), 2);
    }

    fn assert_raw_extras_equal(original: &str, saved: &str) {
        let raw = |json: &str| -> BTreeMap<String, Box<serde_json::value::RawValue>> {
            serde_json::from_str(json).unwrap()
        };
        for name in ["future_field", "future_options"] {
            assert_eq!(raw(original)[name].get(), raw(saved)[name].get());
        }
    }

    #[test]
    fn import_preserves_raw_unknown_values_without_exposing_them_to_js() {
        let directory = TestDirectory::new();
        let store = directory.store();
        let source = directory.0.join("Setting.json");
        let original = r#"{"future_field":9007199254740993,"future_options":{ "nested": [9007199254740993, 1.00e+30] }}"#;
        fs::write(&source, original).unwrap();
        let imported = store.import_legacy(&source, None).unwrap();
        let ipc = serde_json::to_value(&imported.settings).unwrap();
        assert!(ipc.get("future_field").is_none());
        let saved = store
            .save(&imported.settings, imported.revision.as_deref())
            .unwrap();
        assert_raw_extras_equal(original, &saved);
        assert_eq!(fs::read_to_string(source).unwrap(), original);
    }

    #[test]
    fn null_and_string_schema_versions_are_quarantined_as_malformed() {
        for version in ["null", "\"1\""] {
            let directory = TestDirectory::new();
            let store = directory.store();
            fs::create_dir_all(&store.directory).unwrap();
            let original = format!(r#"{{"schema_version":{version}}}"#);
            fs::write(store.path(), &original).unwrap();
            let loaded = store.load().unwrap();
            assert_eq!(loaded.settings, Settings::default());
            assert!(loaded.revision.is_none());
            assert!(loaded.warning.unwrap().contains("退避"));
            assert!(!store.path().exists());
            let backup = fs::read_dir(&store.directory)
                .unwrap()
                .map(|entry| entry.unwrap().path())
                .find(|path| path.to_string_lossy().ends_with(".corrupt.json"))
                .unwrap();
            assert_eq!(fs::read_to_string(backup).unwrap(), original);
            store.save(&loaded.settings, None).unwrap();
        }
    }

    #[test]
    fn bom_json_load_and_import_keep_source_and_revision_bytes() {
        let directory = TestDirectory::new();
        let store = directory.store();
        fs::create_dir_all(&store.directory).unwrap();
        let bytes = [b"\xef\xbb\xbf".as_slice(), LEGACY_JSON].concat();
        fs::write(store.path(), &bytes).unwrap();
        let loaded = store.load().unwrap();
        assert!(loaded.warning.is_none());
        assert_eq!(loaded.revision.as_deref().unwrap().as_bytes(), bytes);
        assert_eq!(fs::read(store.path()).unwrap(), bytes);
        let revision = store
            .save(&loaded.settings, loaded.revision.as_deref())
            .unwrap();
        let source = directory.0.join("Setting.json");
        fs::write(&source, &bytes).unwrap();
        assert_eq!(
            store
                .import_legacy(&source, Some(&revision))
                .unwrap()
                .settings,
            loaded.settings
        );
        assert_eq!(fs::read(source).unwrap(), bytes);
    }

    #[test]
    fn missing_fields_keep_present_values_but_wrong_types_are_corrupt() {
        let partial = decode(br#"{"top_str":"custom","output_size":42}"#)
            .unwrap_or_else(|e| panic!("{}", e.message()));
        assert_eq!(partial.top_str, "custom");
        assert_eq!(partial.output_size, 42);
        assert_eq!(partial.btm_font_size, Settings::default().btm_font_size);
        assert_eq!(partial.stamp_type, StampType::DatedStamp);
        assert!(matches!(
            decode(br#"{"stamp_type":42}"#),
            Err(DecodeError::Corrupt(_))
        ));
    }

    #[test]
    fn legacy_presence_requires_a_file_and_is_independent_of_first_save() {
        let directory = TestDirectory::new();
        let source = directory.0.join("Setting.json");
        assert!(!legacy_available(&source).unwrap());
        fs::create_dir(&source).unwrap();
        assert!(!legacy_available(&source).unwrap());
        fs::remove_dir(&source).unwrap();
        fs::write(&source, LEGACY_JSON).unwrap();
        assert!(legacy_available(&source).unwrap());
        directory.store().save(&Settings::default(), None).unwrap();
        assert!(legacy_available(&source).unwrap());
        fs::remove_file(source).unwrap();
        assert!(!legacy_available(&directory.0.join("Setting.json")).unwrap());
    }

    #[test]
    fn transient_retry_succeeds_and_permanent_errors_fail_immediately() {
        let mut calls = 0;
        let result = retry(
            || {
                calls += 1;
                if calls < 3 {
                    Err("busy")
                } else {
                    Ok(42)
                }
            },
            |error| *error == "busy",
        );
        assert_eq!(result, Ok(42));
        assert_eq!(calls, 3);
        let mut calls = 0;
        assert_eq!(
            retry::<(), _>(
                || {
                    calls += 1;
                    Err("permanent")
                },
                |_| false
            ),
            Err("permanent")
        );
        assert_eq!(calls, 1);
    }

    #[test]
    fn short_lock_contention_is_waited_out() {
        let directory = TestDirectory::new();
        let store = directory.store();
        let lock = store.lock().unwrap();
        let release = thread::spawn(move || {
            thread::sleep(Duration::from_millis(60));
            drop(lock);
        });
        let loaded = store.load().unwrap();
        release.join().unwrap();
        assert_eq!(loaded.settings, Settings::default());
    }

    #[test]
    fn first_load_creates_directory_with_defaults_without_importing() {
        let directory = TestDirectory::new();
        let source = directory.0.join("Setting.json");
        fs::write(&source, LEGACY_JSON).unwrap();
        let store = directory.store();
        let loaded = store.load().unwrap();
        assert_eq!(loaded.settings, Settings::default());
        assert!(loaded.revision.is_none());
        assert!(loaded.warning.is_none());
        assert!(store.directory.is_dir());
        assert!(!store.path().exists());
        assert!(source.exists());
    }

    #[test]
    fn legacy_settings_without_stamp_type_load_unchanged_with_defaults() {
        let directory = TestDirectory::new();
        let store = directory.store();
        fs::create_dir_all(&store.directory).unwrap();
        let original = LEGACY_JSON;
        fs::write(store.path(), original).unwrap();
        // Exercise the actual file load, not just serde deserialization.
        let loaded = store.load().unwrap();
        assert_eq!(loaded.settings.stamp_type, StampType::DatedStamp);
        assert_eq!(loaded.settings.schema_version, SCHEMA_VERSION);
        assert_eq!(loaded.settings.date_mode, DateMode::Auto);
        assert_eq!(loaded.settings.date_format, DateFormat::Gregorian);
        assert_eq!(loaded.settings.manual_date, None);
        assert_eq!(loaded.settings.top_str, "所属");
        assert_eq!(loaded.settings.top_font_size, 90);
        assert_eq!(loaded.settings.mid_font_size, 60);
        assert_eq!(loaded.settings.btm_str, "名前");
        assert_eq!(loaded.settings.btm_font_size, 110);
        assert_eq!(loaded.settings.output_size, 50);
        assert!(loaded.warning.is_none());
        assert_eq!(fs::read(store.path()).unwrap(), original);
        store
            .save(&loaded.settings, loaded.revision.as_deref())
            .unwrap();
        assert_eq!(store.load().unwrap().settings, loaded.settings);
    }

    #[test]
    fn settings_save_load_round_trip_and_replace_existing_file() {
        let directory = TestDirectory::new();
        let store = directory.store();
        let mut expected = Settings {
            top_str: "品質・デバッグ部\n\"確認\"".to_string(),
            top_font_size: 17,
            mid_font_size: 23,
            btm_str: "山田\\太郎".to_string(),
            btm_font_size: 19,
            output_size: 512,
            date_mode: DateMode::Manual,
            date_format: DateFormat::Wareki,
            manual_date: Some("2019-05-01".to_string()),
            ..Settings::default()
        };
        let mut revision = store.save(&expected, None).unwrap();
        let saved: serde_json::Value = serde_json::from_str(&revision).unwrap();
        assert_eq!(saved["schema_version"], SCHEMA_VERSION);
        assert_eq!(saved["stamp_type"], "dated_stamp");
        assert_eq!(directory.store().load().unwrap().settings, expected);
        // This same test runs on Windows CI and covers replacement, not only creation.
        for size in [256, 128, 64] {
            expected.output_size = size;
            revision = store.save(&expected, Some(&revision)).unwrap();
            let loaded = directory.store().load().unwrap();
            assert_eq!(loaded.settings, expected);
            assert_eq!(loaded.settings.stamp_type, StampType::DatedStamp);
            assert_eq!(loaded.revision.as_deref(), Some(revision.as_str()));
        }
        assert!(fs::read_dir(&store.directory).unwrap().all(|entry| {
            entry
                .unwrap()
                .path()
                .extension()
                .is_none_or(|extension| extension != "tmp")
        }));
    }

    #[test]
    fn corrupt_json_is_preserved_in_backup_and_defaults_can_be_saved() {
        for bytes in [b"{ broken".as_slice(), b"{\"top_str\":1}", b"\xff\xfe"] {
            let directory = TestDirectory::new();
            let store = directory.store();
            fs::create_dir_all(&store.directory).unwrap();
            fs::write(store.path(), bytes).unwrap();
            let loaded = store.load().unwrap();
            assert_eq!(loaded.settings, Settings::default());
            assert!(loaded.revision.is_none());
            assert!(loaded.warning.unwrap().contains("退避"));
            assert!(!store.path().exists());
            let backup = fs::read_dir(&store.directory)
                .unwrap()
                .map(|entry| entry.unwrap().path())
                .find(|path| path.to_string_lossy().ends_with(".corrupt.json"))
                .unwrap();
            assert_eq!(fs::read(&backup).unwrap(), bytes);
            store.save(&loaded.settings, None).unwrap();
            assert_eq!(store.load().unwrap().settings, loaded.settings);
            assert_eq!(fs::read(backup).unwrap(), bytes);
        }
    }

    #[test]
    fn unknown_schema_is_never_backed_up_or_overwritten() {
        let directory = TestDirectory::new();
        let store = directory.store();
        fs::create_dir_all(&store.directory).unwrap();
        let future = r#"{"schema_version":2,"future_field":true}"#;
        fs::write(store.path(), future).unwrap();
        assert!(store.load().unwrap_err().contains("対応していません"));
        assert!(store.save(&Settings::default(), Some(future)).is_err());
        assert_eq!(fs::read_to_string(store.path()).unwrap(), future);
        assert_eq!(fs::read_dir(&store.directory).unwrap().count(), 2);
    }

    #[test]
    fn save_refuses_corruption_created_after_loading() {
        let directory = TestDirectory::new();
        let store = directory.store();
        let revision = store.save(&Settings::default(), None).unwrap();
        fs::write(store.path(), "broken").unwrap();
        assert!(store.save(&Settings::default(), Some(&revision)).is_err());
        assert_eq!(fs::read_to_string(store.path()).unwrap(), "broken");
    }

    #[test]
    fn stale_saves_are_rejected_including_competing_first_saves() {
        let directory = TestDirectory::new();
        let first = directory.store();
        let second = directory.store();
        assert!(first.load().unwrap().revision.is_none());
        assert!(second.load().unwrap().revision.is_none());
        let first_revision = first.save(&Settings::default(), None).unwrap();
        let changed = Settings {
            top_str: "他のウィンドウ".to_string(),
            ..Settings::default()
        };
        assert!(second
            .save(&changed, None)
            .unwrap_err()
            .contains("更新されました"));
        let second_revision = second.load().unwrap().revision.unwrap();
        first.save(&changed, Some(&first_revision)).unwrap();
        assert!(second
            .save(&Settings::default(), Some(&second_revision))
            .is_err());
        assert_eq!(first.load().unwrap().settings, changed);
    }

    #[test]
    fn lock_prevents_another_process_from_reading_or_writing() {
        let directory = TestDirectory::new();
        let store = directory.store();
        let _lock = store.lock().unwrap();
        let result = std::process::Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "settings::tests::lock_child_process"])
            .env("ESTAMP_TEST_LOCK_DIRECTORY", &store.directory)
            .output()
            .unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stdout)
        );
        assert!(!store.path().exists());
    }

    #[test]
    fn lock_child_process() {
        let Some(path) = std::env::var_os("ESTAMP_TEST_LOCK_DIRECTORY") else {
            return;
        };
        let store = SettingsStore::new(PathBuf::from(path));
        assert!(store.load().unwrap_err().contains("使用中"));
        assert!(store
            .save(&Settings::default(), None)
            .unwrap_err()
            .contains("使用中"));
    }

    #[test]
    fn different_config_directories_are_isolated() {
        let directory = TestDirectory::new();
        let first = directory.store();
        let other = SettingsStore::new(directory.0.join("other-user"));
        let config = Settings {
            top_str: "ユーザーA".to_string(),
            ..Settings::default()
        };
        let _lock = other.lock().unwrap();
        first.save(&config, None).unwrap();
        assert_eq!(first.load().unwrap().settings, config);
        drop(_lock);
        assert_eq!(other.load().unwrap().settings, Settings::default());
        assert!(!other.path().exists());
    }

    #[test]
    fn explicit_import_works_after_save_and_preserves_source() {
        let directory = TestDirectory::new();
        let store = directory.store();
        let source = directory.0.join("Setting.json");
        fs::write(&source, LEGACY_JSON).unwrap();
        let imported = store.import_legacy(&source, None).unwrap();
        assert_eq!(imported.settings.top_font_size, 90);
        let saved = store
            .save(&Settings::default(), imported.revision.as_deref())
            .unwrap();
        let imported = store.import_legacy(&source, Some(&saved)).unwrap();
        assert_eq!(store.load().unwrap().settings, imported.settings);
        assert_eq!(imported.settings.stamp_type, StampType::DatedStamp);
        assert_eq!(imported.settings.top_font_size, 90);
        assert_eq!(fs::read(source).unwrap(), LEGACY_JSON);
    }

    #[test]
    fn import_rejects_stale_revision_and_protects_unsupported_destination() {
        let directory = TestDirectory::new();
        let store = directory.store();
        let source = directory.0.join("Setting.json");
        fs::write(&source, LEGACY_JSON).unwrap();
        let saved = store.save(&Settings::default(), None).unwrap();
        assert!(store
            .import_legacy(&source, None)
            .unwrap_err()
            .contains("更新されました"));
        assert_eq!(fs::read_to_string(store.path()).unwrap(), saved);
        for bytes in ["{", r#"{"schema_version":999}"#] {
            fs::write(store.path(), bytes).unwrap();
            assert!(store.import_legacy(&source, Some(bytes)).is_err());
            assert_eq!(fs::read_to_string(store.path()).unwrap(), bytes);
        }
        assert_eq!(fs::read(source).unwrap(), LEGACY_JSON);
    }

    #[test]
    fn missing_corrupt_and_future_import_sources_leave_destination_absent() {
        let directory = TestDirectory::new();
        let store = directory.store();
        let source = directory.0.join("Setting.json");
        assert!(store.import_legacy(&source, None).is_err());
        for bytes in ["{", r#"{"schema_version":999}"#] {
            fs::write(&source, bytes).unwrap();
            assert!(store.import_legacy(&source, None).is_err());
            assert_eq!(fs::read_to_string(&source).unwrap(), bytes);
            assert!(!store.path().exists());
        }
    }

    #[test]
    fn failed_replacement_keeps_destination_and_cleans_temporary_file() {
        let directory = TestDirectory::new();
        let store = directory.store();
        fs::create_dir_all(store.path()).unwrap();
        let marker = store.path().join("keep.txt");
        fs::write(&marker, "keep").unwrap();
        let _lock = store.lock().unwrap();
        assert!(store
            .write(&Settings::default(), None)
            .unwrap_err()
            .contains("置き換え"));
        assert_eq!(fs::read_to_string(marker).unwrap(), "keep");
        assert_eq!(fs::read_dir(&store.directory).unwrap().count(), 2);
    }

    #[test]
    fn directory_and_read_failures_are_reported_without_deleting_data() {
        let directory = TestDirectory::new();
        let store = directory.store();
        fs::write(&store.directory, "keep").unwrap();
        assert!(store.load().unwrap_err().contains("フォルダー"));
        assert!(store.save(&Settings::default(), None).is_err());
        assert_eq!(fs::read_to_string(&store.directory).unwrap(), "keep");
        fs::remove_file(&store.directory).unwrap();
        fs::create_dir_all(store.path()).unwrap();
        assert!(store.load().unwrap_err().contains("読み込めません"));
        assert!(store.path().is_dir());
    }

    #[test]
    fn unsupported_outgoing_schema_is_rejected() {
        let directory = TestDirectory::new();
        let store = directory.store();
        let config = Settings {
            schema_version: 999,
            ..Settings::default()
        };
        assert!(store.save(&config, None).is_err());
        assert!(!store.path().exists());
    }
}
