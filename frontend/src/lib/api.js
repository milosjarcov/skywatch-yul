// Where the SkyWatch API lives. In development Vite forwards /api to the
// FastAPI server (see vite.config.js), so the default is this same site. A
// deployed frontend can point somewhere else with VITE_API_URL.
const BASE = import.meta.env.VITE_API_URL ?? "";

// Fetches JSON from the API. Also returns the server's clock reading (from
// the Date header), because the map uses it to time plane movement.
export async function getJson(path, options) {
  const res = await fetch(BASE + path, options);
  if (!res.ok) {
    let detail = null;
    try {
      detail = (await res.json()).detail;
    } catch {
      // The body wasn't JSON (a proxy error page, say). The status will do.
    }
    throw new Error(detail || `The server answered ${res.status}`);
  }
  return { data: await res.json(), serverDate: Date.parse(res.headers.get("date") ?? "") };
}
