// Netlify Function: proxy for Chainalysis address screening
// The Chainalysis API blocks browser CORS requests, so the dashboard calls
// this function instead. The API key is held in dashboard settings (Finance
// page, admin only) and passed per-request.
// POST body: { address: "0x...", key: "chainalysis-api-key" }

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: "Use POST" }) };
  }
  try {
    const { address, key } = JSON.parse(event.body || "{}");
    if (!address || !key) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "address and key required" }) };
    }
    if (!/^[a-zA-Z0-9]{20,64}$/.test(address)) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: "invalid address format" }) };
    }
    const res = await fetch("https://public.chainalysis.com/api/v1/address/" + encodeURIComponent(address), {
      headers: { "X-API-Key": key, "Accept": "application/json" },
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: res.ok, status: res.status, data }),
    };
  } catch (error) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: error.message }) };
  }
};
