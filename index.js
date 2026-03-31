import express from "express";
import multer from "multer";
const app = express();

app.use(express.urlencoded({ extended: true }));
const upload = multer();

app.post("/email", upload.any(), (req, res) => {
  //const { from, subject, text, html } = req.body;
  console.log(req);
  //console.log("From:", from);
  //console.log("Subject:", subject);
  //console.log("Body:", text);

  // 👉 Add your tagging logic here

  res.status(200).send("OK");
});

app.listen(3000, () => console.log("Server running"));