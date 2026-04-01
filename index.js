import express from "express";
import multer from "multer";
const app = express();

app.use(express.urlencoded({ extended: true }));
const upload = multer();

app.post("/email", upload.any(), async (req, res) => {
  try {
    const { from, to, subject, html, email } = req.body;
    console.log("from", from),
    console.log("to", to);
    console.log("subject", subject);
    console.log("html", html);
    console.log("email", email);

    const payload = {
      text : email
    }
    const result = await fetch("https://ml-model-us52.onrender.com/detect", {
      method : "POST",
      body : JSON.stringify(payload)
    });

    // 👉 Add your tagging logic here
    console.log(result);
    res.status(200).json("OK");
    
  } catch (error) {
    console.error(error);
  }
  
});

app.listen(3000, () => console.log("Server running"));