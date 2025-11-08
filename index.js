const express = require('express');
const app = express();
const PORT = 5121;

app.get('/', (req, res) => {
  res.send('hello world');
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
