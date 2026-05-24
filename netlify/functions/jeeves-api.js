// Netlify Function: Read-only REST API for Jeeves AI assistant
// Usage: GET /.netlify/functions/jeeves-api?section=all
// Headers: x-api-key: <JEEVES_API_KEY>
// Sections: all, crm, gateway, corporate, calendar, settings
// CRM filters: ?section=crm&status=Active  (In Discussion, Onboarding, Active, Inactive)
// Uses native fetch (Node 18+) — no external dependencies

const JEEVES_API_KEY = "jeeves_90fb032d092b88fa46416010a28c8586d574e17f12867da8";

const DB_URL = "https://iosvevycvqviaonsxsnq.supabase.co";
const DB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvc3ZldnljdnF2aWFvbnN4c25xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNzA5NDMsImV4cCI6MjA5MTc0Njk0M30.IMpyt1CqwKUbM4aW0vyC0fxgNUvyNOSzk3aP9v_Iw-Q";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

async function fetchDashboardState() {
  const res = await fetch(`${DB_URL}/rest/v1/dashboard_state?id=eq.shared&select=state,updated_at`, {
    headers: {
      apikey: DB_KEY,
      Authorization: `Bearer ${DB_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
  const rows = await res.json();
  if (!rows || rows.length === 0) throw new Error("No dashboard state found");
  return { state: rows[0].state, updatedAt: rows[0].updated_at };
}

function extractSection(state, section, query) {
  switch (section) {
    case "crm": {
      let clients = state.crmClients || [];
      if (query.status) {
        clients = clients.filter(cl => cl.status.toLowerCase() === query.status.toLowerCase());
      }
      if (query.client) {
        const q = query.client.toLowerCase();
        clients = clients.filter(cl => cl.name.toLowerCase().includes(q));
      }
      return {
        section: "crm",
        totalClients: (state.crmClients || []).length,
        filtered: clients.length,
        clients: clients.map(cl => ({
          id: cl.id,
          name: cl.name,
          contact: cl.contact || null,
          status: cl.status,
          services: cl.services || [],
          overview: cl.overview || null,
          notes: (cl.notes || []).map(n => ({ text: n.text, date: n.date })),
          dateStarted: cl.dateStarted || null,
          conversationLog: (cl.convLog || []).map(cv => ({
            date: cv.date,
            side: cv.side,
            notes: cv.notes,
            attendees: cv.attendees || null,
          })),
          // Onboarding fields
          integrationGroup: cl.integrationGroup || null,
          onboardingStarted: cl.onboardingStarted || null,
          onboardingProgress: cl.onboardingProgress || null,
          legalsDone: cl.legalsDone || false,
          // Active fields
          targetVolume: cl.targetVolume || null,
          lastMonthVolume: cl.lastMonthVolume || null,
          monthsProcessed: cl.monthsProcessed || null,
          // Inactive fields
          inactiveReason: cl.inactiveReason || null,
        })),
      };
    }

    case "gateway": {
      return {
        section: "gateway",
        clients: (state.gatewayClients || []).map(gc => ({
          id: gc.id,
          name: gc.name,
          status: gc.status,
          contact: gc.contact || null,
          volume: gc.volume || null,
        })),
        integrations: state.integrations || [],
        providers: state.providers || [],
      };
    }

    case "corporate": {
      return {
        section: "corporate",
        entities: (state.corporateEntities || []).map(e => ({
          id: e.id,
          name: e.name,
          jurisdiction: e.jurisdiction || null,
          type: e.type || null,
          status: e.status || null,
        })),
        bankRelationships: state.bankRelationships || [],
        gamingBrands: state.gamingBrands || [],
      };
    }

    case "calendar": {
      return {
        section: "calendar",
        events: state.calEvents || [],
        quickJobs: state.quickJobs || [],
        delegatedTasks: state.delegatedTasks || [],
        dailyProgress: state.dailyProgress || [],
      };
    }

    case "signal": {
      return {
        section: "signal",
        slots: state.signalSlots || [],
        dayStarted: state.signalDayStarted || null,
        dayFinished: state.signalDayFinished || null,
        completed: state.signalCompleted || [],
      };
    }

    case "all": {
      return {
        crm: extractSection(state, "crm", query),
        gateway: extractSection(state, "gateway", query),
        corporate: extractSection(state, "corporate", query),
        calendar: extractSection(state, "calendar", query),
        signal: extractSection(state, "signal", query),
      };
    }

    default:
      return null;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Method not allowed. Use GET." }),
    };
  }

  // Auth check
  const apiKey = event.headers["x-api-key"] || event.headers["X-Api-Key"];
  if (!apiKey || apiKey !== JEEVES_API_KEY) {
    return {
      statusCode: 401,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Unauthorized. Provide a valid x-api-key header." }),
    };
  }

  try {
    const params = event.queryStringParameters || {};
    const section = (params.section || "all").toLowerCase();

    const validSections = ["all", "crm", "gateway", "corporate", "calendar", "signal"];
    if (!validSections.includes(section)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: `Invalid section: "${section}". Valid sections: ${validSections.join(", ")}`,
        }),
      };
    }

    const { state, updatedAt } = await fetchDashboardState();
    const data = extractSection(state, section, params);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        ok: true,
        updatedAt,
        data,
      }),
    };
  } catch (error) {
    console.error("[jeeves-api] Error:", error.message);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
