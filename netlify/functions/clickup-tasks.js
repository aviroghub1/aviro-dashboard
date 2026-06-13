// Netlify Function: Fetch ClickUp tasks for David & Sophie
// GET /.netlify/functions/clickup-tasks?user=david|sophie
// Token passed via query param (from dashboard settings) or Netlify env CLICKUP_API_TOKEN
// Also caches results to Supabase for fast dashboard startup.

const DAVID_ID = "266644665";
const SOPHIE_ID = "100796098";
const TEAM_ID_FALLBACK = "90040187192"; // workspace id

const DB_URL = "https://iosvevycvqviaonsxsnq.supabase.co";
const DB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvc3ZldnljdnF2aWFvbnN4c25xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNzA5NDMsImV4cCI6MjA5MTc0Njk0M30.IMpyt1CqwKUbM4aW0vyC0fxgNUvyNOSzk3aP9v_Iw-Q";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  if (event.httpMethod !== "GET") return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "GET only" }) };

  const params = event.queryStringParameters || {};
  const token = params.token || process.env.CLICKUP_API_TOKEN;
  if (!token) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "No ClickUp API token. Set CLICKUP_API_TOKEN env var or pass ?token=..." }) };

  const user = (params.user || "david").toLowerCase();
  const assigneeId = user === "sophie" ? SOPHIE_ID : DAVID_ID;
  const teamId = params.team_id || process.env.CLICKUP_TEAM_ID || TEAM_ID_FALLBACK;

  try {
    // Fetch all open tasks for this assignee, page by page (100 per page max)
    let allTasks = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const url = `https://api.clickup.com/api/v2/team/${teamId}/task?assignees[]=${assigneeId}&include_closed=false&subtasks=false&page=${page}&order_by=due_date&reverse=true`;
      const res = await fetch(url, {
        headers: { Authorization: token, "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const errText = await res.text();
        return { statusCode: res.status, headers: CORS, body: JSON.stringify({ error: `ClickUp API error ${res.status}`, detail: errText.slice(0, 300) }) };
      }
      const data = await res.json();
      const tasks = data.tasks || [];
      allTasks = allTasks.concat(tasks);
      // ClickUp returns empty array when no more pages
      hasMore = tasks.length >= 100;
      page++;
      if (page > 10) break; // safety cap
    }

    // Transform to simplified format
    const simplified = allTasks.map(t => ({
      id: t.id,
      name: t.name,
      status: t.status?.status || "unknown",
      priority: t.priority?.priority || null,
      dueDate: t.due_date ? new Date(parseInt(t.due_date)).toISOString().slice(0, 10) : null,
      space: t.space?.name || t.list?.name || "",
      list: t.list?.name || "",
      url: t.url,
      assignees: (t.assignees || []).map(a => a.username || a.email),
      tags: (t.tags || []).map(tg => tg.name),
      dateCreated: t.date_created ? new Date(parseInt(t.date_created)).toISOString().slice(0, 10) : null,
    }));

    // Cache to Supabase for fast dashboard startup
    try {
      const cacheId = user === "sophie" ? "clickup_sophie_tasks" : "clickup_david_tasks";
      await fetch(`${DB_URL}/rest/v1/dashboard_state`, {
        method: "POST",
        headers: {
          apikey: DB_KEY,
          Authorization: `Bearer ${DB_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          id: cacheId,
          state: { tasks: simplified },
          updated_at: new Date().toISOString(),
          updated_by: "clickup_proxy",
        }),
      });
    } catch (cacheErr) {
      console.warn("Supabase cache write failed:", cacheErr.message);
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ ok: true, user, count: simplified.length, tasks: simplified }),
    };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
