const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Capability Map Backend v1.0 - TEST',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Backend çalışıyor!',
    apps_count: 500,  // Gelecek Excel verisi
    ready_for_excel: true
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Backend http://localhost:${PORT}`);
  console.log(`Test et: http://localhost:${PORT}/health`);
});
