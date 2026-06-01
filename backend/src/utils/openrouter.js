const { query } = require('../models/database');
const { decrypt } = require('./crypto');

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
const FALLBACK_MODEL = 'deepseek/deepseek-chat-v3.1:free';

// Reasoning-emitting free-tier models that frequently return empty content
// because tokens are consumed by hidden reasoning_content. Surface-content only
// non-reasoning models are required for admin/customer chat reliability.
const REASONING_MODEL_PATTERNS = [
  /deepseek-r1/i,
  /qwen.*thinking/i,
  /glm.*reasoner/i,
  /o1-(preview|mini)/i,
];

const MAX_TOKEN_ESCALATION_CAP = 4000;
const MAX_RETRY_ATTEMPTS = 3;

function isReasoningModel(modelId) {
  if (typeof modelId !== 'string') return false;
  return REASONING_MODEL_PATTERNS.some((pattern) => pattern.test(modelId));
}

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

async function chatCompletion({
  model,
  messages,
  maxTokens = 300,
  agent = 'customer',
  _attempt = 0,
}) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY_NOT_CONFIGURED');
  }

  const config = await getModelConfig();
  const fallbackModel = config.fallback || FALLBACK_MODEL;
  let selectedModel = model || config[agent] || DEFAULT_MODEL;

  // Pre-flight reasoning-model guard: free-tier reasoning models consume tokens
  // in hidden reasoning_content and frequently return empty surface content.
  if (isReasoningModel(selectedModel)) {
    const safeFallback = isReasoningModel(fallbackModel) ? DEFAULT_MODEL : fallbackModel;
    console.warn(
      `Reasoning model blacklisted: ${selectedModel} → switching to ${safeFallback} (admin/customer chat requires surface content)`
    );
    selectedModel = safeFallback;
  }

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
    console.error('OpenRouter API error:', {
      status: response.status,
      model: selectedModel,
      attempt: _attempt,
      bodyPreview: errorBody.slice(0, 500),
    });

    if (
      (response.status === 429 || response.status >= 500) &&
      selectedModel !== fallbackModel &&
      _attempt < MAX_RETRY_ATTEMPTS
    ) {
      console.log(`Retrying with fallback model: ${fallbackModel} (attempt ${_attempt + 1})`);
      return chatCompletion({
        model: fallbackModel,
        messages,
        maxTokens,
        agent,
        _attempt: _attempt + 1,
      });
    }

    const err = new Error(`OpenRouter API error: ${response.status}`);
    err.upstreamStatus = response.status;
    err.upstreamModel = selectedModel;
    err.upstreamBody = errorBody;
    throw err;
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  const message = choice?.message;
  const raw = message?.content;
  const finishReason = choice?.finish_reason;
  const promptTokens = data.usage?.prompt_tokens;
  const completionTokens = data.usage?.completion_tokens;

  const isEmpty = typeof raw !== 'string' || raw.trim().length === 0;

  if (isEmpty) {
    console.error('OpenRouter empty content:', {
      model: selectedModel,
      finishReason,
      promptTokens,
      completionTokens,
      hasReasoning: Boolean(message?.reasoning_content),
      choicesLen: Array.isArray(data.choices) ? data.choices.length : 0,
      attempt: _attempt,
      maxTokens,
    });

    // STRATEGY 1: finish_reason=length → escalate max_tokens and retry same model
    if (
      finishReason === 'length' &&
      maxTokens < MAX_TOKEN_ESCALATION_CAP &&
      _attempt < MAX_RETRY_ATTEMPTS
    ) {
      const escalatedMaxTokens = Math.min(maxTokens * 2, MAX_TOKEN_ESCALATION_CAP);
      console.log(
        `finish_reason=length → escalating max_tokens ${maxTokens} → ${escalatedMaxTokens} on ${selectedModel} (attempt ${_attempt + 1})`
      );
      return chatCompletion({
        model: selectedModel,
        messages,
        maxTokens: escalatedMaxTokens,
        agent,
        _attempt: _attempt + 1,
      });
    }

    // STRATEGY 2: switch to fallback model if not already using it
    if (
      selectedModel !== fallbackModel &&
      !isReasoningModel(fallbackModel) &&
      _attempt < MAX_RETRY_ATTEMPTS
    ) {
      console.log(
        `Empty content on ${selectedModel} → retrying with fallback ${fallbackModel} (attempt ${_attempt + 1})`
      );
      return chatCompletion({
        model: fallbackModel,
        messages,
        maxTokens,
        agent,
        _attempt: _attempt + 1,
      });
    }

    // STRATEGY 3: exhausted retries → surface actionable error
    const reasonHint =
      finishReason === 'length'
        ? 'el modelo necesitó más tokens de los permitidos (limite alcanzado tras escalado). Intenta una pregunta más corta o reinicia la conversación.'
        : `finish_reason=${finishReason || 'unknown'}`;
    const err = new Error(`OpenRouter returned empty content: ${reasonHint}`);
    err.upstreamStatus = 200;
    err.upstreamModel = selectedModel;
    err.upstreamBody = JSON.stringify({
      finishReason,
      promptTokens,
      completionTokens,
      attempts: _attempt + 1,
      maxTokens,
    });
    err.finishReason = finishReason;
    throw err;
  }

  return raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

module.exports = {
  chatCompletion,
  getApiKey,
  getModelConfig,
  saveModelConfig,
  fetchAvailableModels,
  isReasoningModel,
  DEFAULT_MODEL,
  FALLBACK_MODEL,
};
