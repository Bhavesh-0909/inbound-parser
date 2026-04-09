import express from "express"
import type { Request, Response } from "express";
import multer from "multer";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();

// DB imports
import { db } from "./config.js";
import { emailTable } from "./db/schema.js";

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.urlencoded({ extended: true }));

// ✅ Multer for SendGrid attachments
const upload = multer({ storage: multer.memoryStorage() });

// -----------------------------
// 🔧 Helper Functions
// -----------------------------

// ✅ Extract URLs
function extractUrls(text: string): string[] {
  return text.match(/https?:\/\/[^\s"]+/g) || [];
}

// -----------------------------
// 📩 Routes
// -----------------------------

app.get("/emails", async (_req: Request, res: Response) => {
  try {
    const emails = await db.select().from(emailTable);

    res.status(200).json({
      success: true,
      count: emails.length,
      data: emails,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch emails",
    });
  }
});

app.post(
  "/email",
  upload.any(),
  async (req: Request, res: Response) => {
    try {
      console.log("...............Process starts...............");

      const { from, to, subject, text, html } = req.body;

      // ✅ Validate required fields
      if (!from || !to) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // -----------------------------
      // 📎 Attachments (Direct from SendGrid)
      // -----------------------------
      const attachments = (req.files as Express.Multer.File[]) || [];

      console.log("📎 Attachments:", attachments.length);

      // -----------------------------
      // 🧠 Get clean text
      // -----------------------------
      let content = text || "";

      if (!content && html) {
        // fallback: strip HTML if text not present
        content = html.replace(/<[^>]+>/g, " ");
      }

      content = content
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 5000);

      // -----------------------------
      // 🔗 Extract URLs
      // -----------------------------
      const urls = extractUrls(content);
      console.log("🔗 URLs:", urls);

      // -----------------------------
      // 🤖 ML API Call
      // -----------------------------
      let label = "unknown";

      try {
        const result = await fetch(
          "https://ml-model-us52.onrender.com/detect",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: content }),
          }
        );

        if (result.ok) {
          const data = await result.json();
          label = data?.prediction ?? "unknown";
        }
      } catch (err) {
        console.error("⚠️ ML service failed:", err);
      }

      // -----------------------------
      // 💾 Save to DB
      // -----------------------------
      const safeData = {
        from,
        to,
        subject: subject ?? "",
        raw: content, // ✅ store clean content instead of raw MIME
        label,
      };

      await db.insert(emailTable).values(safeData);

      console.log("...............Process ends...............");

      res.status(200).json({
        success: true,
        attachments: attachments.length,
        filenames: attachments.map((f) => f.originalname),
        urls,
        label,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

app.get("/", (_req, res) => {
  console.log("GET / ");
  res.send("Server running...");
});

// -----------------------------
// 🚀 Start Server
// -----------------------------
app.listen(3000, () => console.log("Server running on port 3000"));