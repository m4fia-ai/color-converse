import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Textarea } from './ui/textarea';
import { Settings, Send, Paperclip, Loader2, Bot, User, Wrench, Terminal, RefreshCw, Play, Pause, FileText, ChevronDown, ChevronRight, Circle, Copy, Check, Activity, Clock, CheckCircle, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { useToast } from '@/hooks/use-toast';
import { MCPClientManager } from '@/lib/mcpClient';
import { generateSystemPrompt } from '@/lib/generateSystemPrompt';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ToolCallIndicator } from './ToolCallIndicator';
import { CampaignSummaryTable } from './CampaignSummaryTable';

interface MCPTool {
  name: string;
  description: string;
  inputSchema?: any;
}

interface ToolCall {
  id: string;
  name: string;
  args: any;
  result?: any;
  error?: string;
  status: 'pending' | 'success' | 'error' | 'paused';
  startTime?: Date;
  endTime?: Date;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  toolCalls?: ToolCall[];
  timestamp: Date;
  isStreaming?: boolean;
  summary?: { items: any[]; title: string };
}

interface ConnectionLog {
  timestamp: Date;
  level: 'info' | 'error' | 'warning';
  message: string;
}

interface APIProvider {
  name: string;
  baseUrl: string;
  models: string[];
}

const API_PROVIDERS: APIProvider[] = [
  {
    name: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini'],
    baseUrl: 'https://svvunmtfkalnedeacmjq.supabase.co/functions/v1/openai-proxy'
  },
  {
    name: 'Anthropic',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    baseUrl: 'https://svvunmtfkalnedeacmjq.supabase.co/functions/v1/anthropic-proxy'
  },
  {
    name: 'Google',
    models: ['gemini-1.5-flash', 'gemini-1.5-pro'],
    baseUrl: 'https://svvunmtfkalnedeacmjq.supabase.co/functions/v1/google-proxy'
  }
];


/** Optional visible greeting that the user will see as the first assistant message */
const INITIAL_GREETING =
  "Hi there 👋  I'm Campaign Builder AI. How can I help you launch or improve a campaign today?";


export const MCPClient = () => {
  // UI conversation
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // MCP & connection state
  const [mcpTools, setMcpTools] = useState<MCPTool[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionLogs, setConnectionLogs] = useState<ConnectionLog[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Provider settings
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [googleApiKey, setGoogleApiKey] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<APIProvider>(API_PROVIDERS[0]);
  const [selectedModel, setSelectedModel] = useState('');

  // Misc refs
  const mcpClientRef = useRef<MCPClientManager>(new MCPClientManager());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const didInitRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const abortedRef = useRef(false);
  const { toast } = useToast();
  const [serverUrl] = useState('https://redis-hosted-mcp-server-production.up.railway.app/mcp');

  // Anthropic tool name mapping (safe name -> original MCP name)
  const anthropicToolNameMapRef = useRef<Map<string, string>>(new Map());

  /** Provider‑formatted conversation history (kept outside React state so we
   *   can mutate synchronously without rerenders). Each element is already in
   *   the shape expected by the specific provider. */
  const providerMessagesRef = useRef<any[]>([]);


  useEffect(() => {
    if (didInitRef.current) return;   // already initialised
    didInitRef.current = true;
  
    const now = new Date();
    const provider = selectedProvider.name;   // "OpenAI" | "Anthropic" | "Google"
  
    /* 1️⃣  Push the hidden system prompt in the shape each provider expects */
    if (provider === 'OpenAI') {
      // OpenAI accepts the prompt as a normal "system" message
      providerMessagesRef.current.push({
        role: 'system',
        content: generateSystemPrompt([]),
      });
    }
    // For Anthropic, don't push system message to messages array - use top-level system field
    // For Google, Gemini requests are built from scratch in callLLM
  
    /* 2️⃣  Show a friendly greeting to the user */
    setMessages([
      {
        id: 'initial-greeting',
        role: 'assistant',
        content: INITIAL_GREETING,
        timestamp: now,
      },
    ]);
  }, []); 

  /* ──────────────────────────── EFFECTS ──────────────────────────────── */
  useEffect(() => {
    // Restore persisted settings
    const saved = localStorage.getItem('climaty-settings');
    if (saved) {
      const s = JSON.parse(saved);
      setOpenaiApiKey(s.openaiApiKey ?? '');
      setAnthropicApiKey(s.anthropicApiKey ?? '');
      setGoogleApiKey(s.googleApiKey ?? '');
      const p = API_PROVIDERS.find(p => p.name === s.provider) ?? API_PROVIDERS[0];
      setSelectedProvider(p);
      setSelectedModel(s.model ?? p.models[0]);
    } else {
      setSelectedModel(API_PROVIDERS[0].models[0]);
    }
    connectToMCPServer();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Keep system prompt up-to-date when tools change (OpenAI only)
  useEffect(() => {
    if (
      selectedProvider.name === 'OpenAI' &&
      providerMessagesRef.current.length &&
      providerMessagesRef.current[0].role === 'system'
    ) {
      providerMessagesRef.current[0].content = generateSystemPrompt(mcpTools);
    }
  }, [mcpTools, selectedProvider.name]);

  /* ─────────────────────────── LOGGING HELPERS ───────────────────────── */
  const addLog = (level: 'info' | 'error' | 'warning', message: string) => {
    setConnectionLogs(prev => [...prev, { timestamp: new Date(), level, message }]);
    console[level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log'](`[MCP ${level.toUpperCase()}]`, message);
  };

  /* ────────────────────── MCP SERVER CONNECTION ─────────────────────── */
  const connectToMCPServer = async () => {
    setIsConnecting(true);
    setIsConnected(false);
    setMcpTools([]);
    setConnectionLogs([]);
    addLog('info', `Connecting to MCP @ ${serverUrl}`);
    try {
      if (mcpClientRef.current.isConnected()) await mcpClientRef.current.disconnect();
      await mcpClientRef.current.connect(serverUrl, manifest => {
        const tools = manifest.tools ?? [];
        setMcpTools(tools);
        setIsConnected(true);
        setIsConnecting(false);

        // 🔑 Update system message for OpenAI only
        if (
          selectedProvider.name === 'OpenAI' &&
          providerMessagesRef.current.length &&
          providerMessagesRef.current[0].role === 'system'
        ) {
          providerMessagesRef.current[0].content = generateSystemPrompt(tools);
        }

        addLog('info', `Connected – ${tools.length} tools ready`);
        toast({ title: 'MCP Connected', description: `${tools.length} tools available` });
      });
    } catch (e: any) {
      addLog('error', `Connection failed: ${e.message ?? e}`);
      setIsConnecting(false);
      toast({ title: 'MCP connection failed', description: e.message ?? String(e), variant: 'destructive' });
    }
  };

  /* ───────────────────────── IMAGE HANDLERS ─────────────────────────── */
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(f => {
      const reader = new FileReader();
      reader.onload = ev => ev.target?.result && setSelectedImages(prev => [...prev, ev.target!.result as string]);
      reader.readAsDataURL(f);
    });
  };
  const removeImage = (idx: number) => setSelectedImages(prev => prev.filter((_, i) => i !== idx));

  // Copy functionality
  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStates(prev => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [id]: false }));
      }, 2000);
      toast({ title: 'Copied to clipboard', description: 'Content copied successfully' });
    } catch (err) {
      toast({ title: 'Copy failed', description: 'Failed to copy to clipboard', variant: 'destructive' });
    }
  };

  // Helper function to get the appropriate API key
  const getCurrentApiKey = () => {
    switch (selectedProvider.name) {
      case 'OpenAI': return openaiApiKey;
      case 'Anthropic': return anthropicApiKey;
      case 'Google': return googleApiKey;
      default: return '';
    }
  };

  // Helper: guarantee a valid JSON Schema object for Anthropic
  const ensureValidJsonSchema = (schema?: any) => {
    if (schema && typeof schema === 'object' && schema.type) return schema;
    // Fallback to permissive object schema if MCP tool has no schema
    return { type: 'object', additionalProperties: true };
  };

  /* ────────────────────────── SEND MESSAGE ──────────────────────────── */
  const sendMessage = async () => {
    if ((!inputMessage.trim() && selectedImages.length === 0) || isLoading) return;
    const currentApiKey = getCurrentApiKey();
    if (!currentApiKey) return toast({ title: `Missing ${selectedProvider.name} API key`, variant: 'destructive' });

    // Reset pause state when starting new conversation
    setIsPaused(false);

    // 1️⃣ Update UI & provider histories ---------------------------------
    const uiMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      images: selectedImages.length ? [...selectedImages] : undefined,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, uiMsg]);
    setInputMessage('');
    setSelectedImages([]);

    // Provider‑specific message format
    const providerUserMsg = buildProviderUserMessage(inputMessage, selectedImages);
    providerMessagesRef.current.push(providerUserMsg);

    // 2️⃣ Call the model --------------------------------------------------
    await callLLM();
  };

  // Call this to stop the current run
  const stopCurrentRun = () => {
    abortedRef.current = true;
    abortRef.current?.abort();           // abort fetch
    setIsPaused(true);
    setIsLoading(false);
    addLog('info', 'Generation stopped by user');
  };

  /* ──────────────────────── LLM CALL WRAPPER ─────────────────────────── */
  const callLLM = async () => {
    setIsLoading(true);
    abortedRef.current = false;
    try {
      const provider = selectedProvider.name;

      // NEW: create controller and pass signal to fetch
      abortRef.current = new AbortController();

      // Prepare tools payload if available
      let tools: any[] | undefined;
      if (mcpTools.length && isConnected) {
        if (provider === 'Anthropic') {
          // Clear and rebuild the name mapping for Anthropic
          anthropicToolNameMapRef.current = new Map();
          tools = mcpTools.map(t => {
            const safe = (t.name || 'tool')
              .replace(/[^a-zA-Z0-9_-]/g, '_')  // Anthropic's allowed chars
              .slice(0, 64) || 'tool';
            anthropicToolNameMapRef.current.set(safe, t.name);
            return {
              name: safe,
              description: t.description || 'No description provided',
              input_schema: ensureValidJsonSchema(t.inputSchema),
            };
          });
        } else {
          // OpenAI format
          tools = mcpTools.map(t => ({ 
            type: 'function', 
            function: { 
              name: t.name, 
              description: t.description, 
              parameters: t.inputSchema ?? {} 
            } 
          }));
        }
      }

      // Use proxy endpoints with streaming
      let messagesForRequest = providerMessagesRef.current;

      // Anthropic: remove any stray system msgs and set top-level system field
      if (provider === 'Anthropic') {
        messagesForRequest = messagesForRequest.filter(m => m.role !== 'system');
      }

      const body: any = {
        apiKey: getCurrentApiKey(),
        model: selectedModel,
        messages: messagesForRequest,
        maxTokens: 1000,
        tools,
        stream: true
      };

      // Add system prompt as top-level field for Anthropic
      if (provider === 'Anthropic') {
        body.system = generateSystemPrompt(mcpTools);
        body.extra_headers = {
          "anthropic-beta": "prompt-caching-2024-07-31"
        };
      }

      // Now streaming works with tools, so we can keep it enabled

      const resp = await fetch(selectedProvider.baseUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(provider !== 'Google' ? { 
            'Accept': 'text/event-stream',
            'Accept-Encoding': 'identity'
          } : {})
        },
        body: JSON.stringify(body),
        signal: abortRef.current.signal,        // 👈 important
      });

      if (!resp.ok) {
        const ct = resp.headers.get('content-type') || 'unknown';
        addLog('error', `LLM HTTP ${resp.status} (${ct})`);
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.error || `${provider} API error ${resp.status}`);
      }

      const ct = resp.headers.get('content-type') || '';
      addLog('info', `LLM response content-type: ${ct}, status: ${resp.status}`);

      // Force streaming for OpenAI/Anthropic when stream=true was sent
      const shouldStream = provider !== 'Google' && body.stream === true;
      
      if (shouldStream) {
        addLog('info', 'Attempting to handle as streaming response');
        await handleStreamingResponse(resp, provider);   // ⇠ NEW ARG
        return;
      }

      // Fallback to non-streaming
      const data = await resp.json();
      if (abortedRef.current) return;           // don't update UI after stop

      // Handle Google response format differently
      if (provider === 'Google') {
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response';
        appendAssistantMessage(text);
        return;
      }

      await handleLLMResponse(data);
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        addLog('info', 'Fetch aborted by user');
        return; // silent
      }
      toast({ title: 'LLM Error', description: e.message ?? String(e), variant: 'destructive' });
      addLog('error', e.message ?? String(e));
    } finally {
      if (!abortedRef.current) setIsLoading(false);
    }
  };

  /* ─────────────────── HANDLE STREAMING RESPONSE ──────────────────────── */
  const handleStreamingResponse = async (response: Response, provider: string) => {
    const reader = response.body!
      .pipeThrough(new TextDecoderStream())
      .getReader();

    const streamingId = `stream-${crypto.randomUUID()}`;
    console.log('🌊 Will create streaming message when content arrives, id:', streamingId);
    
    let messageCreated = false;
    let buffer = '';
    let fullText = '';
    let accumulatedToolCalls: any = {}; // Accumulate tool call data for OpenAI
    let pendingAnthropicToolUses: any[] = [];  // NEW: collect Anthropic tool_use events

    try {
      while (true) {
        if (abortedRef.current) {
          try { await reader.cancel(); } catch {}
          return;                          // 👈 leave immediately
        }

        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;

        // Process every complete SSE event (blank line = event boundary)
        try {
          while (true) {
            // Prefer CRLFCRLF first (Windows/HTTP default), else LFLF
            const crlf = buffer.indexOf('\r\n\r\n');
            const lflf = buffer.indexOf('\n\n');

            if (crlf === -1 && lflf === -1) break;

            // Pick earliest boundary and its length
            let boundaryIndex: number;
            let boundaryLen: number;
            if (crlf !== -1 && (lflf === -1 || crlf < lflf)) {
              boundaryIndex = crlf;
              boundaryLen = 4;       // \r\n\r\n
            } else {
              boundaryIndex = lflf;
              boundaryLen = 2;       // \n\n
            }

            const raw = buffer.slice(0, boundaryIndex);
            buffer = buffer.slice(boundaryIndex + boundaryLen);

            // Normalize and split lines
            const normalized = raw.replace(/\r/g, '');
            const lines = normalized.split('\n');

            // Capture event name (may be undefined for OpenAI)
            const eventLine = lines.find(l => l.startsWith('event:'));
            const eventName = eventLine ? eventLine.slice('event:'.length).trim() : undefined;

            // Join ALL data lines per SSE spec
            const dataPayload = lines
              .filter(l => l.startsWith('data:'))
              .map(l => l.slice('data:'.length).trimStart())
              .join('\n');

            if (!dataPayload) continue;

            // OpenAI terminator
            if (dataPayload === '[DONE]') {
              try { await reader.cancel(); } catch {}
              throw new Error('__STREAM_END__');
            }

            let parsed: any;
            try {
              parsed = JSON.parse(dataPayload);
            
              /* ------------- OPENAI ------------- */
            if (provider === 'OpenAI') {
              /* text tokens */
              const deltaTxt = parsed.choices?.[0]?.delta?.content;
              if (deltaTxt) {
                fullText += deltaTxt;
                
                // Create message only when we have content
                if (!messageCreated) {
                  console.log('🌊 Creating streaming message with first content');
                  setMessages(prev => [
                    ...prev,
                    { id: streamingId, role: 'assistant', content: fullText, timestamp: new Date(), isStreaming: true }
                  ]);
                  messageCreated = true;
                } else {
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === streamingId ? { ...m, content: fullText } : m
                    )
                  );
                }
              }
              /* tool calls - accumulate incremental data */
              const tcArr = parsed.choices?.[0]?.delta?.tool_calls;
              if (tcArr) {
                tcArr.forEach((tc: any) => {
                  if (!accumulatedToolCalls[tc.index]) {
                    accumulatedToolCalls[tc.index] = {
                      id: tc.id || '',
                      type: tc.type || 'function',
                      function: {
                        name: tc.function?.name || '',
                        arguments: tc.function?.arguments || ''
                      }
                    };
                  } else {
                    // Accumulate arguments incrementally
                    if (tc.function?.arguments) {
                      accumulatedToolCalls[tc.index].function.arguments += tc.function.arguments;
                    }
                    if (tc.function?.name) {
                      accumulatedToolCalls[tc.index].function.name = tc.function.name;
                    }
                    if (tc.id) {
                      accumulatedToolCalls[tc.index].id = tc.id;
                    }
                  }
                });

                // Check if we have complete tool calls with valid JSON arguments
                const completeToolCalls = Object.values(accumulatedToolCalls).filter((tc: any) => {
                  try {
                    return tc.function.name && tc.function.arguments && JSON.parse(tc.function.arguments);
                  } catch {
                    return false;
                  }
                });

                if (completeToolCalls.length > 0) {
                  const toolCalls: ToolCall[] = completeToolCalls.map((tc: any) => ({
                    id: tc.id,
                    name: tc.function.name,
                    args: JSON.parse(tc.function.arguments),
                    status: 'pending',
                  }));
                  
                  providerMessagesRef.current.push({
                    role: 'assistant',
                    tool_calls: completeToolCalls,
                    content: null,
                  });
                  
                  // Create or update message with tool calls
                  if (!messageCreated) {
                    appendAssistantMessage(fullText, toolCalls);
                    messageCreated = true;
                  } else {
                    // Update existing streaming message with tool calls
                    setMessages(prev =>
                      prev.map(m =>
                        m.id === streamingId ? { ...m, toolCalls, isStreaming: false } : m
                      )
                    );
                  }
                  await executeToolCalls(toolCalls);
                  fullText = '';
                  accumulatedToolCalls = {}; // Reset for next set of tool calls
                }
              }
            }

            /* ------------- ANTHROPIC ------------- */
            if (provider === 'Anthropic') {
              // Text deltas
              if (eventName === 'content_block_delta' && parsed.delta?.text) {
                fullText += parsed.delta.text;
                
                // Create message only when we have content
                if (!messageCreated) {
                  console.log('🌊 Creating streaming message with first content (Anthropic)');
                  setMessages(prev => [
                    ...prev,
                    { id: streamingId, role: 'assistant', content: fullText, timestamp: new Date(), isStreaming: true }
                  ]);
                  messageCreated = true;
                } else {
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === streamingId ? { ...m, content: fullText } : m
                    )
                  );
                }
              }

              // Tool call begins here (data.type === 'tool_use' on content_block_start)
              if (eventName === 'content_block_start' && parsed.type === 'tool_use') {
                pendingAnthropicToolUses.push(parsed);

                const toolCalls: ToolCall[] = [{
                  id: parsed.id,
                  name: parsed.name,
                  args: parsed.input,
                  status: 'pending',
                }];
                
                // Create or update message with tool calls
                if (!messageCreated) {
                  appendAssistantMessage(fullText, toolCalls);
                  messageCreated = true;
                } else {
                  // Update existing streaming message with tool calls
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === streamingId ? { 
                        ...m, 
                        toolCalls: [...(m.toolCalls || []), ...toolCalls],
                        isStreaming: false 
                      } : m
                    )
                  );
                }
              }

              // End of message: now execute all tool uses
              if (eventName === 'message_stop') {
                if (pendingAnthropicToolUses.length) {
                  const toolCalls: ToolCall[] = pendingAnthropicToolUses.map(p => ({
                    id: p.id, name: p.name, args: p.input, status: 'pending'
                  }));

                  providerMessagesRef.current.push({ role: 'assistant', content: pendingAnthropicToolUses });
                  await executeToolCalls(toolCalls);
                  pendingAnthropicToolUses = [];
                  fullText = '';
                }
                // mark end and break both loops
                try { await reader.cancel(); } catch {}
                throw new Error('__STREAM_END__');
              }
            }
            } catch (err) {
              console.warn('Bad SSE chunk', err, dataPayload);
              continue;
            }
          }
        } catch (e) {
          if ((e as any)?.message === '__STREAM_END__' || String(e).includes('__STREAM_END__')) break; // exits outer while
          throw e;
        }
      }
    } catch (error) {
      if ((error as any)?.message !== '__STREAM_END__' && !String(error).includes('__STREAM_END__')) {
        console.error('Streaming error:', error);
        setMessages(prev => prev.filter(m => m.id !== streamingId));
        toast({ title: 'Streaming error', description: 'Connection interrupted', variant: 'destructive' });
      }
    }

    // finalise message
    setMessages(prev =>
      prev.map(m =>
        m.id === streamingId ? { ...m, isStreaming: false } : m
      )
    );
    
    // Only push assistant message if there's actual content
    if (fullText.trim()) {
      providerMessagesRef.current.push(
        provider === 'Anthropic'
          ? { role: 'assistant', content: [{ type: 'text', text: fullText }] }
          : { role: 'assistant', content: fullText }
      );
    }
  };


  /* ─────────────────── HANDLE FIRST ASSISTANT RESPONSE ───────────────── */
  const handleLLMResponse = async (data: any) => {
    const provider = selectedProvider.name;

    if (provider === 'OpenAI') {
      const msg = data.choices?.[0]?.message;
      if (!msg) return;

      if (msg.tool_calls?.length) {
        // Assistant wants to use tools
        providerMessagesRef.current.push(msg); // content may be null, but tool_calls present
        const toolCalls: ToolCall[] = msg.tool_calls.map((tc: any) => ({
          id: tc.id,
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments),
          status: 'pending'
        }));
        // Show tool calls in UI even without content
        appendAssistantMessage('', toolCalls);
        await executeToolCalls(toolCalls);
      } else {
        appendAssistantMessage(msg.content ?? '');
      }
    } else if (provider === 'Anthropic') {
      const parts = data.content as any[];
      const assistantMsgForProvider: any[] = [];
      const toolCalls: ToolCall[] = [];
      let collectedText = '';

      for (const part of parts) {
        if (part.type === 'text') {
          collectedText += part.text;
          assistantMsgForProvider.push(part);
        } else if (part.type === 'tool_use') {
          toolCalls.push({ id: part.id, name: part.name, args: part.input, status: 'pending' });
          assistantMsgForProvider.push(part);
        }
      }
      // Push assistant message (could include tool_use parts)
      providerMessagesRef.current.push({ role: 'assistant', content: assistantMsgForProvider });

      if (toolCalls.length) {
        // Always show tool calls, but only include text if there is some
        appendAssistantMessage(collectedText, toolCalls);
        await executeToolCalls(toolCalls);
      } else {
        appendAssistantMessage(collectedText);
      }
    }
  };

  /* ───────────────────────── APPEND UI MESSAGE ───────────────────────── */
  const appendAssistantMessage = (content: string, toolCalls?: ToolCall[]) => {
    console.log('📝 appendAssistantMessage called:', { content, toolCalls, hasContent: !!content.trim() });
    setMessages(prev => [
      ...prev,
      { id: (Date.now() + Math.random()).toString(), role: 'assistant', content, toolCalls, timestamp: new Date() }
    ]);
  };

  // Remove this function as it was causing empty message boxes

  const appendCampaignSummary = (items: any[], title: string) => {
    setMessages(prev => [
      ...prev,
      { 
        id: `summary-${Date.now()}`, 
        role: 'assistant', 
        content: '',
        summary: { items, title },
        timestamp: new Date() 
      }
    ]);
  };

  /* ───────────────────── CAMPAIGN SUMMARY PARSER ─────────────────────── */
  const parseCampaignResults = (toolCalls: ToolCall[]) => {
    const items: any[] = [];

    const pick = (obj: any, paths: string[]) => {
      for (const p of paths) {
        const v = p.split('.').reduce((o, k) => (o && k in o ? o[k] : undefined), obj);
        if (v !== undefined && v !== null && v !== '') return v;
      }
      return undefined;
    };

    for (const tc of toolCalls) {
      if (!(tc.result && tc.status === 'success')) continue;

      const raw = typeof tc.result === 'string' ? (() => { try { return JSON.parse(tc.result); } catch { return {}; } })() : tc.result;

      // --- Campaign ---
      if (tc.name.toLowerCase().includes('campaign') && (pick(raw, ['campaign_id','id','campaign_details.id']))) {
        items.push({
          type: 'campaign',
          name: pick(raw, ['campaign_details.name', 'name', 'campaign_name']) ?? 'New Campaign',
          id:   pick(raw, ['campaign_id', 'campaign_details.id', 'id']),
          status: pick(raw, ['campaign_details.status', 'status']) ?? 'ACTIVE',
          budget: pick(raw, ['campaign_details.daily_budget']) ?? (tc.args?.daily_budget ? `${tc.args.daily_budget}/day` : undefined),
        });
        continue;
      }

      // --- Ad Set ---
      if (tc.name.toLowerCase().includes('adset') || tc.name.toLowerCase().includes('ad_set')) {
        const id = pick(raw, ['adset_id','resource_id','id']);
        if (id) {
          items.push({
            type: 'adset',
            name: pick(raw, ['adset_details.name','details.name','name','adset_name','ad_set_name']) ?? 'New Ad Set',
            id,
            status: pick(raw, ['adset_details.status','status']) ?? 'ACTIVE',
            budget: pick(tc.args ?? {}, ['budget']) ? `${tc.args.budget}` : undefined,
            targeting: tc.args?.targeting ? JSON.stringify(tc.args.targeting).slice(0, 80) + '…' : undefined,
          });
        }
        continue;
      }

      // --- Ad ---
      if (tc.name.toLowerCase().includes('ad') && !tc.name.toLowerCase().includes('adset')) {
        const id = pick(raw, ['ad_id','id']);
        if (id) {
          items.push({
            type: 'ad',
            name: pick(raw, ['ad_details.name','name','ad_name']) ?? 'New Ad',
            id,
            status: pick(raw, ['ad_details.status','status']) ?? 'ACTIVE',
            creative: tc.args?.creative_type || (tc.args?.image_url || tc.args?.video_url ? 'Image/Video' : undefined),
          });
        }
      }
    }

    // Title: if all same type, use that; else generic
    const types = new Set(items.map(i => i.type));
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const title = types.size === 1 ? `${cap([...types][0])} Creation Summary` : 'Creation Summary';

    return { items, title };
  };

  /* ────────────────────────── TOOL EXECUTION ─────────────────────────── */
  const executeToolCalls = async (toolCalls: ToolCall[]) => {
    const provider = selectedProvider.name;

    // Tool call indicators are handled by the ToolCallIndicator component

    for (const tc of toolCalls) {
      // Check if aborted before each tool execution
      if (abortedRef.current) {
        tc.status = 'paused';
        setMessages(prev => [...prev]); // Force update
        return;
      }

      setActiveToolCall(tc.id);
      updateToolCallStatus(tc.id, 'pending');
      tc.startTime = new Date();
      
      // Map Anthropic safe tool name back to original MCP tool name
      let execName = tc.name;
      if (selectedProvider.name === 'Anthropic') {
        const mapped = anthropicToolNameMapRef.current.get(tc.name);
        if (mapped) execName = mapped;  // map safe name -> real MCP tool name
      }
      
      // Tool call status is handled by the ToolCallIndicator component
      
      try {
        // Automatically inject session_id for subsequent tool calls
        const toolArgs = { ...tc.args };
        if (sessionId && !toolArgs.session_id) {
          toolArgs.session_id = sessionId;
          addLog('info', `Auto-injecting session_id: ${sessionId} for tool ${execName}`);
        }

        const result = await mcpClientRef.current.callTool(execName, toolArgs);
        
        // Check if aborted after tool execution
        if (abortedRef.current) {
          tc.status = 'paused';
          setMessages(prev => [...prev]); // Force update
          return;
        }
        
        // Extract session_id from the first tool call response
        if (!sessionId && result) {
          let extractedSessionId = null;
          
          // Try to extract session_id from various possible response formats
          if (result.content) {
            if (Array.isArray(result.content)) {
              // Check each content item for session_id
              for (const item of result.content) {
                if (typeof item === 'object' && item.session_id) {
                  extractedSessionId = item.session_id;
                  break;
                }
                if (typeof item === 'object' && item.text) {
                  try {
                    const parsed = JSON.parse(item.text);
                    if (parsed.session_id) {
                      extractedSessionId = parsed.session_id;
                      break;
                    }
                  } catch (e) {
                    // Not JSON, continue
                  }
                }
              }
            } else if (typeof result.content === 'object' && result.content.session_id) {
              extractedSessionId = result.content.session_id;
            } else if (typeof result.content === 'string') {
              try {
                const parsed = JSON.parse(result.content);
                if (parsed.session_id) {
                  extractedSessionId = parsed.session_id;
                }
              } catch (e) {
                // Not JSON, continue
              }
            }
          }
          
          // Also check top-level result for session_id
          if (!extractedSessionId && result.session_id) {
            extractedSessionId = result.session_id;
          }
          
          if (extractedSessionId) {
            setSessionId(extractedSessionId);
            addLog('info', `Session ID captured from first tool call: ${extractedSessionId}`);
          }
        }
        
        // Extract a displayable payload robustly
        let processedResult: any;

        if (result && 'content' in result && result.content !== undefined) {
          // Handle Anthropic/OpenAI-like payloads
          if (Array.isArray(result.content)) {
            processedResult = result.content
              .map((item: any) => {
                if (typeof item === 'object' && item.type === 'text' && item.text) return item.text;
                return typeof item === 'string' ? item : JSON.stringify(item);
              })
              .join('\n');
          } else if (typeof result.content === 'object') {
            processedResult = JSON.stringify(result.content);
          } else {
            processedResult = String(result.content ?? '');
          }
        } else {
          // Fallback: whole object is the payload (what your adset call returns)
          processedResult = typeof result === 'string' ? result : JSON.stringify(result);
        }
        
        tc.result = processedResult;
        tc.status = 'success';
        tc.endTime = new Date();
        const duration = tc.startTime ? tc.endTime.getTime() - tc.startTime.getTime() : 0;
        updateToolCallStatus(tc.id, 'success', processedResult);
        addLog('info', `Tool ${execName} executed`);
        
        // Tool call success is shown by the ToolCallIndicator component
      } catch (e: any) {
        tc.error = e.message ?? String(e);
        tc.status = 'error';
        tc.endTime = new Date();
        updateToolCallStatus(tc.id, 'error', undefined, tc.error);
        addLog('error', `Tool ${execName} failed: ${tc.error}`);
        
        // Tool call error is shown by the ToolCallIndicator component
      }

    }

    // Batch tool results for provider-specific handling
    const resultsForClaude: any[] = [];

    // Collect results for Anthropic (batched) or push individually for OpenAI
    for (const tc of toolCalls) {
      if (selectedProvider.name === 'OpenAI') {
        providerMessagesRef.current.push({ 
          role: 'tool', 
          tool_call_id: tc.id, 
          content: tc.result ?? tc.error ?? ''
        });
      } else if (selectedProvider.name === 'Anthropic') {
        resultsForClaude.push({
          type: 'tool_result',
          tool_use_id: tc.id,
          content: tc.result ?? tc.error ?? ''
        });
      }
    }

    // For Anthropic, push one user message with all tool results
    if (selectedProvider.name === 'Anthropic' && resultsForClaude.length > 0) {
      providerMessagesRef.current.push({
        role: 'user',
        content: resultsForClaude
      });
    }

    setActiveToolCall(null);

    // Only parse results if not aborted
    if (!abortedRef.current) {
      // Check for campaign/adset/ad creations and show summary
      const { items: campaignItems, title } = parseCampaignResults(toolCalls);
      if (campaignItems.length > 0) {
        appendCampaignSummary(campaignItems, title);
      }
    }

    // 🔁 Ask the LLM again so it can weave results into a final response
    await callLLM();
  };

  /* Helper to update ToolCall status inside UI messages */
  const updateToolCallStatus = (id: string, status: ToolCall['status'], result?: any, error?: string) => {
    setMessages(prev => prev.map(m => ({
      ...m,
      toolCalls: m.toolCalls?.map(tc => tc.id === id ? { ...tc, status, result: result ?? tc.result, error: error ?? tc.error } : tc)
    })));
  };

  /* ────────────── BUILD PROVIDER USER MESSAGE UTIL ──────────────────── */
  const buildProviderUserMessage = (text: string, images: string[]) => {
    const provider = selectedProvider.name;
    if (provider === 'Anthropic') {
      return { role: 'user', content: [{ type: 'text', text }] };
    }
    if (provider === 'OpenAI' && images.length) {
      return {
        role: 'user',
        content: [
          { type: 'text', text },
          ...images.map(url => ({ type: 'image_url', image_url: { url } }))
        ]
      };
    }
    return { role: 'user', content: text };
  };

  /* ───────────────────────── KEYBOARD HANDLER ────────────────────────── */
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getConnectionStatus = () => {
    if (isConnecting) return { color: 'text-yellow-500', label: 'Connecting...' };
    if (isConnected) return { color: 'text-green-500', label: 'Connected' };
    return { color: 'text-red-500', label: 'Disconnected' };
  };

  const connectionStatus = getConnectionStatus();

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
       <div className="flex items-center justify-between p-4 border-b border-primary bg-[#001000]">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <img 
              src="/lovable-uploads/644d29fb-8ef0-4256-aadd-617d9a8d4254.png" 
              alt="Climaty.AI" 
              className="h-8 w-auto"
            />
          </div>
          
          {/* Session ID Display */}
          {sessionId && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                Session: {sessionId.slice(0, 8)}...
              </Badge>
            </div>
          )}
          
          {/* Connection Status */}
          <div className="flex items-center gap-2">
            <Circle 
              className={`w-3 h-3 fill-current ${connectionStatus.color}`}
            />
            <span className="text-sm text-foreground">{connectionStatus.label}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Tools Dropdown */}
          {mcpTools.length > 0 && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="border-primary text-primary">
                  <Wrench className="w-4 h-4 mr-2" />
                  Tools ({mcpTools.length})
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Available Tools</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {mcpTools.map((tool, idx) => (
                    <Card key={idx} className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                        <div className="flex-1">
                          <h4 className="font-medium">{tool.name}</h4>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          )}
          
          {/* Clear Chat Button */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              setMessages([{
                id: 'initial-greeting',
                role: 'assistant',
                content: INITIAL_GREETING,
                timestamp: new Date(),
              }]);
              setSessionId(null);
              providerMessagesRef.current = [{
                role: 'system',
                content: generateSystemPrompt(mcpTools),
              }];
              addLog('info', 'Chat cleared and session reset');
              toast({ title: 'Chat cleared', description: 'Started new conversation' });
            }}
            className="border-primary text-primary"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            New Chat
          </Button>

          {/* Settings */}
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="border-primary text-primary">
                <Settings className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Settings</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="provider">AI Provider</Label>
                  <Select 
                    value={selectedProvider.name} 
                    onValueChange={name => {
                      const p = API_PROVIDERS.find(p => p.name === name)!;
                      setSelectedProvider(p);
                      setSelectedModel(p.models[0]);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {API_PROVIDERS.map(p => (
                        <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="model">Model</Label>
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedProvider.models.map(m => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="openaiApiKey">OpenAI API Key</Label>
                  <Input
                    id="openaiApiKey"
                    type="password"
                    value={openaiApiKey}
                    onChange={e => setOpenaiApiKey(e.target.value)}
                    placeholder="Enter OpenAI API key"
                  />
                </div>
                <div>
                  <Label htmlFor="anthropicApiKey">Anthropic API Key</Label>
                  <Input
                    id="anthropicApiKey"
                    type="password"
                    value={anthropicApiKey}
                    onChange={e => setAnthropicApiKey(e.target.value)}
                    placeholder="Enter Anthropic API key"
                  />
                </div>
                <div>
                  <Label htmlFor="googleApiKey">Google API Key</Label>
                  <Input
                    id="googleApiKey"
                    type="password"
                    value={googleApiKey}
                    onChange={e => setGoogleApiKey(e.target.value)}
                    placeholder="Enter Google API key"
                  />
                </div>
                <Button 
                  onClick={() => {
                    localStorage.setItem('climaty-settings', JSON.stringify({
                      openaiApiKey, anthropicApiKey, googleApiKey, 
                      provider: selectedProvider.name, 
                      model: selectedModel
                    }));
                    toast({ title: 'Settings saved' });
                  }}
                  className="w-full"
                >
                  Save Settings
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 p-4">
          <div className="max-w-4xl mx-auto space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <Bot className="w-12 h-12 mx-auto text-primary mb-4" />
                <h2 className="text-xl font-semibold mb-2 bg-gradient-to-r from-white to-[#999999] bg-clip-text text-transparent">
                  Welcome to Campaign Builder AI
                </h2>
                <p className="text-foreground max-w-md mx-auto mb-8">
                  Chat with me and launch your campaigns
                </p>
                <div className="max-w-lg mx-auto text-left bg-card/10 border border-primary/20 rounded-lg p-6">
                  <h3 className="text-sm font-semibold text-white mb-4 text-center">How the Process Works:</h3>
                  <div className="space-y-3 text-sm text-gray-300">
                    <div className="flex items-start gap-3">
                      <Circle className="h-2 w-2 text-primary mt-2 flex-shrink-0" />
                      <div>
                        <span className="font-medium text-white">AI Context:</span> Tool descriptions are injected into the AI's system prompt
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Circle className="h-2 w-2 text-primary mt-2 flex-shrink-0" />
                      <div>
                        <span className="font-medium text-white">User Input:</span> When a user sends a message, the AI analyzes it against available tools
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Circle className="h-2 w-2 text-primary mt-2 flex-shrink-0" />
                      <div>
                        <span className="font-medium text-white">Tool Selection:</span> The AI decides which tools to call based on the user's intent and tool descriptions
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {messages.filter(msg => 
              msg.content?.trim() || 
              (msg.toolCalls && msg.toolCalls.length > 0) || 
              msg.isStreaming ||
              msg.summary
            ).map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
                
                <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-first' : ''}`}>
                  <Card className={`p-4 ${msg.role === 'user' ? 'bg-primary text-primary-foreground border-none' : 'bg-transparent text-white border-[#46F245]'}`}>
                    {msg.images && msg.images.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {msg.images.map((img, idx) => (
                          <img key={idx} src={img} alt="" className="rounded max-h-32 object-cover" />
                        ))}
                      </div>
                    )}
                    
                    {msg.content && (
                      <MarkdownRenderer content={msg.content} />
                    )}
                    
                    {msg.summary && (
                      <CampaignSummaryTable
                        items={msg.summary.items}
                        title={msg.summary.title}
                      />
                    )}
                    
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                        {msg.toolCalls.map((tc) => (
                          <Collapsible key={tc.id}>
                            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-2 rounded bg-transparent text-xs">
                              <div className={`w-2 h-2 rounded-full ${
                                tc.status === 'success' ? 'bg-green-500' :
                                tc.status === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                              }`} />
                              <Wrench className="w-3 h-3" />
                              <span className="text-xs font-medium">{tc.name}</span>
                              <ChevronRight className="w-3 h-3 ml-auto" />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="p-2 text-xs">
                              <div className="space-y-2">
                                 <div>
                                   <strong>Args:</strong>
                                   <div className="relative">
                                     <pre className="mt-1 p-2 bg-black/20 rounded text-xs overflow-auto max-h-24 pr-8">
                                       {JSON.stringify(tc.args, null, 2)}
                                     </pre>
                                     <Button
                                       variant="ghost"
                                       size="sm"
                                       className="absolute top-2 right-1 h-6 w-6 p-0 hover:bg-white/10"
                                       onClick={() => copyToClipboard(JSON.stringify(tc.args, null, 2), `msg-args-${tc.id}`)}
                                     >
                                       {copiedStates[`msg-args-${tc.id}`] ? (
                                         <Check className="h-3 w-3 text-green-400" />
                                       ) : (
                                         <Copy className="h-3 w-3 text-white/70" />
                                       )}
                                     </Button>
                                   </div>
                                 </div>
                                 {tc.result && (
                                   <div>
                                     <strong>Result:</strong>
                                     <div className="relative">
                                       <pre className="mt-1 p-2 bg-black/20 rounded text-xs overflow-auto whitespace-pre-wrap max-h-32 pr-8">
                                         {typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2)}
                                       </pre>
                                       <Button
                                         variant="ghost"
                                         size="sm"
                                         className="absolute top-2 right-1 h-6 w-6 p-0 hover:bg-white/10"
                                         onClick={() => copyToClipboard(typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2), `msg-result-${tc.id}`)}
                                       >
                                         {copiedStates[`msg-result-${tc.id}`] ? (
                                           <Check className="h-3 w-3 text-green-400" />
                                         ) : (
                                           <Copy className="h-3 w-3 text-white/70" />
                                         )}
                                       </Button>
                                     </div>
                                   </div>
                                 )}
                                {tc.error && (
                                  <div className="text-red-500">
                                    <strong>Error:</strong>
                                    <pre className="mt-1 p-2 bg-red-900/20 rounded text-xs overflow-auto whitespace-pre-wrap max-h-24">
                                      {tc.error}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>
                
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-[#D2F245] flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-secondary-foreground" />
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-primary-foreground" />
                </div>
                <Card className="p-4 bg-transparent border-none">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </Card>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-primary bg-[#001000] p-4">
          <div className="max-w-4xl mx-auto">
            {selectedImages.length > 0 && (
              <div className="flex gap-2 mb-3 overflow-x-auto">
                {selectedImages.map((img, idx) => (
                  <div key={idx} className="relative flex-shrink-0">
                    <img src={img} alt="" className="w-16 h-16 object-cover rounded" />
                    <Button
                      size="sm"
                      variant="destructive"
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full p-0"
                      onClick={() => removeImage(idx)}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            )}
            
            {isPaused && (
              <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm">
                  <Pause className="h-4 w-4" />
                  Chat is paused. Click resume to continue.
                </div>
              </div>
            )}
            
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="flex-shrink-0 border-primary text-primary"
                disabled={isPaused}
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="flex-shrink-0 border-primary text-primary"
                title={isLoading ? "Stop" : (isPaused ? "Resume" : "Pause")}
                onClick={() => {
                  if (isLoading) return stopCurrentRun(); // ⛔️ stop current run
                  if (isPaused) {
                    setIsPaused(false);
                    // optional: immediately let the model continue its reasoning now
                    callLLM();
                  } else {
                    setIsPaused(true); // just prevent new input
                  }
                }}
              >
                {isLoading ? <Pause className="h-4 w-4" /> : (isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />)}
              </Button>
              
               <Textarea
                 value={inputMessage}
                 onChange={(e) => {
                   setInputMessage(e.target.value);
                   // Auto-resize
                   const textarea = e.target;
                   textarea.style.height = 'auto';
                   textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
                 }}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter' && !e.shiftKey) {
                     e.preventDefault();
                     sendMessage();
                   }
                 }}
                 placeholder={isPaused ? "Chat is paused..." : "Type your message..."}
                 className="flex-1 resize-none border-primary focus:border-primary text-foreground min-h-[40px] max-h-[200px]"
                 style={{
                   height: 'auto',
                   overflowY: inputMessage.split('\n').length > 4 ? 'auto' : 'hidden'
                 }}
                 disabled={isPaused}
               />
              
              <Button
                onClick={sendMessage}
                disabled={isLoading || (!inputMessage.trim() && selectedImages.length === 0) || isPaused}
                className="flex-shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MCPClient;