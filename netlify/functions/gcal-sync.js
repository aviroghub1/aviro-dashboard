// Netlify Function: Google Calendar sync via ICS feed
// GET /api/gcal-sync?ics_url=<encoded_url>
// Fetches the ICS feed, parses events, writes to Supabase gcal_events row, returns events as JSON.

const DB_URL = "https://iosvevycvqviaonsxsnq.supabase.co";
const DB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvc3ZldnljdnF2aWFvbnN4c25xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNzA5NDMsImV4cCI6MjA5MTc0Njk0M30.IMpyt1CqwKUbM4aW0vyC0fxgNUvyNOSzk3aP9v_Iw-Q";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

// Parse an ICS date/time string to a JS Date (UTC)
function parseIcsDate(s) {
  if (!s) return null;
  // TZID format: TZID=Europe/London:20260611T080000  — strip the TZID part
  if (s.includes(":")) s = s.split(":").pop();
  // Format: 20260611T080000Z or 20260611T080000 or 20260611
  s = s.replace(/\r|\n/g, "").trim();
  if (s.length === 8) {
    // All-day date: YYYYMMDD
    return new Date(Date.UTC(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8)));
  }
  const year = +s.slice(0,4), month = +s.slice(4,6)-1, day = +s.slice(6,8);
  const hour = +s.slice(9,11), min = +s.slice(11,13), sec = +s.slice(13,15) || 0;
  if (s.endsWith("Z")) {
    return new Date(Date.UTC(year, month, day, hour, min, sec));
  }
  // No Z = "floating" time — treat as UTC (Google ICS usually uses Z or TZID)
  return new Date(Date.UTC(year, month, day, hour, min, sec));
}

// Guess event category from title
function guessCat(title) {
  const t = title.toLowerCase();
  if (/dinner|lunch|house|preply|⚽|football|personal|physio|flight|reserv|baby|whetstone|golden visa/.test(t)) return "personal";
  if (/payment|cubepay|chainalysis|topspins|monkey.?tilt|libernetix|pylon|frontier|gg.?poker|trust.?pay|catch-up|radon|rapyd/.test(t)) return "gateway";
  return "aviro";
}

// Parse ICS text into events array
function parseIcs(icsText) {
  const events = [];
  const blocks = icsText.split("BEGIN:VEVENT");

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split("END:VEVENT")[0];
    const lines = [];
    // Unfold continuation lines (lines starting with space/tab are continuations)
    for (const rawLine of block.split("\n")) {
      if (rawLine.startsWith(" ") || rawLine.startsWith("\t")) {
        if (lines.length > 0) lines[lines.length - 1] += rawLine.slice(1);
      } else {
        lines.push(rawLine);
      }
    }

    const props = {};
    for (const line of lines) {
      // Handle properties with parameters like DTSTART;TZID=...:value
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      let key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim().replace(/\r/g, "");
      // Normalize key — strip parameters for lookup but keep full key for DTSTART;TZID
      const baseKey = key.split(";")[0].toUpperCase();
      if (!props[baseKey]) props[baseKey] = val;
    }

    const summary = props["SUMMARY"] || "(no title)";
    const dtstart = props["DTSTART"];
    const dtend = props["DTEND"];
    const location = (props["LOCATION"] || "").replace(/\\,/g, ",").replace(/\\n/g, " ").trim();
    const description = props["DESCRIPTION"] || "";
    const status = (props["STATUS"] || "").toUpperCase();

    if (status === "CANCELLED") continue;

    const startDate = parseIcsDate(dtstart);
    const endDate = parseIcsDate(dtend);
    if (!startDate) continue;

    // Check if this is an all-day event (date-only, no T)
    const rawDtstart = dtstart || "";
    const isAllDay = rawDtstart.length <= 8 || (!rawDtstart.includes("T"));
    if (isAllDay) continue; // skip all-day events for now

    const dateStr = startDate.toISOString().slice(0, 10);
    const startHour = Math.round((startDate.getUTCHours() + startDate.getUTCMinutes() / 60) * 100) / 100;
    let endHour = endDate
      ? Math.round((endDate.getUTCHours() + endDate.getUTCMinutes() / 60) * 100) / 100
      : startHour + 1;

    // Handle overnight events
    if (endDate && endDate.toISOString().slice(0, 10) !== dateStr) {
      const durationMs = endDate - startDate;
      endHour = Math.round((startHour + durationMs / 3600000) * 100) / 100;
      if (endHour > 23.99) endHour = 23.99;
    }

    // Parse attendees
    const attendeeLines = block.match(/ATTENDEE[^:]*:([^\r\n]+)/gi) || [];
    const attendees = [];
    for (const aLine of attendeeLines) {
      // Extract CN parameter if present
      const cnMatch = aLine.match(/CN=([^;:]+)/i);
      if (cnMatch) {
        const name = cnMatch[1].replace(/"/g, "").trim();
        // Skip the calendar owner
        if (!name.toLowerCase().includes("david") || name.toLowerCase().includes("david n") === false) {
          attendees.push(name);
        }
      } else {
        // Extract email from mailto:
        const emailMatch = aLine.match(/mailto:([^\r\n;]+)/i);
        if (emailMatch) {
          const email = emailMatch[1].trim();
          if (email !== "david@aviro-group.com") {
            attendees.push(email.split("@")[0]);
          }
        }
      }
    }

    // Extract conference/meet link from description or CONFERENCE property
    let meet = "";
    const meetMatch = description.match(/https:\/\/meet\.google\.com\/[a-z-]+/i);
    if (meetMatch) meet = meetMatch[0];

    // Clean location
    let locClean = location;
    if (/zoom\.us/i.test(locClean)) locClean = "Zoom";
    if (/teams\.microsoft|Microsoft Teams/i.test(locClean)) locClean = "Microsoft Teams Meeting";
    if (/preply\.com/i.test(locClean)) locClean = "Preply";
    locClean = locClean.slice(0, 80);

    events.push({
      id: `gcal-${events.length}`,
      date: dateStr,
      startHour,
      endHour,
      title: summary.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/g, " ").trim(),
      cat: guessCat(summary),
      meet,
      attendees: attendees.join(", "),
      location: locClean,
      notes: "",
      isGcal: true,
    });
  }

  return events;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  if (event.httpMethod !== "GET") return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "GET only" }) };

  const params = event.queryStringParameters || {};
  const icsUrl = params.ics_url || process.env.GCAL_ICS_URL;

  if (!icsUrl) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: "No ICS URL. Pass ?ics_url=... or set GCAL_ICS_URL env var." }),
    };
  }

  try {
    // Fetch ICS feed
    const icsRes = await fetch(icsUrl);
    if (!icsRes.ok) {
      return {
        statusCode: 502,
        headers: CORS,
        body: JSON.stringify({ error: `ICS fetch failed: ${icsRes.status}` }),
      };
    }
    const icsText = await icsRes.text();

    // Parse all events
    const allEvents = parseIcs(icsText);

    // Filter to next 21 days from today
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const futureDate = new Date(now.getTime() + 21 * 86400000);
    const futureStr = futureDate.toISOString().slice(0, 10);

    const filtered = allEvents
      .filter(e => e.date >= todayStr && e.date <= futureStr)
      .sort((a, b) => a.date === b.date ? a.startHour - b.startHour : a.date.localeCompare(b.date));

    // Re-index IDs
    filtered.forEach((e, i) => e.id = `gcal-${i}`);

    // Write to Supabase
    let supabaseOk = false;
    try {
      const supaRes = await fetch(`${DB_URL}/rest/v1/dashboard_state`, {
        method: "POST",
        headers: {
          apikey: DB_KEY,
          Authorization: `Bearer ${DB_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          id: "gcal_events",
          state: { events: filtered },
          updated_at: new Date().toISOString(),
          updated_by: "gcal_sync_button",
        }),
      });
      supabaseOk = supaRes.ok;
    } catch (e) {
      console.warn("Supabase write failed:", e.message);
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        ok: true,
        count: filtered.length,
        dateRange: filtered.length > 0 ? `${filtered[0].date} to ${filtered[filtered.length - 1].date}` : "none",
        supabaseWritten: supabaseOk,
        events: filtered,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
