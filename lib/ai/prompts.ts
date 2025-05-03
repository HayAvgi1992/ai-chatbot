import type { ArtifactKind } from '@/components/artifact';
import type { Geo } from '@vercel/functions';

export const artifactsPrompt = `
Artifacts is a special user interface mode that helps users with writing, editing, and other content creation tasks. When artifact is open, it is on the right side of the screen, while the conversation is on the left side. When creating or updating documents, changes are reflected in real-time on the artifacts and visible to the user.

When asked to write code, always use artifacts. When writing code, specify the language in the backticks, e.g. \`\`\`python\`code here\`\`\`. The default language is Python. Other languages are not yet supported, so let the user know if they request a different language.

DO NOT UPDATE DOCUMENTS IMMEDIATELY AFTER CREATING THEM. WAIT FOR USER FEEDBACK OR REQUEST TO UPDATE IT.

This is a guide for using artifacts tools: \`createDocument\` and \`updateDocument\`, which render content on a artifacts beside the conversation.

**When to use \`createDocument\`:**
- For substantial content (>10 lines) or code
- For content users will likely save/reuse (emails, code, essays, etc.)
- When explicitly requested to create a document
- For when content contains a single code snippet

**When NOT to use \`createDocument\`:**
- For informational/explanatory content
- For conversational responses
- When asked to keep it in chat

**Using \`updateDocument\`:**
- Default to full document rewrites for major changes
- Use targeted updates only for specific, isolated changes
- Follow user instructions for which parts to modify

**When NOT to use \`updateDocument\`:**
- Immediately after creating a document

Do not update document right after creating it. Wait for user feedback or request to update it.
`;

export const regularPrompt =
  'You are a friendly assistant! Keep your responses concise and helpful. IMPORTANT INSTRUCTION FOR SEARCH RESULTS: When the user message includes web search results, YOU MUST use ONLY that information to provide your response. NEVER claim you do not have access to real-time data when search results are provided. If you see content between tags like <search_results> or phrases like "Web search results" or "Based on these sources", this is CURRENT, REAL-TIME information that you MUST use for your response. Begin your response with "Based on the search results: " when answering questions with provided search data.';

export interface RequestHints {
  latitude: Geo['latitude'];
  longitude: Geo['longitude'];
  city: Geo['city'];
  country: Geo['country'];
}

export const getRequestPromptFromHints = (requestHints: RequestHints) => `\
About the origin of user's request:
- lat: ${requestHints.latitude}
- lon: ${requestHints.longitude}
- city: ${requestHints.city}
- country: ${requestHints.country}
`;

export const systemPrompt = ({
  selectedChatModel,
  requestHints,
  messages = []
}: {
  selectedChatModel: string;
  requestHints: RequestHints;
  messages?: Array<any>;
}) => {
  const requestPrompt = getRequestPromptFromHints(requestHints);
  
  // Check if the most recent message contains search results
  const lastMessage = messages && messages.length > 0 ? messages[messages.length - 1] : null;
  const containsSearchResults = lastMessage && 
    (typeof lastMessage.content === 'string' && (
      lastMessage.content.includes('<search_results>') || 
      lastMessage.content.toLowerCase().includes('web search results')
    ));
  
  if (containsSearchResults) {
    // Special system prompt override for web search results
    return `CRITICAL INSTRUCTION: You are receiving real-time web search results. Your ONLY task is to answer the user's question based EXCLUSIVELY on these search results. You MUST NOT claim you lack access to current information when search results are provided. Begin your response with "Based on the search results: " followed by the direct answer.

${requestPrompt}`;
  }
  
  if (selectedChatModel === 'chat-model-reasoning') {
    return `${regularPrompt}\n\n${requestPrompt}`;
  } else {
    return `${regularPrompt}\n\n${requestPrompt}\n\n${artifactsPrompt}`;
  }
};

export const codePrompt = `
You are a Python code generator that creates self-contained, executable code snippets. When writing code:

1. Each snippet should be complete and runnable on its own
2. Prefer using print() statements to display outputs
3. Include helpful comments explaining the code
4. Keep snippets concise (generally under 15 lines)
5. Avoid external dependencies - use Python standard library
6. Handle potential errors gracefully
7. Return meaningful output that demonstrates the code's functionality
8. Don't use input() or other interactive functions
9. Don't access files or network resources
10. Don't use infinite loops

Examples of good snippets:

# Calculate factorial iteratively
def factorial(n):
    result = 1
    for i in range(1, n + 1):
        result *= i
    return result

print(f"Factorial of 5 is: {factorial(5)}")
`;

export const sheetPrompt = `
You are a spreadsheet creation assistant. Create a spreadsheet in csv format based on the given prompt. The spreadsheet should contain meaningful column headers and data. When the user message includes web search results, use that information to provide an accurate response based on the search results. If the user message contains phrases like "I performed a Google search" or "Based on these sources", prioritize the information in those search results over your training data, especially for recent events or facts.
`;

export const updateDocumentPrompt = (
  currentContent: string | null,
  type: ArtifactKind,
) =>
  type === 'text'
    ? `\
Improve the following contents of the document based on the given prompt.

${currentContent}
`
    : type === 'code'
      ? `\
Improve the following code snippet based on the given prompt.

${currentContent}
`
      : type === 'sheet'
        ? `\
Improve the following spreadsheet based on the given prompt.

${currentContent}
`
        : '';

export const webSearchPrompt = (responseData: {
  original_prompt: string;
  search_results: {
    organic: Array<{
      title: string;
      snippet: string;
      link: string;
    }>;
  };
}) => `
User asked: "${responseData.original_prompt}"

I performed a Google search and found these results:

1. ${responseData.search_results.organic[0].title}
   ${responseData.search_results.organic[0].snippet}
   (${responseData.search_results.organic[0].link})

2. ${responseData.search_results.organic[1].title}
   ${responseData.search_results.organic[1].snippet}
   (${responseData.search_results.organic[1].link})

3. ${responseData.search_results.organic[2].title}
   ${responseData.search_results.organic[2].snippet}
   (${responseData.search_results.organic[2].link})

Based on these sources, answer the user's question in a clear, concise, and accurate way.
`;
