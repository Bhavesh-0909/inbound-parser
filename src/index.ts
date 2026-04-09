import express from "express";
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

// ✅ Important: use memory storage
const upload = multer({ storage: multer.memoryStorage() });

// -----------------------------
// 🔧 Helper Functions
// -----------------------------

// ✅ Extract URLs
function extractUrls(text: string): string[] {
  return text.match(/https?:\/\/[^\s"]+/g) || [];
}

// ✅ Extract attachments from RAW MIME (fallback)
function extractAttachmentsFromRaw(raw: string) {
  const attachments: any[] = [];

  const regex =
    /Content-Disposition: attachment; filename="(.+?)"[\s\S]*?Content-Transfer-Encoding: base64\s+([\s\S]*?)--/g;

  let match;
  while ((match = regex.exec(raw)) !== null) {
    const filename = match[1];
    const base64 = match[2].replace(/\s/g, "");

    attachments.push({
      filename,
      buffer: Buffer.from(base64, "base64"),
    });
  }

  return attachments;
}

// ✅ Clean email text for ML
function cleanEmailText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ") // remove HTML
    .replace(/Content-[\s\S]*?\n/g, " ") // remove MIME headers
    .replace(/\s+/g, " ") // normalize spaces
    .trim()
    .slice(0, 5000); // limit size
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

      const { from, to, subject, email } = req.body;

      if (!from || !to || !email) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // -----------------------------
      // 📎 Attachments Handling
      // -----------------------------
      let attachments: any[] = [];

      if (req.files && (req.files as any[]).length > 0) {
        // ✅ Preferred (multer parsed)
        attachments = (req.files as any[]).map((file) => ({
          filename: file.originalname,
          buffer: file.buffer,
          mimetype: file.mimetype,
        }));
      } else {
        // ⚠️ Fallback (raw MIME parsing)
        attachments = extractAttachmentsFromRaw(email);
      }

      console.log("📎 Attachments:", attachments.length);

      // -----------------------------
      // 🔗 Extract URLs
      // -----------------------------
      const urls = extractUrls(email);
      console.log("🔗 URLs:", urls);

      // -----------------------------
      // 🧠 Clean text for ML
      // -----------------------------
      const cleanText = cleanEmailText(email);

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
            body: JSON.stringify({ text: cleanText }),
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
        raw: email,
        label,
      };

      await db.insert(emailTable).values(safeData);

      console.log("...............Process ends...............");

      res.status(200).json({
        success: true,
        attachments: attachments.length,
        urls,
        label,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

app.get("/", (req, res)=> {
  res.send("Server running...");
})

// -----------------------------
// 🚀 Start Server
// -----------------------------
app.listen(3000, () => console.log("Server running on port 3000"));