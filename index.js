import express from "express";
const app = express();

app.use(express.urlencoded({ extended: true }));

app.post("/email", (req, res) => {
  //const { from, subject, text, html } = req.body;
  console(req.body);
  //console.log("From:", from);
  //console.log("Subject:", subject);
  //console.log("Body:", text);

  // 👉 Add your tagging logic here

  res.status(200).send("OK");
});

app.listen(3000, () => console.log("Server running"));