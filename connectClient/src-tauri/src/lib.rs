use keyring::Entry;
use rand::RngCore;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_device_secret() -> Result<String, String> {
    let entry = Entry::new("meine-app", "device-secret").map_err(|e| e.to_string())?;

    if let Ok(secret) = entry.get_password() {
        return Ok(secret);
    }

    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let secret = hex::encode(bytes);
    entry.set_password(&secret).map_err(|e| e.to_string())?;

    Ok(secret)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, get_device_secret])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}