require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { syncDataStoreToSupabase, loadDataStoreFromSupabase } = require('./lib/syncDataStore');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

function validateApiKey(req, res, next) {
  const providedKey = req.headers['x-api-key'];
  if (providedKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

let dataStore = [];
let clients = [];

(async () => {
  try {
    dataStore = await loadDataStoreFromSupabase();
    console.log('Data loaded from Supabase Storage');

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });

  } catch (err) {
    console.error('Failed to load data:', err);
    process.exit(1);
  }
})();

// GET /data
app.get('/data', validateApiKey, (req, res) => {
  const { group } = req.query;
  if (group) return res.json(dataStore.filter(item => item.group === group));
  res.json(dataStore);
});

// POST /append
app.post('/append', validateApiKey, async (req, res) => {
  const { name, position, group } = req.body;
  if (!group) return res.status(400).json({ error: 'Group is required' });
  if (typeof position !== 'number') return res.status(400).json({ error: 'Position must be a number' });

  const nextId = dataStore.length > 0 ? dataStore[dataStore.length - 1].id + 1 : 1;
  const newItem = { id: nextId, name, position, group };
  dataStore.push(newItem);

  await syncDataStoreToSupabase(dataStore);
  clients.forEach(client => client.write(`data: ${JSON.stringify(dataStore)}\n\n`));
  res.json({ success: true, item: newItem });
});

// POST /update
app.post('/update', validateApiKey, async (req, res) => {
  const { id, name, position, group } = req.body;
  if (!group) return res.status(400).json({ error: 'Group is required' });
  if (typeof position !== 'number') return res.status(400).json({ error: 'Position must be a number' });

  const index = dataStore.findIndex(d => d.id === id);
  if (index >= 0) {
    dataStore[index] = { id, name, position, group };
  } else {
    dataStore.push({ id, name, position, group });
  }

  await syncDataStoreToSupabase(dataStore);

  clients.forEach(client => client.write(`data: ${JSON.stringify(dataStore)}\n\n`));
  res.json({ success: true });
});

// DELETE /delete/:id
app.delete('/delete/:id', validateApiKey, async (req, res) => {
  const idToDelete = parseInt(req.params.id, 10);
  const index = dataStore.findIndex(item => item.id === idToDelete);

  if (index === -1) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const deletedItem = dataStore.splice(index, 1)[0];
  await syncDataStoreToSupabase(dataStore);

  clients.forEach(client => client.write(`data: ${JSON.stringify(dataStore)}\n\n`));
  res.json({ success: true, deleted: deletedItem });
});

// GET /events
app.get('/events', (req, res) => {
  const providedKey = req.query.apiKey;
  if (providedKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
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
