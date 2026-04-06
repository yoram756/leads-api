const { Client } = require("@notionhq/client");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(200, CORS_HEADERS);
    return res.end();
  }
  if (req.method !== "POST") {
    res.writeHead(405, CORS_HEADERS);
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  try {
    const { name, email, phone, message, source } = req.body;
    if (!name || !email) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Name and email are required" }));
    }

    const notion = new Client({ auth: process.env.NOTION_API_KEY });
    const notionPromise = notion.pages.create({
      parent: { database_id: process.env.NOTION_DATABASE_ID },
      properties: {
        "\u05E9\u05DD": { title: [{ text: { content: name } }] },
        "\u05D0\u05D9\u05DE\u05D9\u05D9\u05DC": { email },
        "\u05D8\u05DC\u05E4\u05D5\u05DF": { phone_number: phone || "" },
        "\u05D4\u05D5\u05D3\u05E2\u05D4": { rich_text: [{ text: { content: message || "" } }] },
        "\u05DE\u05E7\u05D5\u05E8": { select: { name: source || "unknown" } },
        "\u05E1\u05D8\u05D8\u05D5\u05E1": { select: { name: "\u05D7\u05D3\u05E9" } },
      },
    });

    const formSubmitPromise = fetch(
      "https://formsubmit.co/ajax/" + process.env.FORMSUBMIT_EMAIL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name, email,
          phone: phone || "N/A",
          message: message || "",
          _source: source || "unknown",
          _subject: "New lead from " + (source || "landing page") + ": " + name,
        }),
      }
    );

    const [notionRes, emailRes] = await Promise.allSettled([notionPromise, formSubmitPromise]);
    res.statusCode = 200;
    return res.end(JSON.stringify({
      success: true,
      notion: notionRes.status === "fulfilled" ? "ok" : "error",
      email: emailRes.status === "fulfilled" ? "ok" : "error",
    }));
  } catch (error) {
    console.error("Lead API error:", error);
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: "Internal server error" }));
  }
};
