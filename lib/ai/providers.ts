import {
  extractReasoningMiddleware,
  wrapLanguageModel,
  LanguageModelV1,
  StreamingTextGenerationMethod,
  TextGenerationMethod,
  RunnerMethod,
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
    },
    modelId,
    defaultObjectGenerationMode: 'json',
    supportedFeatures: {
      streamingTextGeneration: true,
      textGeneration: true,
    },
    objectGenerationMethods: {},
    
    textGenerationMethods: {
      generate: (async ({ prompt, ...params }) => {
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
      }) as TextGenerationMethod,

      stream: (async ({ prompt, ...params }, { signal, onToken }) => {
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
      }) as StreamingTextGenerationMethod,
    },
    
    runnerMethods: {} as Record<string, RunnerMethod>,
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
  imageModel: (modelName: string) => {
    // This is a placeholder - If we would like to add image generation, add it
    // based on the image generation service you're using
    return {
      name: modelName,
      provider: 'openai',
      // Add any additional properties needed by experimental_generateImage
    };
  }
};
