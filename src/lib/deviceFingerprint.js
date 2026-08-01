// Generates a semi-stable fingerprint for this browser/machine.
// Not cryptographically unique, but good enough to distinguish office PCs.
export function getDeviceFingerprint() {
  if (typeof window === "undefined") return null;

  const key = "ps_device_fingerprint";
  let fingerprint = localStorage.getItem(key);

  if (!fingerprint) {
    const raw = [
      navigator.userAgent,
      navigator.language,
      screen.width,
      screen.height,
      new Date().getTimezoneOffset(),
      Math.random().toString(36).slice(2), // randomness so two identical machines still differ
    ].join("|");

    // simple hash, no crypto needed for this purpose
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash << 5) - hash + raw.charCodeAt(i);
      hash |= 0;
    }
    fingerprint = `dev_${Math.abs(hash)}_${Date.now()}`;
    localStorage.setItem(key, fingerprint);
  }

  return fingerprint;
}