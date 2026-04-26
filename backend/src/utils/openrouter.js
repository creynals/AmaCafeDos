const { query } = require('../models/database');
const { decrypt } = require('./crypto');

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const DEFAULT_MODEL = 'qwen/qwen3.6-plus:free';
const FALLBACK_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';

async function getApiKey() {
  const { rows } = await query('SELECT value FROM settings WHERE key = $1', ['openrouter_api_key']);
  if (rows.length === 0) return null;
  return decrypt(rows[0].value);
}

async function getModelConfig() {
  const { rows: customerRow } = await query('SELECT value FROM settings WHERE key = $1', ['model_customer']);
  const { rows: adminRow } = await query('SELECT value FROM settings WHERE key = $1', ['model_admin']);
  const { rows: fallbackRow } = await query('SELECT value FROM settings WHERE key = $1', ['model_fallback']);

  return {
    customer: customerRow[0] ? customerRow[0].value : DEFAULT_MODEL,
    admin: adminRow[0] ? adminRow[0].value : DEFAULT_MODEL,
    fallback: fallbackRow[0] ? fallbackRow[0].value : FALLBACK_MODEL,
  };
}

async function saveModelConfig(agent, model) {
  const key = `model_${agent}`;
  await query(`
    INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = NOW()
  `, [key, model]);
}

async function fetchAvailableModels() {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY_NOT_CONFIGURED');
  }

  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`OpenRouter models API error: ${response.status}`);
  }

  const data = await response.json();

  const freeModels = data.data
    .filter(m => m.id.endsWith(':free'))
    .map(m => ({
      id: m.id,
      name: m.name,
      context_length: m.context_length,
      description: m.description || '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return freeModels;
}

async function chatCompletion({ model, messages, maxTokens = 300, agent = 'customer' }) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY_NOT_CONFIGURED');
  }

  const config = await getModelConfig();
  const selectedModel = model || config[agent] || DEFAULT_MODEL;
  const fallbackModel = config.fallback || FALLBACK_MODEL;

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://amacafe.cl',
      'X-Title': 'AMA Cafe',
    },
    body: JSON.stringify({
      model: selectedModel,
      messages,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('OpenRouter API error:', response.status, errorBody);

    if ((response.status === 429 || response.status >= 500) && selectedModel !== fallbackModel) {
      console.log(`Retrying with fallback model: ${fallbackModel}`);
      return chatCompletion({ model: fallbackModel, messages, maxTokens, agent });
    }

    throw new Error(`OpenRouter API error: ${response.status}`);
  }

  const data = await response.json();
  const raw = data.choices[0].message.content;
  return raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

module.exports = { chatCompletion, getApiKey, getModelConfig, saveModelConfig, fetchAvailableModels, DEFAULT_MODEL, FALLBACK_MODEL };
