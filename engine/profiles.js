const PROFILE_KEY = "decksafeProfiles";

export async function loadProfiles() {
  const storage = globalThis.chrome?.storage?.local;
  if (!storage) return {};
  const values = await storage.get(PROFILE_KEY);
  return values[PROFILE_KEY] || {};
}

export async function saveProfile(name, config) {
  const storage = globalThis.chrome?.storage?.local;
  if (!storage) throw new Error("Chrome storage is unavailable.");
  const profiles = await loadProfiles();
  profiles[name] = config;
  await storage.set({ [PROFILE_KEY]: profiles });
}

export async function importProfiles(nextProfiles) {
  const storage = globalThis.chrome?.storage?.local;
  if (!storage) throw new Error("Chrome storage is unavailable.");
  const profiles = await loadProfiles();
  await storage.set({ [PROFILE_KEY]: { ...profiles, ...nextProfiles } });
}
