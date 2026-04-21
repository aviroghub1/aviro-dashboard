// Netlify Function: proxies requests to Metabase instances to avoid CORS issues
// Usage: POST /.netlify/functions/metabase-proxy
// Body: { metabaseUrl, path, method, body, sessionToken }

const https = require("https");
const http = require("http");

function makeRequest(url, options, postData) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.request(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error("Request timeout")); });
    if (postData) req.write(postData);
    req.end();
  });
}

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

    // Build request options
    const parsedUrl = new URL(url);
    const reqHeaders = { "Content-Type": "application/json" };
    if (sessionToken) {
      reqHeaders["X-Metabase-Session"] = sessionToken;
    }

    const postData = (body && (method === "POST" || method === "PUT" || method === "PATCH")) ? JSON.stringify(body) : null;
    if (postData) {
      reqHeaders["Content-Length"] = Buffer.byteLength(postData);
    }

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: method || "GET",
      headers: reqHeaders,
    };

    const response = await makeRequest(url, options, postData);

    // Try to parse as JSON, otherwise return as text
    let responseBody;
    try {
      responseBody = JSON.parse(response.body);
    } catch {
      responseBody = { raw: response.body };
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
      body: JSON.stringify({ error: error.message, stack: error.stack }),
    };
  }
};
