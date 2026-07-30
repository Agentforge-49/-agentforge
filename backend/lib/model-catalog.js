export const MODEL_CATALOG = Object.freeze({
  'claude-sonnet-4-6':{
    provider:'anthropic',
    label:'Claude Sonnet 4.6',
    estimatedCostPerMillionTokens:9,
  },
  'claude-opus-4-6':{
    provider:'anthropic',
    label:'Claude Opus 4.6',
    estimatedCostPerMillionTokens:45,
  },
  'gpt-5.6-sol':{
    provider:'openai',
    label:'GPT-5.6 Sol',
    estimatedCostPerMillionTokens:30,
  },
  'gpt-5.6-terra':{
    provider:'openai',
    label:'GPT-5.6 Terra',
    estimatedCostPerMillionTokens:15,
  },
  'gpt-5.6-luna':{
    provider:'openai',
    label:'GPT-5.6 Luna',
    estimatedCostPerMillionTokens:6,
  },
  'gemini-3.5-flash':{
    provider:'google',
    label:'Gemini 3.5 Flash',
    estimatedCostPerMillionTokens:9,
  },
});

export const SUPPORTED_MODEL_IDS = Object.freeze(Object.keys(MODEL_CATALOG));
export const SUPPORTED_MODELS = new Set(SUPPORTED_MODEL_IDS);

export function modelProvider(model) {
  return MODEL_CATALOG[model]?.provider || null;
}
