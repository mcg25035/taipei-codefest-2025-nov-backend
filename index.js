const express = require('express');
const app = express();
const cors = require("cors"); // 導入 cors 中間件

app.use(cors()); // 配置 cors 中間件

app.use(express.json());

const PORT = 5121;

app.get('/', (req, res) => {
  res.json({ message: 'Hello, World!' });
});

let counter=0;
app.put('/interact', (req, res) => {
  if (!req.body.lng) {
    return res.status(400).json({ error: 'Missing required parameter: lng' });
  }
  if (!req.body.lat) {
    return res.status(400).json({ error: 'Missing required parameter: lat' });
  }

  counter++;
  counter%=5;
  if (counter) {
    res.json({ message: '', lng: req.body.lng, lat: req.body.lat });
  } else {
    res.json({ message: 'Interaction received', lng: req.body.lng, lat: req.body.lat });
  }

});


app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
