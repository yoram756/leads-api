const { Client } = require("@notionhq/client");

// CORS headers for cross-origin requests from all landing pages
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

module.exports = async function handler(req, res) {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
          res.writeHead(200, CORS_HEADERS);
          return res.end();
    }

    if (req.method !== "POST") {
          res.writeHead(405, CORS_HEADERS);
          return res.end(JSON.stringify({ error: "Method not allowed" }));
    }

    // Set CORS headers for all responses
    Object.entries(CORS_HEADERS).forEach(([key, value]) => {
          res.setHeader(key, value);
    });

    try {
          const { name, email, phone, message, source } = req.body;

      if (!name || !email) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: "Name and email are required" }));
      }

      // --- 1. Add to Notion ---
      const notion = new Client({ auth: process.env.NOTION_API_KEY });
          const databaseId = process.env.NOTION_DATABASE_ID;

      const properties = {
              "שם": {
                        title: [{ text: { content: name } }],
              },
              "אימייל": {
                        email: email,
              },
              "הודעה": {
                        rich_text: [{ text: { content: message || "" } }],
              },
              "מקור": {
                        select: { name: source || "unknown" },
              },
              "סטטוס": {
                        select: { name: "חדש" },
              },
      };

      // Only add phone if provided (Notion rejects empty string for phone_number)
      if (phone) {
              properties["טלפון"] = { phone_number: phone };
      }

      const notionPromise = notion.pages.create({
              parent: { database_id: databaseId },
              properties,
      }).catch((err) => {
              console.error("Notion API error:", JSON.stringify(err.body || err.message || err));
              throw err;
      });

      // --- 2. Send email via FormSubmit ---
      const formSubmitPromise = fetch(
              `https://formsubmit.co/ajax/${process.env.FORMSUBMIT_EMAIL}`,
        {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Accept: "application/json" },
                  body: JSON.stringify({
                              name,
                              email,
                              phone: phone || "לא סופק",
                              message: message || "",
                              _source: source || "unknown",
                              _subject: `ליד חדש מ-${source || "דף נחיתה"}: ${name}`,
                  }),
        }
            );

      // Run both in parallel
      const [notionResult, formSubmitResult] = await Promise.allSettled([
              notionPromise,
              formSubmitPromise,
            ]);

      const response = {
              success: true,
              notion: notionResult.status === "fulfilled" ? "ok" : "error",
              email: formSubmitResult.status === "fulfilled" ? "ok" : "error",
      };

      if (notionResult.status === "rejected") {
              response.notionError = notionResult.reason?.message || "unknown";
      }

      res.statusCode = 200;
          return res.end(JSON.stringify(response));
    } catch (error) {
          console.error("Lead API error:", error);
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: "Internal server error" }));
    }
};
