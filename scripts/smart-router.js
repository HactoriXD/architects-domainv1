/**
 * Smart Router Module
 * Intelligent model selection and routing for Architect's Domain
 * 
 * Features:
 * - Automatic best-model selection based on task type
 * - Cost-aware routing
 * - Context window awareness
 * - Per-chat model overrides
 * - Fallback logic
 */

class SmartRouter {
  constructor() {
    this.providers = {
      openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
      deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com' },
      venice: { name: 'Venice.ai', baseUrl: 'https://api.venice.ai' }
    };
    
    this.taskKeywords = {
      coding: ['code', 'function', 'debug', 'refactor', 'algorithm', 'typescript', 'python', 'javascript'],
      reasoning: ['think', 'analyze', 'reason', 'step by step', 'logic', 'prove'],
      creative: ['story', 'character', 'write', 'poem', 'creative', 'imagine', 'roleplay'],
      research: ['research', 'summarize', 'explain', 'compare', 'facts', 'study'],
      vision: ['image', 'analyze image', 'describe', 'vision', 'screenshot']
    };
  }

  /**
   * Detect task type from prompt
   */
  detectTaskType(prompt) {
    const lower = prompt.toLowerCase();
    
    for (const [type, keywords] of Object.entries(this.taskKeywords)) {
      if (keywords.some(kw => lower.includes(kw))) {
        return type;
      }
    }
    return 'general';
  }

  /**
   * Get recommended model for a given task and provider
   * (This is a starting point - in production this would query real model lists + pricing)
   */
  getRecommendedModel(provider, taskType, contextLength = 8000) {
    const recommendations = {
      openrouter: {
        coding: 'anthropic/claude-3.5-sonnet',
        reasoning: 'openai/o1-preview',
        creative: 'anthropic/claude-3.5-sonnet',
        research: 'openai/gpt-4o',
        vision: 'openai/gpt-4o',
        general: 'meta-llama/llama-3.1-70b-instruct'
      },
      deepseek: {
        coding: 'deepseek-chat',
        reasoning: 'deepseek-reasoner',
        creative: 'deepseek-chat',
        research: 'deepseek-chat',
        vision: 'deepseek-chat',
        general: 'deepseek-chat'
      },
      venice: {
        coding: 'llama-3.1-70b',
        reasoning: 'llama-3.1-70b',
        creative: 'llama-3.1-70b',
        research: 'llama-3.1-70b',
        vision: 'llama-3.1-70b',
        general: 'llama-3.1-70b'
      }
    };

    return recommendations[provider]?.[taskType] || recommendations[provider]?.general || 'default-model';
  }

  /**
   * Calculate estimated cost (simplified)
   */
  estimateCost(provider, model, inputTokens, outputTokens) {
    // Rough pricing per 1M tokens (update with real data)
    const pricing = {
      'openai/gpt-4o': { input: 2.5, output: 10 },
      'anthropic/claude-3.5-sonnet': { input: 3, output: 15 },
      'deepseek-chat': { input: 0.14, output: 0.28 },
      'meta-llama/llama-3.1-70b-instruct': { input: 0.9, output: 0.9 }
    };

    const price = pricing[model] || { input: 1, output: 3 };
    return ((inputTokens * price.input) + (outputTokens * price.output)) / 1000000;
  }

  /**
   * Main routing function
   */
  route(prompt, currentProvider, options = {}) {
    const taskType = this.detectTaskType(prompt);
    const recommendedModel = this.getRecommendedModel(currentProvider, taskType, options.contextLength);
    
    return {
      taskType,
      recommendedModel,
      provider: currentProvider,
      reason: `Best for ${taskType} tasks on ${currentProvider}`,
      confidence: 0.85
    };
  }

  /**
   * Check if model supports vision
   */
  supportsVision(model) {
    return model.includes('gpt-4o') || model.includes('claude-3') || model.includes('llava');
  }
}

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SmartRouter;
} else {
  window.SmartRouter = SmartRouter;
}