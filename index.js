import express from "express";
import multer from "multer";
const app = express();

app.use(express.urlencoded({ extended: true }));
const upload = multer();

app.post("/email", async (req, res) => {
  // const { from, subject, text, html } = req.body;

  const payload = {
    text : req.body.email
  }
  const result = await fetch("https://ml-model-us52.onrender.com/detech", {
    method : "POST",
    body : JSON.stringify(payload)
  });

  // 👉 Add your tagging logic here
  console.log(result);
  res.status(200).json("OK");
});

app.listen(3000, () => console.log("Server running"));