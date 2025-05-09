const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

require('dotenv').config();

const backupDir = path.join(__dirname, 'backups');

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir);
}

function validateApiKey(req, res, next) {
  const providedKey = req.headers['x-api-key'];
  console.log(providedKey);
  console.log(process.env.API_KEY);
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

function backupDataToFile() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFilePath = path.join(backupDir, `data-backup-${timestamp}.json`);
    
    try {
      fs.copyFileSync(dataFilePath, backupFilePath);
      console.log(`Backup created at ${backupFilePath}`);
  
      // Safely read backup files
      let files = fs.readdirSync(backupDir).filter(file => file.startsWith('data-backup-'));
  
      if (!Array.isArray(files)) {
        console.error('Backup directory read failed or returned non-array');
        return;
      }
  
      files.sort().reverse();  // Newest first
      const filesToDelete = files.slice(5);  // Keep the latest 5
  
      filesToDelete.forEach(file => {
        const filePath = path.join(backupDir, file);
        try {
          fs.unlinkSync(filePath);
          console.log(`Deleted old backup: ${filePath}`);
        } catch (deleteErr) {
          console.error(`Failed to delete ${filePath}:`, deleteErr);
        }
      });
  
    } catch (err) {
      console.error('Failed to create or manage backups:', err);
    }
  }  

let clients = [];

app.get('/data', validateApiKey, (req, res) => {
  res.json(dataStore);
});

app.post('/update', validateApiKey, (req, res) => {
  const { id, name, value, group } = req.body;
  const index = dataStore.findIndex(d => d.id === id);
  if (index >= 0) {
    dataStore[index] = { id, name, value, group };
  } else {
    dataStore.push({ id, name, value, group });
  }

  saveDataToFile();
  clients.forEach(client => client.write(`data: ${JSON.stringify(dataStore)}\n\n`));
  res.json({ success: true });
});

app.post('/append', validateApiKey, (req, res) => {
    const { name, value, group } = req.body;
  
    const nextId = dataStore.length > 0
      ? dataStore[dataStore.length - 1].id + 1 
      : 1;
  
    const newItem = { id: nextId, name, value, group };
    dataStore.push(newItem);
  
    saveDataToFile();
    clients.forEach(client => client.write(`data: ${JSON.stringify(dataStore)}\n\n`));
    res.json({ success: true, item: newItem });
  });

app.get('/events', (req, res) => {
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

  app.delete('/delete/:id', validateApiKey, (req, res) => {
    const idToDelete = parseInt(req.params.id, 10);
    const index = dataStore.findIndex(item => item.id === idToDelete);
  
    if (index === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }
  
    const deletedItem = dataStore.splice(index, 1)[0];
    saveDataToFile();
    clients.forEach(client => client.write(`data: ${JSON.stringify(dataStore)}\n\n`));
  
    res.json({ success: true, deleted: deletedItem });
  });

  setInterval(backupDataToFile, 30 * 60 * 1000);

  app.listen(PORT, (err) => {
    if (err) {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
    console.log(`Server running at http://localhost:${PORT}`);
  });