/**
 * Local Models Module - Real Ollama / LM Studio Support
 * Detects and connects to local AI servers running on localhost
 */

class LocalModels {
  constructor() {
    this.ollamaUrl = 'http://localhost:11434';
    this.lmStudioUrl = 'http://localhost:1234';
    this.detectedModels = [];
    this.isConnected = false;
    this.currentUrl = null;
  }

  /**
   * Detect available local models (tries Ollama first, then LM Studio)
   */
  async detectModels() {
    this.detectedModels = [];
    this.isConnected = false;

    // Try Ollama first (most common)
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.models && data.models.length > 0) {
          this.detectedModels = data.models.map(m => ({
            id: m.name,
            name: m.name,
            provider: 'ollama',
            context: m.details?.parameter_size || '8k',
            size: m.size
          }));
          this.isConnected = true;
          this.currentUrl = this.ollamaUrl;
          return { success: true, provider: 'ollama', models: this.detectedModels };
        }
      }
    } catch (e) {
      console.log('Ollama not detected:', e.message);
    }

    // Try LM Studio
    try {
      const response = await fetch(`${this.lmStudioUrl}/v1/models`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.data && data.data.length > 0) {
          this.detectedModels = data.data.map(m => ({
            id: m.id,
            name: m.id,
            provider: 'lmstudio',
            context: '8k'
          }));
          this.isConnected = true;
          this.currentUrl = this.lmStudioUrl;
          return { success: true, provider: 'lmstudio', models: this.detectedModels };
        }
      }
    } catch (e) {
      console.log('LM Studio not detected:', e.message);
    }

    return { success: false, error: 'No local AI server detected. Make sure Ollama or LM Studio is running.' };
  }

  /**
   * Send a message to local model
   */
  async sendMessage(modelId, messages, options = {}) {
    if (!this.isConnected || !this.currentUrl) {
      throw new Error('No local model connected');
    }

    const isOllama = this.currentUrl.includes('11434');

    if (isOllama) {
      // Ollama format
      const response = await fetch(`${this.currentUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelId,
          messages: messages,
          stream: true,
          options: {
            temperature: options.temperature || 0.7,
            num_predict: options.maxTokens || 4096
          }
        })
      });
      return response;
    } else {
      // LM Studio / OpenAI compatible
      const response = await fetch(`${this.currentUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelId,
          messages: messages,
          stream: true,
          temperature: options.temperature || 0.7,
          max_tokens: options.maxTokens || 4096
        })
      });
      return response;
    }
  }

  getModels() {
    return this.detectedModels;
  }

  isAvailable() {
    return this.isConnected;
  }
}

// Make globally available
if (typeof window !== 'undefined') {
  window.LocalModels = LocalModels;
}