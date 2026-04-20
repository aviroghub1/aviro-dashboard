// Netlify Function: proxies requests to Metabase instances to avoid CORS issues
// Usage: POST /.netlify/functions/metabase-proxy
// Body: { metabaseUrl, path, method, body, sessionToken }

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

    // Build the full URL
    const url = `${metabaseUrl.replace(/\/$/, "")}${path}`;

    // Build fetch options
    const fetchHeaders = { "Content-Type": "application/json" };
    if (sessionToken) {
      fetchHeaders["X-Metabase-Session"] = sessionToken;
    }

    const fetchOpts = {
      method: method || "GET",
      headers: fetchHeaders,
    };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      fetchOpts.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOpts);
    const responseText = await response.text();

    // Try to parse as JSON, otherwise return as text
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
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
