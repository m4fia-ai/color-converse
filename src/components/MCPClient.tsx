import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Textarea } from './ui/textarea';
import { Settings, Send, Paperclip, Loader2, Bot, User, Wrench, Terminal, RefreshCw, Play, FileText, ChevronDown, ChevronRight, Circle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { MCPClientManager } from '@/lib/mcpClient';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  status: 'pending' | 'success' | 'error';
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  toolCalls?: ToolCall[];
  timestamp: Date;
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
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo']
  },
  {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307']
  },
  {
    name: 'Google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-2.0-flash-exp', 'gemini-1.5-pro']
  }
];

/** Invisible instruction sent to the LLM on every request */
const SYSTEM_PROMPT =
  `You are Campaign Builder AI – an expert that helps marketers set up, optimise and debug Meta & Google campaigns. 
  Answer clearly, show JSON where relevant, and never reveal internal tool code.`;

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

  // Provider settings
  const [apiKey, setApiKey] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<APIProvider>(API_PROVIDERS[0]);
  const [selectedModel, setSelectedModel] = useState('');

  // Misc refs
  const mcpClientRef = useRef<MCPClientManager>(new MCPClientManager());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const didInitRef = useRef(false);
  const { toast } = useToast();
  const [serverUrl] = useState('https://redis-hosted-mcp-server-production.up.railway.app/mcp');

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
        content: SYSTEM_PROMPT,
      });
    } else if (provider === 'Anthropic') {
      // Anthropic uses a top-level "system" field that we add later in callLLM,
      // but we still keep the message in history so the array stays aligned.
      providerMessagesRef.current.push({
        role: 'system',
        content: SYSTEM_PROMPT,
      });
    } else if (provider === 'Google') {
      // Gemini requests are built from scratch in callLLM; we still record the
      // prompt here for completeness / export features.
      providerMessagesRef.current.push({
        role: 'system',
        content: SYSTEM_PROMPT,
      });
    }
  
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
      setApiKey(s.apiKey ?? '');
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
        setMcpTools(manifest.tools ?? []);
        setIsConnected(true);
        setIsConnecting(false);
        addLog('info', `Connected – ${manifest.tools?.length ?? 0} tools ready`);
        toast({ title: 'MCP Connected', description: `${manifest.tools?.length ?? 0} tools available` });
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

  /* ────────────────────────── SEND MESSAGE ──────────────────────────── */
  const sendMessage = async () => {
    if ((!inputMessage.trim() && selectedImages.length === 0) || isLoading) return;
    if (!apiKey) return toast({ title: 'Missing API key', variant: 'destructive' });

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

  /* ──────────────────────── LLM CALL WRAPPER ─────────────────────────── */
  const callLLM = async () => {
    setIsLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      let body: any;
      const provider = selectedProvider.name;

      if (provider === 'OpenAI') {
        headers['Authorization'] = `Bearer ${apiKey}`;
        body = { model: selectedModel, messages: providerMessagesRef.current, max_tokens: 1000 };
      } else if (provider === 'Anthropic') {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        body = { model: selectedModel, max_tokens: 1000, messages: providerMessagesRef.current };
      } else {
        // Google Gemini
        const resp = await fetch(`${selectedProvider.baseUrl}/models/${selectedModel}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: providerMessagesRef.current.map(m => m.content).join('\n\n') }] }]
          })
        });
        if (!resp.ok) throw new Error(`Gemini error ${resp.status}`);
        const j = await resp.json();
        const text = j.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response';
        appendAssistantMessage(text);
        return;
      }

      // Add tools if available (OpenAI & Anthropic only)
      if (mcpTools.length && isConnected) {
        const toolsPayload = mcpTools.map(t => provider === 'OpenAI'
          ? { type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema ?? {} } }
          : { name: t.name, description: t.description, input_schema: t.inputSchema ?? {} }
        );
        body.tools = toolsPayload;
        body.tool_choice = 'auto';
      }

      const endpoint = selectedProvider.baseUrl + (provider === 'Anthropic' ? '/messages' : '/chat/completions');
      const resp = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!resp.ok) throw new Error(`${provider} API error ${resp.status}`);
      const data = await resp.json();
      await handleLLMResponse(data);
    } catch (e: any) {
      toast({ title: 'LLM Error', description: e.message ?? String(e), variant: 'destructive' });
      addLog('error', e.message ?? String(e));
    } finally {
      setIsLoading(false);
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
        appendAssistantMessage('', toolCalls); // Show placeholder in UI
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
        appendAssistantMessage(collectedText, toolCalls);
        await executeToolCalls(toolCalls);
      } else {
        appendAssistantMessage(collectedText);
      }
    }
  };

  /* ───────────────────────── APPEND UI MESSAGE ───────────────────────── */
  const appendAssistantMessage = (content: string, toolCalls?: ToolCall[]) => {
    setMessages(prev => [
      ...prev,
      { id: (Date.now() + Math.random()).toString(), role: 'assistant', content, toolCalls, timestamp: new Date() }
    ]);
  };

  /* ────────────────────────── TOOL EXECUTION ─────────────────────────── */
  const executeToolCalls = async (toolCalls: ToolCall[]) => {
    const provider = selectedProvider.name;

    for (const tc of toolCalls) {
      setActiveToolCall(tc.id);
      updateToolCallStatus(tc.id, 'pending');
      try {
        const result = await mcpClientRef.current.callTool(tc.name, tc.args);
        
        // Extract text content from result.content if it's an array of objects
        let processedResult = result.content;
        if (Array.isArray(result.content)) {
          processedResult = result.content
            .map((item: any) => {
              if (typeof item === 'object' && item.type === 'text' && item.text) {
                return item.text;
              }
              return typeof item === 'string' ? item : JSON.stringify(item);
            })
            .join('\n');
        } else if (typeof result.content === 'object') {
          processedResult = JSON.stringify(result.content);
        }
        
        tc.result = processedResult;
        tc.status = 'success';
        updateToolCallStatus(tc.id, 'success', processedResult);
        addLog('info', `Tool ${tc.name} executed`);
      } catch (e: any) {
        tc.error = e.message ?? String(e);
        tc.status = 'error';
        updateToolCallStatus(tc.id, 'error', undefined, tc.error);
        addLog('error', `Tool ${tc.name} failed: ${tc.error}`);
      }

      // Immediately push tool result to provider history
      if (provider === 'OpenAI') {
        providerMessagesRef.current.push({ role: 'tool', tool_call_id: tc.id, content: tc.result ?? tc.error });
      } else if (provider === 'Anthropic') {
        providerMessagesRef.current.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: tc.id, content: tc.result ?? tc.error }]
        });
      }
    }

    setActiveToolCall(null);

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
                  <Label htmlFor="apiKey">API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder={`Enter ${selectedProvider.name} API key`}
                  />
                </div>
                <Button 
                  onClick={() => {
                    localStorage.setItem('climaty-settings', JSON.stringify({
                      apiKey, provider: selectedProvider.name, model: selectedModel
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
                <p className="text-foreground max-w-md mx-auto">
                  Chat with me and launch your campaigns
                </p>
              </div>
            )}
            
            {messages.map((msg) => (
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
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    )}
                    
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {msg.toolCalls.map((tc) => (
                          <Collapsible key={tc.id}>
                            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left p-2 rounded bg-transparent">
                              <div className={`w-2 h-2 rounded-full ${
                                tc.status === 'success' ? 'bg-green-500' :
                                tc.status === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                              }`} />
                              <Wrench className="w-3 h-3" />
                              <span className="text-sm font-medium">{tc.name}</span>
                              <ChevronRight className="w-3 h-3 ml-auto" />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="p-2 text-xs">
                              <div className="space-y-1">
                                <div><strong>Args:</strong> {JSON.stringify(tc.args, null, 2)}</div>
                                {tc.result && <div><strong>Result:</strong> {tc.result}</div>}
                                {tc.error && <div className="text-red-500"><strong>Error:</strong> {tc.error}</div>}
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
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              
              <Textarea
                value={inputMessage}
                onChange={e => setInputMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Type your message..."
                className="flex-1 resize-none border-primary focus:border-primary text-foreground"
                rows={1}
                style={{ minHeight: '40px', maxHeight: '120px' }}
              />
              
              <Button
                onClick={sendMessage}
                disabled={isLoading || (!inputMessage.trim() && selectedImages.length === 0)}
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