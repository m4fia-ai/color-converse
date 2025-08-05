export async function getManifest(base: string) {
  const res = await fetch(`${base}/manifest`, {
    mode: "cors",
    headers: { Accept: "application/json" }
  });
  if (!res.ok) {
    throw new Error(`Manifest fetch failed: ${res.status}`);
  }
  return res.json();            // ← resolves immediately
}