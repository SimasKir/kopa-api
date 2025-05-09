const supabase = require('./supabaseClient');

async function syncDataStoreToSupabase(dataStore) {
  const content = JSON.stringify(dataStore, null, 2);
  const fileName = 'data-mirror.json';

  const { data, error } = await supabase.storage
    .from(process.env.SUPABASE_BUCKET)
    .upload(fileName, content, {
      upsert: true,
      contentType: 'application/json'
    });

  if (error) {
    console.error('Sync failed:', error.message);
    return null;
  }

  console.log('Data mirror updated in Supabase Storage:', data.path);
  return data.path;
}

async function loadDataStoreFromSupabase() {
  const { data, error } = await supabase.storage
    .from(process.env.SUPABASE_BUCKET)
    .download('data-mirror.json');

  if (error) {
    console.error('Load failed:', error.message);
    return [];
  }

  const text = await data.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error('Failed to parse JSON from Supabase:', err);
    return [];
  }
}

module.exports = {
    syncDataStoreToSupabase,
    loadDataStoreFromSupabase
  };