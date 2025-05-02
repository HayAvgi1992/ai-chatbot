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
import { nanoid } from 'nanoid';

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
import { webSearchPrompt } from '@/lib/ai/prompts';
import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';

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
  const [webSearchActive, setWebSearchActive] = useState(true);

  useEffect(() => {
    console.log("webSearchActive changed to:", webSearchActive);
  }, [webSearchActive]);

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

  const handleWebSearch = useCallback(async (input: string): Promise<void> => {
    if (!input.trim()) return;
    
    const id = nanoid();
    setWebSearchActive(false);
    
    const toastId = 'web-search-toast';
    toast.loading('Searching the web...', { id: toastId });
    
    try {
      /*
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
      */
      const searchData = {
        "status": 200,
        "statusText": "",
        "data": {
            "searchParameters": {
                "q": "Who won the men's last world cup in 2022 on soccer?",
                "type": "search",
                "engine": "google"
            },
            "answerBox": {
                "snippet": "2022 FIFA World Cup final\nLusail Stadium hosted the final.\n\nEvent\n2022 FIFA World Cup\nArgentina France 3 3\n\nAfter extra time Argentina won 4–2 on penalties\n\nDate\n18 December 2022",
                "title": "2022 FIFA World Cup final - Wikipedia",
                "link": "https://en.wikipedia.org/wiki/2022_FIFA_World_Cup_final"
            },
            "organic": [
                {
                    "title": "2022 FIFA World Cup - Wikipedia",
                    "link": "https://en.wikipedia.org/wiki/2022_FIFA_World_Cup",
                    "snippet": "Argentina were crowned the champions after winning the final against the ... Of the 32 nations qualified to play at the 2022 FIFA World Cup, 24 countries competed ...",
                    "sitelinks": [
                        {
                            "title": "Final",
                            "link": "https://en.wikipedia.org/wiki/2022_FIFA_World_Cup_final"
                        },
                        {
                            "title": "Qatar 2022 FIFA World Cup bid",
                            "link": "https://en.wikipedia.org/wiki/Qatar_2022_FIFA_World_Cup_bid"
                        },
                        {
                            "title": "How qualifying",
                            "link": "https://en.wikipedia.org/wiki/2022_FIFA_World_Cup_qualification"
                        },
                        {
                            "title": "Bidding process",
                            "link": "https://en.wikipedia.org/wiki/2018_and_2022_FIFA_World_Cup_bids"
                        }
                    ],
                    "position": 1
                },
                {
                    "title": "The Moment When Argentina Won The 2022 FIFA World Cup",
                    "link": "https://www.youtube.com/watch?v=EROb-E23ZVs&pp=0gcJCdgAo7VqN5tD",
                    "snippet": "The Moment When Argentina Won The 2022 FIFA World Cup · Comments857.",
                    "date": "May 23, 2024",
                    "position": 2
                },
                {
                    "title": "How Argentina won the 2022 World Cup, in their own words - ESPN",
                    "link": "https://www.espn.com/soccer/story/_/id/39121682/how-argentina-won-2022-world-cup-their-own-words",
                    "snippet": "On Dec. 18, 2022, Argentina won the men's World Cup in the most dramatic way possible, beating France in a penalty shootout after a breathless 3-3 draw.",
                    "date": "Dec 18, 2023",
                    "position": 3
                },
                {
                    "title": "FIFA World Cup Qatar 2022™",
                    "link": "https://www.fifa.com/en/tournaments/mens/worldcup/qatar2022",
                    "snippet": "The FIFA World Cup Qatar 2022™ was played from 20 November to 18 December 2022. 32 teams competed across 64 matches in the 22nd edition of the tournament.",
                    "sitelinks": [
                        {
                            "title": "Knockout and Groups",
                            "link": "https://www.fifa.com/en/tournaments/mens/worldcup/qatar2022/knockout-and-groups"
                        },
                        {
                            "title": "Scores & Fixtures",
                            "link": "https://www.fifa.com/en/tournaments/mens/worldcup/qatar2022/scores-fixtures"
                        },
                        {
                            "title": "FIFA World Cup Trophy Tour",
                            "link": "https://www.fifa.com/en/tournaments/mens/worldcup/qatar2022/fifaworldcuptrophytour"
                        },
                        {
                            "title": "Highlights",
                            "link": "https://www.fifa.com/en/tournaments/mens/worldcup/qatar2022/qatar-highlights"
                        }
                    ],
                    "position": 4
                },
                {
                    "title": "FIFA Men's World Cup Winners List | FOX Sports",
                    "link": "https://www.foxsports.com/soccer/2022-fifa-world-cup/history",
                    "snippet": "See our comprehensive FIFA Men's World Cup history guide for everything you need about the tournament. FIFA Men's World Cup results and which countries have ...",
                    "sitelinks": [
                        {
                            "title": "Schedule",
                            "link": "https://www.foxsports.com/soccer/2022-fifa-world-cup/scores"
                        },
                        {
                            "title": "Argentina Team News - Soccer",
                            "link": "https://www.foxsports.com/soccer/argentina-men-team"
                        },
                        {
                            "title": "France Team News - Soccer",
                            "link": "https://www.foxsports.com/soccer/france-men-team"
                        },
                        {
                            "title": "Awards",
                            "link": "https://www.foxsports.com/soccer/2022-fifa-world-cup/awards"
                        }
                    ],
                    "position": 5
                },
                {
                    "title": "2022 FIFA World Cup | Qatar, Controversy, Stadiums, Winner, & Final",
                    "link": "https://www.britannica.com/sports/2022-FIFA-World-Cup",
                    "snippet": "Argentina won its third World Cup victory in the tournament after defeating France in the final match.",
                    "date": "Apr 15, 2025",
                    "position": 6
                },
                {
                    "title": "Argentina vs. France Highlights | 2022 FIFA World Cup Final",
                    "link": "https://www.youtube.com/watch?v=Mxkg3qLIPC8",
                    "snippet": "... 2022 FIFA World Cup Final https://youtu.be/Mxkg3qLIPC8 FOX Soccer https://www.youtube.com/user/Foxsoccer.",
                    "date": "Dec 18, 2022",
                    "position": 7
                },
                {
                    "title": "World Cup Football Winners List - Topend Sports",
                    "link": "https://www.topendsports.com/events/worldcupsoccer/winners.htm",
                    "snippet": "Here are the full list of winners of the previous men's FIFA World Cups. Brazil has won the most titles, and Italy and Brazil are the only countries to win back ...",
                    "sitelinks": [
                        {
                            "title": "North America 2026 FIFA...",
                            "link": "https://www.topendsports.com/events/worldcupsoccer/hosts/2026/index.htm"
                        },
                        {
                            "title": "Brazil",
                            "link": "https://www.topendsports.com/events/worldcupsoccer/countries/brazil.htm"
                        },
                        {
                            "title": "Germany",
                            "link": "https://www.topendsports.com/events/worldcupsoccer/countries/germany.htm"
                        },
                        {
                            "title": "Uruguay",
                            "link": "https://www.topendsports.com/events/worldcupsoccer/countries/uruguay.htm"
                        }
                    ],
                    "position": 8
                },
                {
                    "title": "Mbappe v Messi: The FIFA World Cup 2022 Final - YouTube",
                    "link": "https://www.youtube.com/watch?v=z_AZwdFg6uA",
                    "snippet": "Mbappe v Messi: The FIFA World Cup 2022 Final. 2.9M views · 1 ... Comments1.3K. Test Test. The day that football won. Forever. 7:39 · Go to ...",
                    "date": "Mar 16, 2024",
                    "position": 9
                }
            ],
            "peopleAlsoAsk": [
                {
                    "question": "Who won the last World Cup in 2022?",
                    "snippet": "Argentina national football team\n2022 World Cup / Champion"
                },
                {
                    "question": "What men's team won the last World Cup?",
                    "snippet": "Men's World Cup titles won from 1930 to 2022, by country\nyear\nresult\n\n2010\nSpain*\n0\n2014\nGermany*\n0\n2018\nFrance\n2\n2022\nArgentina**\n3",
                    "title": "World Cup | History & Winners - Britannica",
                    "link": "https://www.britannica.com/sports/World-Cup-football"
                }
            ],
            "relatedSearches": [
                {
                    "query": "2022 World Cup"
                },
                {
                    "query": "2022 FIFA World Cup final"
                },
                {
                    "query": "World Cup 2022 winner"
                },
                {
                    "query": "2022 World Cup"
                },
                {
                    "query": "When did Argentina win the World Cup 2022"
                },
                {
                    "query": "World Cup Final 2022 Full Match"
                },
                {
                    "query": "World Cup final viewers worldwide 2022"
                },
                {
                    "query": "Who won the World Cup 2023"
                },
                {
                    "query": "FIFA World Cup 2022 Qualifiers"
                }
            ],
            "credits": 1
        }
    }
      console.log('Web search response:', {
        status: searchData.status,
        statusText: searchData.statusText,
        data: searchData.data
      });
      
      // Format search results for the user
      const formattedResults = formatSearchResults(searchData.data);
      
      // Append the search results to the chat
      append({
        id,
        content: formattedResults,
        role: 'user'
      });
      
      // Now use your existing chat API endpoint
      toast.loading('Processing with Claude...', { id: toastId });
      
      // Generate a UUID for the message
      const messageId = nanoid();
      
      // Create a request body for your API endpoint
      const requestBody = {
        id: chatId,
        selectedChatModel: 'claude-3-sonnet',  
        selectedVisibilityType: 'public',
        message: {
          id: messageId,
          role: 'user',
          content: `Web search results for "${input}":\n\n${formattedResults}\n\nBased on these search results, please provide a concise answer to: ${input}`,
          parts: [{ 
            type: 'text', 
            text: `Web search results for "${input}":\n\n${formattedResults}\n\nBased on these search results, please provide a concise answer to: ${input}` 
          }],
          createdAt: new Date().toISOString(),
        }
      };
      
      // Send the search results to your existing chat API
      const llmResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      if (!llmResponse.ok) {
        const errorText = await llmResponse.text();
        throw new Error(`Failed to get LLM response: ${errorText}`);
      }
      
      toast.success('Web search completed', { id: toastId });
    } catch (error) {
      console.error('Web search error:', error);
      toast.error(error instanceof Error ? error.message : 'An unknown error occurred', { id: toastId });
    }
  }, [append, chatId]);

  // Helper function to format search results
  const formatSearchResults = (searchData: any): string => {
    if (!searchData || !searchData.results || !Array.isArray(searchData.results)) {
      return 'No search results found.';
    }
    
    const results = searchData.results.slice(0, 3); // Take top 3 results
    
    return `
Here are the search results for your query:

${results.map((result: any, index: number) => `
[Result ${index + 1}]
Title: ${result.title || 'No title'}
Snippet: ${result.snippet || 'No description'}
URL: ${result.link || 'No link'}
`).join('\n')}
    `;
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
    window.history.replaceState({}, '', `/chat/${chatId}`);
    
    if (webSearchActive) {
      // First API call: Append user message to chat
      console.log("1. Appending user message to chat");
      append({
        content: input,
        role: 'user',
      });
      
      console.log("2. handleWebSearch called - will process the search");
      // Perform web search with the input
      handleWebSearch(input)
        .then(() => {
          console.log("Web search completed successfully");
        })
        .catch(error => {
          console.error("Web search failed:", error);
          // Show error toast if not already shown
          toast.error('Web search failed. You can try again.', { id: 'web-search-toast' });
        });
      
      // Clear input field immediately so user can type a new message
      setInput('');
    } else {
      console.log("handleSubmit called - regular chat message");
      // Normal submission - single API call
      try {
        handleSubmit(undefined, {
          experimental_attachments: attachments,
        });
      } catch (error) {
        console.error("Message submission failed:", error);
        toast.error('Failed to send message. Please try again.');
      }
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
    append,
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
        placeholder="Send a message..."
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
          handleWebSearch={() => setWebSearchActive(!webSearchActive)} 
          status={status}
          isActive={webSearchActive}
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
}: {
  submitForm: () => void;
  input: string;
  uploadQueue: Array<string>;
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
      <ArrowUpIcon size={14} />
    </Button>
  );
}

const SendButton = memo(PureSendButton, (prevProps, nextProps) => {
  if (prevProps.uploadQueue.length !== nextProps.uploadQueue.length)
    return false;
  if (prevProps.input !== nextProps.input) return false;
  return true;
});

function PureWebSearchButton({
  input,
  handleWebSearch,
  status,
  isActive,
}: {
  input: string;
  handleWebSearch: () => void;
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
        handleWebSearch();
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
