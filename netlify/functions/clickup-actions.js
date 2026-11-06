// Netlify Function: ClickUp write-back actions for the dashboard
// POST { token, action, taskId?, listId?, name?, status?, dueDate?, assignee? }
// Actions:
//   complete  — set the task to its list's closed/done status
//   setStatus — set the task to a named status (board drag)
//   create    — create a task in a list (assigned to david/sophie)

const DAVID_ID = "266644665";
const SOPHIE_ID = "100796098";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const CU = "https://api.clickup.com/api/v2";

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "POST only" }) };

  try {
    const { token, action, taskId, listId, name, status, dueDate, assignee } = JSON.parse(event.body || "{}");
    const authToken = token || process.env.CLICKUP_API_TOKEN;
    if (!authToken) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "No ClickUp token" }) };
    const H = { Authorization: authToken, "Content-Type": "application/json" };

    if (action === "setStatus") {
      if (!taskId || !status) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "taskId and status required" }) };
      const res = await fetch(`${CU}/task/${taskId}`, { method: "PUT", headers: H, body: JSON.stringify({ status }) });
      const data = await res.json();
      if (!res.ok) return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false, error: data.err || ("ClickUp " + res.status) }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, status: data.status && data.status.status }) };
    }

    if (action === "complete") {
      if (!taskId) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "taskId required" }) };
      // Find the task's list, then that list's closed/done status
      const tRes = await fetch(`${CU}/task/${taskId}`, { headers: H });
      const task = await tRes.json();
      if (!tRes.ok) return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false, error: task.err || ("ClickUp " + tRes.status) }) };
      const lId = task.list && task.list.id;
      let doneStatus = "complete";
      if (lId) {
        const lRes = await fetch(`${CU}/list/${lId}`, { headers: H });
        if (lRes.ok) {
          const list = await lRes.json();
          const sts = list.statuses || [];
          const closed = sts.find(s => s.type === "closed") || sts.find(s => s.type === "done") || sts[sts.length - 1];
          if (closed) doneStatus = closed.status;
        }
      }
      const res = await fetch(`${CU}/task/${taskId}`, { method: "PUT", headers: H, body: JSON.stringify({ status: doneStatus }) });
      const data = await res.json();
      if (!res.ok) return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false, error: data.err || ("ClickUp " + res.status) }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, status: doneStatus }) };
    }

    if (action === "create") {
      if (!listId || !name) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "listId and name required" }) };
      const body = { name, assignees: [parseInt(assignee === "sophie" ? SOPHIE_ID : DAVID_ID)] };
      if (dueDate) { const ms = Date.parse(dueDate + "T12:00:00Z"); if (!isNaN(ms)) { body.due_date = ms; body.due_date_time = false; } }
      const res = await fetch(`${CU}/list/${listId}/task`, { method: "POST", headers: H, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: false, error: data.err || ("ClickUp " + res.status) }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, taskId: data.id, url: data.url }) };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Unknown action: " + action }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
