import {
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { isTestEnvironment } from '../constants';
import { anthropic, createAnthropic } from '@ai-sdk/anthropic';

// Initialize the Anthropic provider with API key from environment variables
const anthropicProvider = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Create a function to get a TogetherAI model
function togetherai(model: string) {
  return {
    async chat({ messages }: { messages: Array<{ role: string; content: string }> }) {
      // This uses your existing TOGETHER_AI_API_KEY from .env
      try {
        const response = await fetch('https://api.together.xyz/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.TOGETHER_AI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages,
          }),
        });
        
        if (!response.ok) {
          throw new Error(`TogetherAI error: ${response.status}`);
        }
        
        const data = await response.json();
        return data.choices[0].message;
      } catch (error) {
        console.error('TogetherAI error:', error);
        throw error;
      }
    }
  };
}

// Export the provider with both TogetherAI and Anthropic options
export const myProvider = {
  languageModel: (modelName: string) => {
    // Handle Anthropic Claude models
    if (modelName.startsWith('claude-')) {
      // Use the AI SDK's Anthropic provider
      return anthropicProvider(modelName);
    }
    
    // For other models, use TogetherAI
    return togetherai(
      modelName === 'chat-model-reasoning'
        ? 'mistralai/Mixtral-8x7B-Instruct-v0.1' 
        : 'mistralai/Mixtral-8x7B-Instruct-v0.1'
    );
  },
};
