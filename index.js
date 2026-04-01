import express from "express";
import multer from "multer";
const app = express();

app.use(express.urlencoded({ extended: true }));
const upload = multer();

app.post("/email", upload.any(), async (req, res) => {
  try {
    const { from, to, subject, html, email, text } = req.body;
    // console.log("from", from),
    // console.log("to", to);
    // console.log("subject", subject);
    // console.log("html", html);
    // console.log("email", email);
    console.log("email type", typeof email);
    console.log("text", text);

    const payload = {
      text : email || text || ""
    }

    const result = await fetch("https://ml-model-us52.onrender.com/detect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    // 👉 Add your tagging logic here
    const data = await result.json(); // 👈 VERY IMPORTANT
    console.log("ML Response:", data);
    res.status(200).json("OK");
    
  } catch (error) {
    console.error(error);
  }
  
});

app.listen(3000, () => console.log("Server running"));