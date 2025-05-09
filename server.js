const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

require('dotenv').config();

function validateApiKey(req, res, next) {
  const providedKey = req.headers['x-api-key'];
  if (providedKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

const dataFilePath = path.join(__dirname, 'data.json');

let dataStore = [];
try {
  if (fs.existsSync(dataFilePath)) {
    dataStore = JSON.parse(fs.readFileSync(dataFilePath, 'utf-8'));
  }
} catch (error) {
  console.error('Failed to load data:', error);
  dataStore = [];
}

function saveDataToFile() {
  fs.writeFileSync(dataFilePath, JSON.stringify(dataStore, null, 2));
}

let clients = [];

app.get('/data', validateApiKey, (req, res) => {
  res.json(dataStore);
});

app.post('/update', validateApiKey, (req, res) => {
  const { id, name, value } = req.body;
  const index = dataStore.findIndex(d => d.id === id);
  if (index >= 0) {
    dataStore[index] = { id, name, value };
  } else {
    dataStore.push({ id, name, value });
  }

  saveDataToFile();
  clients.forEach(client => client.write(`data: ${JSON.stringify(dataStore)}\n\n`));
  res.json({ success: true });
});

app.post('/append', validateApiKey, (req, res) => {
  const { id, name, value } = req.body;
  const exists = dataStore.some(d => d.id === id);
  if (exists) {
    return res.status(400).json({ error: 'ID already exists. Use /update to modify.' });
  }

  dataStore.push({ id, name, value });

  saveDataToFile();
  clients.forEach(client => client.write(`data: ${JSON.stringify(dataStore)}\n\n`));
  res.json({ success: true });
});

app.get('/events', validateApiKey, (req, res) => {
    const providedKey = req.query.apiKey;
    if (providedKey !== process.env.API_KEY) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
  
    res.write(`data: ${JSON.stringify(dataStore)}\n\n`);
    clients.push(res);
  
    req.on('close', () => {
      clients = clients.filter(client => client !== res);
    });
  });

// Start the server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});