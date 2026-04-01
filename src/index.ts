import express from "express";
import type { Request, Response } from "express";
import multer from "multer";
import dotenv from "dotenv";
dotenv.config();
const app = express();
import { db } from "./config.js";
import { emailTable } from "./db/schema.js";

app.use(express.urlencoded({ extended: true }));
const upload = multer();

type EmailBody = {
  from: string;
  to: string;
  subject?: string;
  email: string;
};

app.get("/emails", async (req: Request, res: Response) => {
  try {
    const emails = await db.select().from(emailTable);

    res.status(200).json({
      success: true,
      count: emails.length,
      data: emails
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch emails"
    });
  }
});

app.post("/email", upload.any(), async (req: Request<{}, {}, EmailBody>, res: Response) => {
  try {
    const { from, to, subject, email } = req.body;
    if (!from || !to || !email) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const payload = {
      text : email || ""
    }

    const result = await fetch("https://ml-model-us52.onrender.com/detect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!result.ok) {
      throw new Error("ML service failed");
    }

    const data = await result.json(); 

    const safeData = {
      from,
      to,
      subject: subject ?? "",
      raw: email,
      label: data?.prediction ?? "unknown"
    };

    await db.insert(emailTable).values(safeData);

    res.status(200).json("OK");
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(3000, () => console.log("Server running"));