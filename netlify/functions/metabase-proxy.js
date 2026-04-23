// Netlify Function: proxies requests to Metabase instances to avoid CORS issues
// Usage: POST /.netlify/functions/metabase-proxy
// Body: { metabaseUrl, path, method, body, sessionToken }
// Uses native fetch (Node 18+) — no external dependencies

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { metabaseUrl, path, method, body, sessionToken } = JSON.parse(event.body);

    if (!metabaseUrl || !path) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "metabaseUrl and path are required" }) };
    }

    const fullUrl = `${metabaseUrl.replace(/\/$/, "")}${path}`;
    console.log("[proxy]", method || "GET", fullUrl);

    const fetchHeaders = { "Content-Type": "application/json" };
    if (sessionToken) {
      fetchHeaders["X-Metabase-Session"] = sessionToken;
    }

    const fetchOptions = {
      method: method || "GET",
      headers: fetchHeaders,
    };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      fetchOptions.body = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    fetchOptions.signal = controller.signal;

    const response = await fetch(fullUrl, fetchOptions);
    clearTimeout(timeout);

    const responseText = await response.text();
    console.log("[proxy] Response:", response.status, responseText.substring(0, 200));

    let responseBody;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = { raw: responseText };
    }

    return {
      statusCode: response.status,
      headers,
      body: JSON.stringify(responseBody),
    };
  } catch (error) {
    console.error("[proxy] Error:", error.name, error.message);
    const isTimeout = error.name === "AbortError";
    return {
      statusCode: isTimeout ? 504 : 500,
      headers,
      body: JSON.stringify({
        error: isTimeout ? "Request timed out after 25s" : error.message,
        type: error.name,
      }),
    };
  }
};
