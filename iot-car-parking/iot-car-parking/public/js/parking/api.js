// ─── API HELPERS ──────────────────────────────────────────
export const apiGet = async path => {
  try {
    const r = await fetch(path, { headers: { Accept: 'application/json' } });
    return await r.json();
  } catch {
    return null;
  }
};

export const apiPost = async (path, data) => {
  try {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await r.json();
  } catch {
    return null;
  }
};
