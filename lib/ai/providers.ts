import {
  LanguageModelV1,
  type ImageModel as ImageModelV1
} from 'ai';
import { isTestEnvironment } from '../constants';
import { anthropic, createAnthropic } from '@ai-sdk/anthropic';

// Initialize the Anthropic provider with API key from environment variables
const anthropicProvider = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Create a wrapper for TogetherAI that conforms to the LanguageModelV1 interface
function createTogetherAIModel(modelId: string): LanguageModelV1 {
  return {
    specificationVersion: 'v1',
    provider: {
      id: 'togetherai',
      brand: 'TogetherAI',
    } as any, // Cast to any to avoid type error
    modelId,
    defaultObjectGenerationMode: 'json',
    supportedFeatures: {
      streamingTextGeneration: true,
      textGeneration: true,
    },
    objectGenerationMethods: {},
    
    textGenerationMethods: {
      generate: async ({ prompt, ...params }: { prompt: string, [key: string]: any }) => {
        try {
          const response = await fetch('https://api.together.xyz/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.TOGETHER_AI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: modelId,
              messages: [{ role: 'user', content: prompt }],
              stream: false,
              ...params,
            }),
          });
          
          if (!response.ok) {
            throw new Error(`TogetherAI error: ${response.status}`);
          }
          
          const data = await response.json();
          return { text: data.choices[0].message.content };
        } catch (error) {
          console.error('TogetherAI error:', error);
          throw error;
        }
      },

      stream: async (
        { prompt, ...params }: { prompt: string, [key: string]: any }, 
        { signal, onToken }: { signal?: AbortSignal, onToken: (token: { text: string }) => void }
      ) => {
        let done = false;
        try {
          const response = await fetch('https://api.together.xyz/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.TOGETHER_AI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: modelId,
              messages: [{ role: 'user', content: prompt }],
              stream: true,
              ...params,
            }),
            signal,
          });
          
          if (!response.ok) {
            throw new Error(`TogetherAI error: ${response.status}`);
          }
          
          const reader = response.body?.getReader();
          if (!reader) throw new Error('Response body stream not available');
          
          const decoder = new TextDecoder();
          let text = '';
          
          while (!done) {
            const { done: streamDone, value } = await reader.read();
            if (streamDone) {
              done = true;
              break;
            }
            
            const chunk = decoder.decode(value, { stream: true });
            // Parse SSE chunk and extract content
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(line.substring(6));
                  const content = data.choices[0]?.delta?.content || '';
                  if (content) {
                    text += content;
                    onToken({ text: content });
                  }
                } catch (e) {
                  console.error('Error parsing SSE chunk:', e);
                }
              }
            }
          }
          
          return { text };
        } catch (error) {
          console.error('TogetherAI streaming error:', error);
          throw error;
        }
      },
    },
    
    runnerMethods: {} as Record<string, any>,
  };
}

// Export the provider with both TogetherAI and Anthropic options
export const myProvider = {
  languageModel: (modelName: string): LanguageModelV1 => {
    // Handle Anthropic Claude models
    if (modelName.startsWith('claude-')) {
      // Use simple base names without version dates
      // Anthropic API shows these are supported in newer versions
      const modelVersionMap: Record<string, string> = {
        'claude-3-sonnet': 'claude-3-5-sonnet-20241022',
      };
      
      // Use the cleaned model name
      const actualModelName = modelVersionMap[modelName] || modelName;
      
      console.log("Using Anthropic model:", actualModelName);
      
      // Use the AI SDK's Anthropic provider
      return anthropicProvider(actualModelName) as LanguageModelV1;
    }
    
    // For other models, return a properly typed TogetherAI model
    if (modelName === 'chat-model' || modelName === 'chat-model-reasoning') {
      return createTogetherAIModel('mistralai/Mixtral-8x7B-Instruct-v0.1');
    }
    
    // For any other models, use default TogetherAI
    return createTogetherAIModel('mistralai/Mixtral-8x7B-Instruct-v0.1');
  },
  
  // Add support for image models
  imageModel: (modelName: string): ImageModelV1 => {
    // This is a placeholder - If we would like to add image generation, add it
    // based on the image generation service you're using
    return {
      specificationVersion: 'v1',
      provider: 'openai', // Can be changed based on your provider
      modelId: modelName,
      maxImagesPerCall: 1,
      doGenerate: async ({ prompt, n }: { prompt: string, n?: number }) => {
        // Mock implementation for now
        console.log(`Generating ${n} image(s) with prompt: ${prompt}`);
        
        // Return a base64 placeholder image or make an actual API call
        // This is just a minimal example to make the type checker happy
        const mockBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg==";
        
        return {
          images: Array(n || 1).fill(mockBase64),
          warnings: [],
          response: {
            timestamp: new Date(),
            modelId: modelName,
            headers: {}
          }
        };
      }
    };
  }
};
