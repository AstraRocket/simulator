// Call after the first autosave, not at startup: Firefox prompts, and a prompt with nothing saved is likely denied.

let attempted = false;

export async function requestPersistentStorage(): Promise<boolean> {
  if (attempted) return false;
  attempted = true;
  try {
    if (!navigator.storage?.persist) return false; // Safari < 17
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
