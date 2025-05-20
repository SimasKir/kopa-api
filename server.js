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

let dataStore = {
  women: [],
  men: [],
  mix: []
};

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
  if (group) {
    if (!dataStore[group]) {
      return res.status(400).json({ error: 'Invalid group' });
    }
    return res.json(dataStore[group]);
  }
  res.json(dataStore);
});

// POST /add
app.post('/add', validateApiKey, async (req, res) => {
  const { group, name } = req.body;

  if (!group || !dataStore[group]) {
    return res.status(400).json({ error: 'Invalid or missing group' });
  }

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Name is required and must be a string' });
  }

  const allItems = Object.values(dataStore).flat();
  const usedIds = allItems.map(item => item.id);
  const nextId = usedIds.length > 0 ? Math.max(...usedIds) + 1 : 1;

  const groupItems = dataStore[group];
  const nextValue = groupItems.length > 0 ? Math.max(...groupItems.map(i => i.value)) + 1 : 1;

  const newItem = {
    id: nextId,
    name,
    value: nextValue
  };

  dataStore[group].push(newItem);

  await syncDataStoreToSupabase(dataStore);

  clients.forEach(client => client.write(`data: ${JSON.stringify(dataStore)}\n\n`));

  res.json({ success: true, item: newItem });
});

// /delete
app.delete('/delete/:id', validateApiKey, async (req, res) => {
  const idToDelete = parseInt(req.params.id, 10);

  if (isNaN(idToDelete)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  let deletedItem = null;
  let groupFound = null;

  for (const group in dataStore) {
    const index = dataStore[group].findIndex(item => item.id === idToDelete);
    if (index !== -1) {
      deletedItem = dataStore[group].splice(index, 1)[0];
      groupFound = group;

      const deletedValue = deletedItem.value;

      dataStore[group] = dataStore[group].map(item => {
        if (item.value > deletedValue) {
          return { ...item, value: item.value - 1 };
        }
        return item;
      });

      break;
    }
  }

  if (!deletedItem) {
    return res.status(404).json({ error: 'Item not found' });
  }

  await syncDataStoreToSupabase(dataStore);
  clients.forEach(client => client.write(`data: ${JSON.stringify(dataStore)}\n\n`));

  res.json({ success: true, deleted: deletedItem, group: groupFound });
});

// update group
app.post('/update', validateApiKey, async (req, res) => {
  const { group, items } = req.body;

  if (!group || !dataStore[group]) {
    return res.status(400).json({ error: 'Invalid or missing group' });
  }

  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Items must be an array' });
  }

  for (const item of items) {
    if (
      typeof item.id !== 'number' ||
      typeof item.name !== 'string' ||
      typeof item.value !== 'number'
    ) {
      return res.status(400).json({
        error: 'Each item must have numeric id, string name, and numeric value',
        invalidItem: item
      });
    }
  }

  dataStore[group] = items;

  await syncDataStoreToSupabase(dataStore);

  clients.forEach(client => client.write(`data: ${JSON.stringify(dataStore)}\n\n`));

  res.json({ success: true, updated: group, count: items.length });
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
