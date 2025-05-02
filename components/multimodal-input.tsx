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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const [webSearchActive, setWebSearchActive] = useState(false);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, []);

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight + 2}px`;
    }
  };

  const resetHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = '98px';
    }
  };

  const [localStorageInput, setLocalStorageInput] = useLocalStorage(
    'input',
    '',
  );

  useEffect(() => {
    if (textareaRef.current) {
      const domValue = textareaRef.current.value;
      // Prefer DOM value over localStorage to handle hydration
      const finalValue = domValue || localStorageInput || '';
      setInput(finalValue);
      adjustHeight();
    }
    // Only run once after hydration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper function to save a message directly to the chat
  const saveMessageToChat = async (content: string, role: 'user' | 'assistant' = 'user') => {
    try {
      const messageId = uuidv4();
      // Use the /api/chat/[id]/messages endpoint 
      const response = await fetch(`/api/chat/${chatId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: messageId,
          role: role,
          content: content,
          parts: [{ type: 'text', text: content }],
          createdAt: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        console.error('Failed to save message:', response.status);
        return null;
      }

      const updatedMessages = await response.json();
      setMessages(updatedMessages);
      return messageId;
    } catch (error) {
      console.error('Error saving message:', error);
      return null;
    }
  };

  const handleWebSearch = useCallback(async (input: string): Promise<void> => {
    console.log("handleWebSearch called - processing search for:", input);
    const userMessageId = uuidv4();
    if (!input.trim()) return;

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: userMessageId,
        content: input,
        role: 'user',
        createdAt: new Date(),
      }
    ]);


    const toastId = 'web-search-toast';
    toast.loading('Searching the web...', { id: toastId });
    
    try {

      // Save the user's query message to the chat
      await saveMessageToChat(input);
      // First fetch the search results
      const response = await fetch(
        'https://google.serper.dev/search',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': 'cc8a9b97abc4d9945867f9ddced1a42f0b26ce88',
          },
          body: JSON.stringify({ q: input }),
        });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
    
      const searchData = await response.json();
      console.log("Search results received:", searchData);

      // Format search results for the user
      const formattedResults = formatSearchResults(searchData);
      
      toast.loading('Processing with Claude...', { id: toastId });
      
      // Create formatted content with search results and instructions for Claude
      // THIS SHOULD NOT BE DISPLAYED TO THE USER
      const formattedContent = `<search_results>
${formattedResults}
</search_results>

YOU MUST FOLLOW THESE INSTRUCTIONS EXACTLY:
1. You have been given search results between <search_results> tags above.
2. The user's question is: "${input}"
3. Answer ONLY using information from these search results.
4. DO NOT claim you don't have access to real-time or current information.
5. If the search results contain the answer, provide it clearly.

User question: ${input}`;

      console.log("BEFORE SENDING TO SERVER");
    
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
      
      // Method 1: Using response.text() instead of streaming
      try {
        // Get the full response as text
        const responseText = await aiResponse.text();


        // Extract all the text chunks from the format 0:"text"
        let extractedContent = "";
        const contentMatches = responseText.matchAll(/0:"([^"]+)"/g);
        
        // Combine all matches into one response
        for (const match of contentMatches) {
          if (match[1]) {
            extractedContent += match[1];
          }
        }
        
        console.log("Extracted content:", extractedContent);
        
        // If we got content, save the assistant message
        if (extractedContent) {
          setMessages((currentMessages) => [
            ...currentMessages,
            {
              id: userMessageId,
              content: extractedContent,
              role: 'assistant',
              createdAt: new Date(),
            }
          ]);

        } else {
          // Fallback if we couldn't extract content
          setMessages((currentMessages) => [
            ...currentMessages,
            {
              id: userMessageId,
              content: "Based on the search results, I found information but couldn't format it properly. Please try again.",
              role: 'assistant',
              createdAt: new Date(),
            }
          ]);
          //await saveMessageToChat("Based on the search results, I found information but couldn't format it properly. Please try again.", 'assistant');
        }
        
      } catch (error) {
        console.error("Error processing response:", error);
        await saveMessageToChat("Error processing the search results. Please try again.", 'assistant');
      }
      toast.success('Web search completed', { id: toastId });
           
    } catch (error) {
      console.error('Web search error:', error);
      toast.error(error instanceof Error ? error.message : 'An unknown error occurred', { id: toastId });
    } finally {
      setWebSearchActive(false);
    }

  }, [setMessages, chatId, saveMessageToChat]);

  // Helper function to format search results
  const formatSearchResults = (searchData: any): string => {
    if (!searchData) {
      return 'No search results found.';
    }
    
    const { organic, peopleAlsoAsk, images } = searchData;
    let formattedResults = '';
    
    // Add the organic results (text search results)
    if (organic && Array.isArray(organic)) {
      formattedResults += `TOP SEARCH RESULTS:\n\n`;
      const topResults = organic.slice(0, 3); // Take top 3 results
      
      topResults.forEach((result, index) => {
        formattedResults += `[${index + 1}] ${result.title}\n${result.snippet}\n\n`;
      });
    }
    
    // Add frequently asked questions if available
    if (peopleAlsoAsk && Array.isArray(peopleAlsoAsk) && peopleAlsoAsk.length > 0) {
      formattedResults += `FREQUENTLY ASKED QUESTIONS:\n\n`;
      peopleAlsoAsk.slice(0, 2).forEach((item, index) => {
        formattedResults += `Q: ${item.question}\nA: ${item.snippet}\n\n`;
      });
    }
    
    // Ensure the content doesn't exceed validation limits
    return formattedResults.slice(0, 8000);
  };

  useEffect(() => {
    setLocalStorageInput(input);
  }, [input, setLocalStorageInput]);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
    adjustHeight();
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadQueue, setUploadQueue] = useState<Array<string>>([]);

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
      handleWebSearch(userQuestion)
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
  ]);

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

  const { isAtBottom, scrollToBottom } = useScrollToBottom();

  useEffect(() => {
    if (status === 'submitted') {
      scrollToBottom();
    }
  }, [status, scrollToBottom]);

  // Function to toggle web search mode with user feedback
  const toggleWebSearch = useCallback(() => {
    const newState = !webSearchActive;
    setWebSearchActive(newState);
    
    if (newState) {
      toast.success('Web search mode activated! Type your query and hit Search or Enter.', {
        id: 'web-search-mode',
        duration: 2000,
      });
    } else {
      toast.info('Regular chat mode activated.', {
        id: 'web-search-mode',
        duration: 2000,
      });
    }
  }, [webSearchActive]);

  return (
    <div className="relative w-full flex flex-col gap-4">
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

      {messages.length === 0 &&
        attachments.length === 0 &&
        uploadQueue.length === 0 && (
          <SuggestedActions append={append} chatId={chatId} />
        )}

      <input
        type="file"
        className="fixed -top-4 -left-4 size-0.5 opacity-0 pointer-events-none"
        ref={fileInputRef}
        multiple
        onChange={handleFileChange}
        tabIndex={-1}
      />

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
              submitForm();
            }
          }
        }}
      />

      <div className="absolute bottom-0 p-2 w-fit flex flex-row justify-start gap-2">
        <AttachmentsButton fileInputRef={fileInputRef} status={status} />
        <WebSearchButton 
          input={input} 
          toggleWebSearch={toggleWebSearch} 
          status={status}
          isActive={webSearchActive}
          handleSearch={handleWebSearch}
        />
      </div>

      <div className="absolute bottom-0 right-0 p-2 w-fit flex flex-row justify-end">
        {status === 'submitted' ? (
          <StopButton stop={stop} setMessages={setMessages} />
        ) : (
          <SendButton
            input={input}
            submitForm={submitForm}
            uploadQueue={uploadQueue}
            isWebSearchActive={webSearchActive}
          />
        )}
      </div>
    </div>
  );
}

export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) return false;
    if (prevProps.status !== nextProps.status) return false;
    if (!equal(prevProps.attachments, nextProps.attachments)) return false;

    return true;
  },
);

function PureAttachmentsButton({
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

const AttachmentsButton = memo(PureAttachmentsButton);

function PureStopButton({
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

const StopButton = memo(PureStopButton);

function PureSendButton({
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

const SendButton = memo(PureSendButton, (prevProps, nextProps) => {
  if (prevProps.uploadQueue.length !== nextProps.uploadQueue.length)
    return false;
  if (prevProps.input !== nextProps.input) return false;
  if (prevProps.isWebSearchActive !== nextProps.isWebSearchActive) return false;
  return true;
});

function PureWebSearchButton({
  input,
  toggleWebSearch,
  handleSearch,
  status,
  isActive,
}: {
  input: string;
  toggleWebSearch: () => void;
  handleSearch: (input: string) => Promise<void>;
  status: UseChatHelpers['status'];
  isActive: boolean;
}) {
  return (
    <Button
      data-testid="web-search-button"
      className={cx(
        "rounded-md rounded-bl-lg p-[7px] h-fit dark:border-white border-black hover:dark:bg-zinc-900 hover:bg-zinc-200",
        isActive && "bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 hover:dark:bg-blue-700 text-white"
      )}
      onClick={(event) => {
        event.preventDefault();
        if (input.trim().length > 0 && isActive) {
          // If input exists and web search is active, directly trigger search
          handleSearch(input);
        } else {
          // Otherwise just toggle the mode
          toggleWebSearch();
        }
      }}
      disabled={status !== 'ready'}
      variant="outline"
    >
      <div className="flex items-center">
        <SearchIcon size={14} />
        <span className="ml-1">{isActive ? "Web Search Active" : "Web Search"}</span>
      </div>
    </Button>
  );
}

const WebSearchButton = memo(PureWebSearchButton);

/**
 * Parses the streaming response from the model
 * @param responseText The raw response text from the model
 * @returns The cleaned and parsed content
 */
function parseModelResponse(responseText: string): string {
  let finalContent = '';
  
  try {
    // Try parsing as JSON
    const jsonContent = tryParseJSON(responseText);
    if (jsonContent) {
      return jsonContent;
    }
    
    // Try extracting from streaming format
    const streamContent = extractStreamContent(responseText);
    if (streamContent) {
      return streamContent;
    }
    
    // Try fallback extraction
    const fallbackContent = extractFallbackContent(responseText);
    if (fallbackContent) {
      return fallbackContent;
    }
    
    // Last resort: use raw text
    return responseText;
  } catch (error) {
    console.error('Error parsing response:', error);
    return 'Error parsing model response. Please try again.';
  }
}

/**
 * Tries to parse the response as JSON
 * @param text The response text
 * @returns The content if successful, empty string otherwise
 */
function tryParseJSON(text: string): string {
  try {
    const parsedJSON = JSON.parse(text);
    if (parsedJSON.content) {
      return cleanText(parsedJSON.content);
    }
    return '';
  } catch (e) {
    return '';
  }
}

/**
 * Extracts content from streaming format
 * @param text The response text
 * @returns The extracted content if successful, empty string otherwise
 */
function extractStreamContent(text: string): string {
  // More robust pattern to handle all streaming formats
  const streamPattern = /(\d+):"([^"]*)"/g;
  const contentChunks: string[] = [];
  let match;
  
  while ((match = streamPattern.exec(text)) !== null) {
    contentChunks.push(match[2]);
  }
  
  if (contentChunks.length > 0) {
    // Just concatenate the chunks without additional processing
    const fullText = contentChunks.join('');
    console.log("Full extracted text:", fullText);
    return fullText.trim();
  }
  
  return '';
}

/**
 * Fallback extraction for any text in quotes
 * @param text The response text
 * @returns The extracted content if successful, empty string otherwise
 */
function extractFallbackContent(text: string): string {
  const fallbackPattern = /"([^"]+)"/g;
  const textChunks: string[] = [];
  let match;
  
  while ((match = fallbackPattern.exec(text)) !== null) {
    if (match[1].length > 3) {
      textChunks.push(match[1]);
    }
  }
  
  if (textChunks.length > 0) {
    return cleanText(textChunks.join(' '));
  }
  
  return '';
}

/**
 * Cleans the text by removing escaped characters and trimming
 * @param text The text to clean
 * @returns The cleaned text
 */
function cleanText(text: string): string {
  return text.replace(/^\\"|\\n|\\r|\\t|\\"/g, '').trim();
}
