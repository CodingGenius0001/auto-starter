// ptero.js
function stripTrailingSlash(url) {
  return (url || "").replace(/\/+$/, "");
}

const PTERO_PANEL_URL = stripTrailingSlash(process.env.PTERO_PANEL_URL);
const PTERO_CLIENT_API_KEY = process.env.PTERO_CLIENT_API_KEY;
const PTERO_SERVER_ID = process.env.PTERO_SERVER_ID;

function assertPteroEnv() {
  const missing = [];
  if (!PTERO_PANEL_URL) missing.push("PTERO_PANEL_URL");
  if (!PTERO_CLIENT_API_KEY) missing.push("PTERO_CLIENT_API_KEY");
  if (!PTERO_SERVER_ID) missing.push("PTERO_SERVER_ID");
  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
  }
}

async function pteroFetch(path, opts = {}) {
  assertPteroEnv();

  const url = `${PTERO_PANEL_URL}${path}`;
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers: {
      "Authorization": `Bearer ${PTERO_CLIENT_API_KEY}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }

  if (!res.ok) {
    const msg = json?.errors?.[0]?.detail || text || `HTTP ${res.status}`;
    throw new Error(`Pterodactyl API error (${res.status}): ${msg}`);
  }

  return json;
}

/**
 * Returns current_state from /resources: "running" | "starting" | "stopping" | "offline" | etc.
 */
async function getServerState() {
  const data = await pteroFetch(`/api/client/servers/${PTERO_SERVER_ID}/resources`);
  return data?.attributes?.current_state || "unknown";
}

async function sendPowerSignal(signal) {
  // signal: "start" | "stop" | "restart" | "kill"
  await pteroFetch(`/api/client/servers/${PTERO_SERVER_ID}/power`, {
    method: "POST",
    body: { signal },
  });
}

async function startServerIfNeeded() {
  const state = await getServerState();

  if (state === "running") {
    return "✅ Server is already **running**.";
  }

  if (state === "starting") {
    return "⏳ Server is already **starting**. Give it a minute.";
  }

  if (state === "stopping") {
    return "⏳ Server is **stopping** right now. Try again in ~30–60 seconds.";
  }

  // offline/unknown -> start
  await sendPowerSignal("start");
  return "⚡ Start signal sent. Server should come online shortly.";
}

module.exports = {
  getServerState,
  startServerIfNeeded,
  sendPowerSignal,
};
