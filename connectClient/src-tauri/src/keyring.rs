use keyring::Entry;
use rand::RngCore;

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