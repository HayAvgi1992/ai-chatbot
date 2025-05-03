'use client';

import type { Attachment, UIMessage } from 'ai';
import cx from 'classnames';
import type React from 'react';
import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type Dispatch,
  type SetStateAction,
  type ChangeEvent,
  memo,
} from 'react';
import { toast } from 'sonner';
import { useLocalStorage, useWindowSize } from 'usehooks-ts';
import { v4 as uuidv4 } from 'uuid';

import { ArrowUpIcon, PaperclipIcon, StopIcon, SearchIcon } from './icons';
import { PreviewAttachment } from './preview-attachment';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { SuggestedActions } from './suggested-actions';
import equal from 'fast-deep-equal';
import type { UseChatHelpers } from '@ai-sdk/react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import { useScrollToBottom } from '@/hooks/use-scroll-to-bottom';
import { webSearchEnhancedPrompt } from '@/lib/ai/prompts';

// Custom hooks for this component
function useTextareaHandling() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localStorageInput, setLocalStorageInput] = useLocalStorage('input', '');

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight + 2}px`;
    }
  }, []);

  const resetHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = '98px';
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, [adjustHeight]);

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      // Prefer DOM value over localStorage to handle hydration
      const finalValue = domValue || localStorageInput || '';
      setLocalStorageInput(finalValue);
      adjustHeight();
    }
    // Only run once after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    textareaRef,
    localStorageInput,
    setLocalStorageInput,
    adjustHeight,
    resetHeight,
  };
}

function useFileAttachments(setAttachments: Dispatch<SetStateAction<Array<Attachment>>>) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<Array<string>>([]);

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const { url, pathname, contentType } = data;

        return {
          url,
          name: pathname,
          contentType: contentType,
        };
      }
      const { error } = await response.json();
      toast.error(error);
    } catch (error) {
      toast.error('Failed to upload file, please try again!');
    }
  };

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);

      setUploadQueue(files.map((file) => file.name));

      try {
        const uploadPromises = files.map((file) => uploadFile(file));
        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) => attachment !== undefined,
        );

        setAttachments((currentAttachments) => [
          ...currentAttachments,
          ...successfullyUploadedAttachments,
        ]);
      } catch (error) {
        console.error('Error uploading files!', error);
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments],
  );

  return {
    fileInputRef,
    uploadQueue,
    handleFileChange,
  };
}

function useWebSearch(chatId: string, setMessages: UseChatHelpers['setMessages']) {
  const [webSearchActive, setWebSearchActive] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0); // 0 for Google SERP, 1 for Brave
  
  // Handle web search
  const handleWebSearch = useCallback(async (input: string, searchIndex: number = 0): Promise<void> => {
    console.log(`handleWebSearch called - processing search for: ${input} using provider index: ${searchIndex}`);
    const userMessageId = uuidv4();
    if (!input.trim()) return;
    
    // Message saving helper - moved inside the callback
    const saveMessageToChat = async (content: string, role: 'user' | 'assistant' = 'user') => {
      console.log(`Saving ${role} message to chat:`, content.substring(0, 50) + '...');
      
      try {
        // Check if content is empty
        if (!content || content.trim() === '') {
          console.error("Cannot save empty message");
          return;
        }

        // Generate an ID for this message
        const messageId = uuidv4();
        
        // First, check if the chat exists by trying to get its messages
        const checkResponse = await fetch(`/api/chat/${chatId}/messages`);
        
        // If response is 404, create the chat first
        if (checkResponse.status === 404) {
          console.log(`Chat ${chatId} not found, creating new chat`);
          // Create a new chat
          const createChatResponse = await fetch('/api/chat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: chatId,
              title: `Web Search: ${content.substring(0, 30)}${content.length > 30 ? '...' : ''}`,
              selectedChatModel: 'claude-3-sonnet', 
              selectedVisibilityType: 'private',
              message: {
                id: uuidv4(),
                role: 'user',
                content: content,
                parts: [{ type: 'text', text: content }],
                createdAt: new Date().toISOString()
              },
              saveUserMessage: true,
              addMessageToModel: true
            }),
          });
          
          if (!createChatResponse.ok) {
            const errorText = await createChatResponse.text();
            console.error(`Failed to create chat: ${createChatResponse.status}`, errorText);
            throw new Error(`Failed to create chat: ${createChatResponse.status} ${createChatResponse.statusText}`);
          }
          
          console.log(`Chat ${chatId} created successfully`);
          return messageId; // Return early since message is included in chat creation
        }
        
        // Create the request with complete message data format
        const response = await fetch(`/api/chat/${chatId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: messageId,
            content,
            role,
            parts: [{ type: 'text', text: content }],
            createdAt: new Date().toISOString()
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Error saving message (${response.status}): ${errorText}`);
          throw new Error(`Failed to save message: ${response.status} ${response.statusText}`);
        }
        
        console.log("Message saved successfully");
        return messageId;
      } catch (error) {
        console.error('Error in saveMessageToChat:', error);
        throw error;
      }
    };
    
    // Format search results helper - moved inside the callback
    const formatSearchResults = (searchData: any, provider: string): string => {
      if (!searchData) {
        return 'No search results found.';
      }
      
      let formattedResults = `SEARCH PROVIDER: ${provider}\n\n`;
      
      // Helper function to decode escaped strings
      const decodeEscapedText = (text: string): string => {
        if (!text) return '';
        return text
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\"/g, '"')
          .replace(/\\'/g, "'")
          .replace(/\\\\/g, '\\');
      };
      
      if (provider === 'Google SERP') {
        const { organic, peopleAlsoAsk } = searchData;
        
        // Add the organic results (text search results)
        if (organic && Array.isArray(organic)) {
          formattedResults += `TOP SEARCH RESULTS:\n\n`;
          const topResults = organic.slice(0, 3); // Take top 3 results
          
          topResults.forEach((result, index) => {
            formattedResults += `[${index + 1}] ${decodeEscapedText(result.title)}\n${decodeEscapedText(result.snippet)}\n\n`;
          });
        }
        
        // Add frequently asked questions if available
        if (peopleAlsoAsk && Array.isArray(peopleAlsoAsk) && peopleAlsoAsk.length > 0) {
          formattedResults += `FREQUENTLY ASKED QUESTIONS:\n\n`;
          peopleAlsoAsk.slice(0, 2).forEach((item, index) => {
            formattedResults += `Q: ${decodeEscapedText(item.question)}\nA: ${decodeEscapedText(item.snippet)}\n\n`;
          });
        }
      } else if (provider === 'Brave Search') {
        // Format Brave search results
        if (searchData.web && Array.isArray(searchData.web.results)) {
          formattedResults += `TOP SEARCH RESULTS:\n\n`;
          const topResults = searchData.web.results.slice(0, 3);
          
          topResults.forEach((result: any, index: number) => {
            formattedResults += `[${index + 1}] ${decodeEscapedText(result.title)}\n${decodeEscapedText(result.description)}\n${result.url}\n\n`;
          });
        }
      }
      
      // Final decode to catch any remaining escapes
      formattedResults = decodeEscapedText(formattedResults);
      
      // Ensure the content doesn't exceed validation limits
      return formattedResults.slice(0, 8000);
    };
    
    const toastId = 'web-search-toast';
    toast.loading('Searching the web...', { id: toastId });
    
    try {
      // First, update the UI with the user's message immediately
      const userMessageObject = {
        id: userMessageId,
        content: input,
        role: 'user' as const,
        createdAt: new Date(),
      };
      
      // Add user message to UI immediately
      setMessages((currentMessages) => [
        ...currentMessages,
        userMessageObject
      ]);
      
      // Save the user's query message to the chat 
      // If this fails, continue anyway with the search
      try {
        await saveMessageToChat(input);
      } catch (saveError) {
        console.error("Error saving user message:", saveError);
        toast.error("Couldn't save your question to database, but continuing with search", {
          id: 'message-save-error',
          duration: 2000,
        });
      }
      
      let searchData;
      let provider = searchIndex === 0 ? 'Google SERP' : 'Brave Search';
      
      if (searchIndex === 0) {
        console.log('Google SERP API');
        // Google SERP API via our server-side proxy
        const response = await fetch(
          '/api/google-search',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ q: input }),
          });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
      
        searchData = await response.json();
      } else {
        console.log('Brave Search API');
        // Brave Search API via our server-side proxy
        const response = await fetch(
          `/api/brave-search?q=${encodeURIComponent(input)}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
      
        // Get raw data
        const rawData = await response.json();
        console.log('Brave Search API raw response:', rawData);
        
        // Decode any escaped characters in the response
        // This ensures \n and other escape sequences are properly handled
        searchData = JSON.parse(JSON.stringify(rawData).replace(/\\n/g, '\n').replace(/\\"/g, '"'));
        console.log('Brave Search API decoded response:', searchData);
      }
      
      console.log(`Search results received from ${provider}:`, searchData);

      // Format search results for the user
      const formattedResults = formatSearchResults(searchData, provider);
      
      toast.loading('Processing with Claude...', { id: toastId });
      
      // Create formatted content with search results and instructions for Claude
      const formattedContent = webSearchEnhancedPrompt(formattedResults, input);

      
      // Make direct API call and handle streaming properly
      const aiResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: chatId,
          selectedChatModel: 'claude-3-sonnet',
          selectedVisibilityType: 'private',
          saveUserMessage: false, // Don't save the special prompt to chat history
          addMessageToModel: true, // Still send the formatted content to the model
          message: {
            id: uuidv4(), // Use a different ID for this "hidden" request
            role: 'user',
            content: formattedContent,
            parts: [{ type: 'text', text: formattedContent }],
            createdAt: new Date().toISOString(),
          },
        }),
      });
      
      if (!aiResponse.ok) {
        throw new Error(`AI response failed: ${aiResponse.statusText}`);
      }
      
      // Process the response
      try {
        // Get the full response as text
        const responseText = await aiResponse.text();
        console.log("Raw AI response:", responseText);
        
        // Extract all the text chunks from the format 0:"text"
        let extractedContent = "";
        const contentMatches = responseText.matchAll(/0:"([^"]+)"/g);
        
        // Combine all matches into one response
        let matchFound = false;
        for (const match of contentMatches) {
          matchFound = true;
          if (match[1]) {
            extractedContent += match[1];
          }
        }
        
        // If no matches were found, try to use the entire response text
        if (!matchFound && responseText) {
          // Try to extract content from JSON if it looks like JSON
          try {
            if (responseText.trim().startsWith('{')) {
              const jsonResponse = JSON.parse(responseText);
              if (jsonResponse && jsonResponse.text) {
                extractedContent = jsonResponse.text;
              }
            } else {
              // Use the raw text if it's not JSON
              extractedContent = responseText;
            }
          } catch (jsonError) {
            console.error("Error parsing response as JSON:", jsonError);
            // Use the raw text as fallback
            extractedContent = responseText;
          }
        }
        
        console.log("Extracted content:", extractedContent);
        
        // Decode any escaped characters in the response
        try {
          // Replace escape sequences with their actual characters
          extractedContent = extractedContent
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\\\/g, '\\');
            
          console.log("Decoded extracted content:", extractedContent);
        } catch (decodeError) {
          console.error("Error decoding content:", decodeError);
          // Continue with the original content if decoding fails
        }
        
        // If we got content, save the assistant message
        if (extractedContent && extractedContent.trim() !== '') {
          // Create a new ID for the assistant message
          const assistantMessageId = uuidv4();
          
          // Update UI immediately
          setMessages((currentMessages) => [
            ...currentMessages,
            {
              id: assistantMessageId,
              content: extractedContent,
              role: 'assistant',
              parts: [{ type: 'text', text: extractedContent }],
              createdAt: new Date(),
            }
          ]);
          
          // Then try to save to database
          try {
            await saveMessageToChat(extractedContent, 'assistant');
          } catch (saveError) {
            console.error("Failed to save assistant message to chat:", saveError);
            // UI already updated, so no need to show error to user
          }
        } else {
          // Only add fallback if we couldn't extract any content
          const fallbackMessageId = uuidv4();
          
          // Show fallback message in UI
          setMessages((currentMessages) => [
            ...currentMessages,
            {
              id: fallbackMessageId,
              content: "Error processing search results. Please try again.",
              role: 'assistant',
              parts: [{ type: 'text', text: "Error processing search results. Please try again." }],
              createdAt: new Date(),
            }
          ]);
        }
      } catch (error) {
        console.error("Error processing response:", error);
        
        // Create a unique ID for the error message
        const errorMessageId = uuidv4();
        
        // Add error message to UI instead of saving to chat
        setMessages((currentMessages) => [
          ...currentMessages,
          {
            id: errorMessageId,
            content: "Error processing the search results. Please try again.",
            role: 'assistant',
            createdAt: new Date(),
          }
        ]);
        
        // Complete the request
        toast.success('Web search completed with errors', { id: toastId });
        return; // Exit early to prevent further processing
      }
      
      toast.success('Web search completed', { id: toastId });
           
    } catch (error) {
      console.error('Web search error:', error);
      toast.error(error instanceof Error ? error.message : 'An unknown error occurred', { id: toastId });
    } finally {
      setWebSearchActive(false);
    }
  }, [chatId, setMessages]);

  // Toggle web search mode
  const toggleWebSearch = useCallback((searchIndex: number = 0) => {
    // If we're activating search or switching index while active, update the index
    if (!webSearchActive || (webSearchActive && activeSearchIndex !== searchIndex)) {
      setActiveSearchIndex(searchIndex);
    }
    
    const newState = !webSearchActive;
    setWebSearchActive(newState);
    
    if (newState) {
      const provider = searchIndex === 0 ? 'Google SERP' : 'Brave Search';
      toast.success(`Web search mode activated using ${provider == 'Google SERP' ? 'Mystery 1' : 'Mystery 2'}! Type your query and hit Search or Enter.`, {
        id: 'web-search-mode',
        duration: 2000,
      });
    } else {
      toast.info('Regular chat mode activated.', {
        id: 'web-search-mode',
        duration: 2000,
      });
    }
  }, [webSearchActive, activeSearchIndex]);

  return {
    webSearchActive,
    activeSearchIndex,
    handleWebSearch,
    toggleWebSearch,
  };
}

// UI Components
const MessageTextarea = memo(function MessageTextarea({
  input,
  setInput,
  status,
  webSearchActive,
  textareaRef,
  adjustHeight,
  onEnterPress,
  className,
}: {
  input: string;
  setInput: (value: string) => void;
  status: UseChatHelpers['status'];
  webSearchActive: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  adjustHeight: () => void;
  onEnterPress: () => void;
  className?: string;
}) {
  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    adjustHeight();
  };

  return (
    <Textarea
      data-testid="multimodal-input"
      ref={textareaRef}
      placeholder={webSearchActive ? "Enter a web search query..." : "Send a message..."}
      value={input}
      onChange={handleInput}
      className={cx(
        'min-h-[24px] max-h-[calc(75dvh)] overflow-hidden resize-none rounded-2xl !text-base bg-muted pb-10 dark:border-zinc-700',
        className,
      )}
      rows={2}
      autoFocus
      onKeyDown={(event) => {
        if (
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault();

          if (status !== 'ready') {
            toast.error('Please wait for the model to finish its response!');
          } else if (!input.trim()) {
            toast.error('Please enter a message first!');
          } else {
            onEnterPress();
          }
        }
      }}
    />
  );
});

// UI Component for file attachments button
function AttachmentsButton({
  fileInputRef,
  status,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  status: UseChatHelpers['status'];
}) {
  return (
    <Button
      data-testid="attachments-button"
      className="rounded-md rounded-bl-lg p-[7px] h-fit dark:border-zinc-700 hover:dark:bg-zinc-900 hover:bg-zinc-200"
      onClick={(event) => {
        event.preventDefault();
        fileInputRef.current?.click();
      }}
      disabled={status !== 'ready'}
      variant="ghost"
    >
      <PaperclipIcon size={14} />
    </Button>
  );
}

// UI Component for stop button
function StopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers['setMessages'];
}) {
  return (
    <Button
      data-testid="stop-button"
      className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => messages);
      }}
    >
      <StopIcon size={14} />
    </Button>
  );
}

// UI Component for send button
function SendButton({
  submitForm,
  input,
  uploadQueue,
  isWebSearchActive,
}: {
  submitForm: () => void;
  input: string;
  uploadQueue: Array<string>;
  isWebSearchActive: boolean;
}) {
  return (
    <Button
      data-testid="send-button"
      className="rounded-full p-1.5 h-fit border dark:border-zinc-600"
      onClick={(event) => {
        event.preventDefault();
        submitForm();
      }}
      disabled={input.length === 0 || uploadQueue.length > 0}
    >
      {isWebSearchActive ? (
        <div className="flex items-center">
          <SearchIcon size={14} />
          <span className="ml-1 text-xs">Search</span>
        </div>
      ) : (
        <ArrowUpIcon size={14} />
      )}
    </Button>
  );
}

// UI Component for web search button
function WebSearchButton({
  input,
  toggleWebSearch,
  handleSearch,
  status,
  isActive,
  searchIndex,
  activeSearchIndex,
  label
}: {
  input: string;
  toggleWebSearch: (searchIndex: number) => void;
  handleSearch: (input: string, searchIndex: number) => Promise<void>;
  status: UseChatHelpers['status'];
  isActive: boolean;
  searchIndex: number;
  activeSearchIndex: number;
  label: string;
}) {
  // Button is active if web search is active and this button's index matches active index
  const isThisButtonActive = isActive && activeSearchIndex === searchIndex;
  
  return (
    <Button
      data-testid={`web-search-button-${searchIndex}`}
      className={cx(
        "rounded-md px-2 py-1 h-fit dark:border-white border-black hover:dark:bg-zinc-900 hover:bg-zinc-200 mr-2",
        isThisButtonActive && "bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 hover:dark:bg-blue-700 text-white"
      )}
      onClick={(event) => {
        event.preventDefault();
        if (input.trim().length > 0 && isThisButtonActive) {
          // If input exists and this button's search is active, directly trigger search
          handleSearch(input, searchIndex);
        } else {
          // Otherwise toggle the mode with this button's index
          toggleWebSearch(searchIndex);
        }
      }}
      disabled={status !== 'ready'}
      variant="outline"
    >
      <div className="flex items-center">
        <SearchIcon size={14} />
        <span className="ml-1">{isThisButtonActive ? `${label} Active` : label}</span>
      </div>
    </Button>
  );
}

// Main component implementation
function PureMultimodalInput({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  append,
  handleSubmit,
  className,
}: {
  chatId: string;
  input: UseChatHelpers['input'];
  setInput: UseChatHelpers['setInput'];
  status: UseChatHelpers['status'];
  stop: () => void;
  attachments: Array<Attachment>;
  setAttachments: Dispatch<SetStateAction<Array<Attachment>>>;
  messages: Array<UIMessage>;
  setMessages: UseChatHelpers['setMessages'];
  append: UseChatHelpers['append'];
  handleSubmit: UseChatHelpers['handleSubmit'];
  className?: string;
}) {
  const { width } = useWindowSize();
  const { isAtBottom, scrollToBottom } = useScrollToBottom();
  
  const {
    textareaRef,
    localStorageInput,
    setLocalStorageInput,
    adjustHeight,
    resetHeight,
  } = useTextareaHandling();
  
  const {
    fileInputRef,
    uploadQueue,
    handleFileChange,
  } = useFileAttachments(setAttachments);
  
  const {
    webSearchActive,
    activeSearchIndex,
    handleWebSearch,
    toggleWebSearch,
  } = useWebSearch(chatId, setMessages);

  // Update localStorage when input changes
  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  // Scroll to bottom when status changes to submitted
  useEffect(() => {
    if (status === 'submitted') {
      scrollToBottom();
    }
  }, [status, scrollToBottom]);

  // Form submission handler
  const submitForm = useCallback(() => {
    if (!input.trim()) return;
    
    window.history.replaceState({}, '', `/chat/${chatId}`);
    
    if (webSearchActive) {
      console.log("Web search active - handling web search for query:", input);
      
      // Store the user's question for web search
      const userQuestion = input;
      
      // Clear input field immediately
      setInput('');
      
      // Perform web search
      handleWebSearch(userQuestion, activeSearchIndex)
        .catch(error => {
          console.error("Web search failed:", error);
          toast.error('Web search failed. Please try again.', { id: 'web-search-toast' });
        });
    } else {
      console.log("Regular chat message - normal submission");
      // Normal submission
      handleSubmit(undefined, {
        experimental_attachments: attachments,
      });
      
      setInput('');
    }

    setAttachments([]);
    setLocalStorageInput('');
    resetHeight();

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [
    attachments,
    handleSubmit,
    setAttachments,
    setLocalStorageInput,
    width,
    chatId,
    webSearchActive,
    input,
    handleWebSearch,
    setInput,
    resetHeight,
    textareaRef,
    activeSearchIndex
  ]);

  return (
    <div className="relative w-full flex flex-col gap-4">
      {/* Scroll to bottom button */}
      <AnimatePresence>
        {!isAtBottom && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="absolute left-1/2 bottom-28 -translate-x-1/2 z-50"
          >
            <Button
              data-testid="scroll-to-bottom-button"
              className="rounded-full"
              size="icon"
              variant="outline"
              onClick={(event) => {
                event.preventDefault();
                scrollToBottom();
              }}
            >
              <ArrowDown />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suggested actions */}
      {messages.length === 0 &&
        attachments.length === 0 &&
        uploadQueue.length === 0 && (
          <SuggestedActions append={append} chatId={chatId} />
        )}

      {/* File input (hidden) */}
      <input
        type="file"
        className="fixed -top-4 -left-4 size-0.5 opacity-0 pointer-events-none"
        ref={fileInputRef}
        multiple
        onChange={handleFileChange}
        tabIndex={-1}
      />

      {/* Attachments preview */}
      {(attachments.length > 0 || uploadQueue.length > 0) && (
        <div
          data-testid="attachments-preview"
          className="flex flex-row gap-2 overflow-x-scroll items-end"
        >
          {attachments.map((attachment) => (
            <PreviewAttachment key={attachment.url} attachment={attachment} />
          ))}

          {uploadQueue.map((filename) => (
            <PreviewAttachment
              key={filename}
              attachment={{
                url: '',
                name: filename,
                contentType: '',
              }}
              isUploading={true}
            />
          ))}
        </div>
      )}

      {/* Message input textarea */}
      <MessageTextarea
        input={input}
        setInput={setInput}
        status={status}
        webSearchActive={webSearchActive}
        textareaRef={textareaRef}
        adjustHeight={adjustHeight}
        onEnterPress={submitForm}
        className={className}
      />

      {/* Bottom buttons row */}
      <div className="absolute bottom-0 p-2 w-fit flex flex-row justify-start gap-2">
        <AttachmentsButton fileInputRef={fileInputRef} status={status} />
        
        {/* Multiple search buttons */}
        <div className="flex space-x-1">
          <WebSearchButton 
            input={input} 
            toggleWebSearch={toggleWebSearch} 
            status={status}
            isActive={webSearchActive}
            handleSearch={handleWebSearch}
            searchIndex={0}
            activeSearchIndex={activeSearchIndex}
            label="Mystery 1"
          />
          
          <WebSearchButton 
            input={input} 
            toggleWebSearch={toggleWebSearch} 
            status={status}
            isActive={webSearchActive}
            handleSearch={handleWebSearch}
            searchIndex={1}
            activeSearchIndex={activeSearchIndex}
            label="Mystery 2"
          />
        </div>
      </div>

      {/* Send/Stop buttons */}
      <div className="absolute bottom-0 right-0 p-2 w-fit flex flex-row justify-end">
        {status === 'submitted' ? (
          <StopButton stop={stop} setMessages={setMessages} />
        ) : (
          <SendButton
            submitForm={submitForm}
            uploadQueue={uploadQueue}
            input={input}
            isWebSearchActive={webSearchActive}
          />
        )}
      </div>
    </div>
  );
}

// Memoized version with optimized re-rendering
export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) return false;
    if (prevProps.status !== nextProps.status) return false;
    if (!equal(prevProps.attachments, nextProps.attachments)) return false;

    return true;
  },
);
