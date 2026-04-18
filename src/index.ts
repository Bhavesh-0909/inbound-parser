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

type VTStats = {
  malicious?: number;
  suspicious?: number;
};

function calculateSpamScore({
  mlLabel,
  urlResults,
  fileResults,
  urls,
  attachments,
  content,
}: {
  mlLabel: string;
  urlResults: (VTStats | null)[];
  fileResults: (VTStats | null)[];
  urls: string[];
  attachments: any[];
  content: string;
}) {
  let score = 0;

  // -----------------------------
  // 🤖 ML Score
  // -----------------------------
  if (mlLabel === "spam") score += 50;

  // -----------------------------
  // 🔗 URL Score
  // -----------------------------
  for (const result of urlResults) {
    if (!result) continue;
    score += (result.malicious || 0) * 20;
    score += (result.suspicious || 0) * 10;
  }

  // -----------------------------
  // 📎 File Score
  // -----------------------------
  for (const result of fileResults) {
    if (!result) continue;
    score += (result.malicious || 0) * 25;
    score += (result.suspicious || 0) * 10;
  }

  // -----------------------------
  // ⚠️ Heuristics
  // -----------------------------
  if (urls.length > 3) score += 10;
  if (attachments.length > 2) score += 10;

  const lower = content.toLowerCase();
  if (lower.includes("urgent") || lower.includes("winner") || lower.includes("free")) {
    score += 5;
  }

  // -----------------------------
  // 🎯 Final Label
  // -----------------------------
  let finalLabel = "ham";

  if (score >= 40) finalLabel = "spam";
  else if (score >= 30) finalLabel = "suspicious";

  return {
    score,
    finalLabel,
  };
}

const VT_API_KEY = process.env.VIRUSTOTAL_API_KEY!;
const VT_BASE = "https://www.virustotal.com/api/v3";

// -----------------------------
// 🔗 Scan URL
// -----------------------------
async function scanUrl(url: string) {
  try {
    // Step 1: submit URL
    const formData = new URLSearchParams();
    formData.append("url", url);

    const submitRes = await fetch(`${VT_BASE}/urls`, {
      method: "POST",
      headers: {
        "x-apikey": VT_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
    });

    const submitData = await submitRes.json();
    const analysisId = submitData.data.id;

    // Step 2: fetch report
    const reportRes = await fetch(`${VT_BASE}/analyses/${analysisId}`, {
      headers: { "x-apikey": VT_API_KEY },
    });

    const report = await reportRes.json();

    return report?.data?.attributes?.stats || {};
  } catch (err) {
    console.error("❌ URL scan failed:", err);
    return null;
  }
}

// -----------------------------
// 📎 Scan File
// -----------------------------
async function scanFile(file: Express.Multer.File) {
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(file.buffer)]), file.originalname);

    const res = await fetch(`${VT_BASE}/files`, {
      method: "POST",
      headers: {
        "x-apikey": VT_API_KEY,
      },
      body: form,
    });

    const data = await res.json();
    const analysisId = data.data.id;

    // Fetch report
    const reportRes = await fetch(`${VT_BASE}/analyses/${analysisId}`, {
      headers: { "x-apikey": VT_API_KEY },
    });

    const report = await reportRes.json();

    return report?.data?.attributes?.stats || {};
  } catch (err) {
    console.error("❌ File scan failed:", err);
    return null;
  }
}

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

      const urlScanResults = await Promise.all(
        urls.map((url) => scanUrl(url))
      );

      const fileScanResults = await Promise.all(
        attachments.map((file) => scanFile(file))
      );


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

      const { score, finalLabel } = calculateSpamScore({
        mlLabel: label,
        urlResults: urlScanResults,
        fileResults: fileScanResults,
        urls,
        attachments,
        content,
      });

      console.log("🧠 Final Score:", score);
      console.log("🚨 Final Label:", finalLabel);

      // -----------------------------
      // 💾 Save to DB
      // -----------------------------
      const safeData = {
        from,
        to,
        subject: subject ?? "",
        raw: content, // ✅ store clean content instead of raw MIME
        label: finalLabel,
        score
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