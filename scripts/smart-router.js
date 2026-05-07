/**
 * Smart Router v0.2 - Fully Integrated
 * Real-time prompt analysis, model recommendation, and cost estimation
 */

class SmartRouter {
  constructor() {
    this.providers = {
      openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
      deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com' },
      venice: { name: 'Venice.ai', baseUrl: 'https://api.venice.ai' },
      local: { name: 'Local', baseUrl: 'http://localhost:11434' }
    };

    this.taskKeywords = {
      coding: ['code', 'function', 'debug', 'refactor', 'algorithm', 'typescript', 'python', 'javascript', 'bug', 'fix'],
      reasoning: ['think', 'analyze', 'reason', 'step by step', 'logic', 'prove', 'why', 'explain'],
      creative: ['story', 'character', 'write', 'poem', 'creative', 'imagine', 'roleplay', 'scene'],
      research: ['research', 'summarize', 'explain', 'compare', 'facts', 'study', 'paper'],
      vision: ['image', 'analyze image', 'describe', 'vision', 'screenshot', 'photo']
    };

    this.modelDatabase = {
      openrouter: {
        coding: { model: 'anthropic/claude-3.5-sonnet', context: '200k', costPer1k: 0.003 },
        reasoning: { model: 'openai/o1-preview', context: '128k', costPer1k: 0.015 },
        creative: { model: 'anthropic/claude-3.5-sonnet', context: '200k', costPer1k: 0.003 },
        research: { model: 'openai/gpt-4o', context: '128k', costPer1k: 0.0025 },
        vision: { model: 'openai/gpt-4o', context: '128k', costPer1k: 0.0025 },
        general: { model: 'meta-llama/llama-3.1-70b-instruct', context: '128k', costPer1k: 0.0009 }
      },
      deepseek: {
        coding: { model: 'deepseek-chat', context: '64k', costPer1k: 0.00014 },
        reasoning: { model: 'deepseek-reasoner', context: '64k', costPer1k: 0.00055 },
        creative: { model: 'deepseek-chat', context: '64k', costPer1k: 0.00014 },
        research: { model: 'deepseek-chat', context: '64k', costPer1k: 0.00014 },
        vision: { model: 'deepseek-chat', context: '64k', costPer1k: 0.00014 },
        general: { model: 'deepseek-chat', context: '64k', costPer1k: 0.00014 }
      },
      venice: {
        coding: { model: 'llama-3.1-70b', context: '128k', costPer1k: 0.0009 },
        reasoning: { model: 'llama-3.1-70b', context: '128k', costPer1k: 0.0009 },
        creative: { model: 'llama-3.1-70b', context: '128k', costPer1k: 0.0009 },
        research: { model: 'llama-3.1-70b', context: '128k', costPer1k: 0.0009 },
        vision: { model: 'llama-3.1-70b', context: '128k', costPer1k: 0.0009 },
        general: { model: 'llama-3.1-70b', context: '128k', costPer1k: 0.0009 }
      },
      local: {
        coding: { model: 'llama3.1:8b', context: '8k', costPer1k: 0 },
        reasoning: { model: 'llama3.1:8b', context: '8k', costPer1k: 0 },
        creative: { model: 'llama3.1:8b', context: '8k', costPer1k: 0 },
        research: { model: 'llama3.1:8b', context: '8k', costPer1k: 0 },
        vision: { model: 'llava', context: '8k', costPer1k: 0 },
        general: { model: 'llama3.1:8b', context: '8k', costPer1k: 0 }
      }
    };
  }

  detectTaskType(prompt) {
    const lower = prompt.toLowerCase();
    for (const [type, keywords] of Object.entries(this.taskKeywords)) {
      if (keywords.some(kw => lower.includes(kw))) return type;
    }
    return 'general';
  }

  getRecommendation(provider, taskType) {
    const db = this.modelDatabase[provider] || this.modelDatabase.openrouter;
    return db[taskType] || db.general;
  }

  estimateCost(modelInfo, inputTokens = 500, outputTokens = 800) {
    if (modelInfo.costPer1k === 0) return 0;
    const inputCost = (inputTokens / 1000) * modelInfo.costPer1k;
    const outputCost = (outputTokens / 1000) * modelInfo.costPer1k * 1.5;
    return (inputCost + outputCost).toFixed(4);
  }

  route(prompt, currentProvider = 'openrouter', options = {}) {
    const taskType = this.detectTaskType(prompt);
    const recommendation = this.getRecommendation(currentProvider, taskType);
    const estimatedCost = this.estimateCost(recommendation, options.inputTokens || 600, options.outputTokens || 900);

    return {
      taskType,
      recommendedModel: recommendation.model,
      contextWindow: recommendation.context,
      estimatedCost: estimatedCost,
      provider: currentProvider,
      reason: `Best for ${taskType} tasks`,
      confidence: 0.87
    };
  }

  // Global helper for easy integration
  suggestForPrompt(prompt, currentProvider) {
    if (!prompt || prompt.trim().length < 10) return null;
    return this.route(prompt, currentProvider);
  }
}

// Make globally available
if (typeof window !== 'undefined') {
  window.SmartRouter = new SmartRouter();
  console.log('%c[Smart Router] v0.2 integrated and ready', 'color:#8b5cf6');
}