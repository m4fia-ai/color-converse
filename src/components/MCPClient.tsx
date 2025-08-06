import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Textarea } from './ui/textarea';
import { Settings, Send, Paperclip, Loader2, Bot, User, Wrench, Terminal, RefreshCw, Play, FileText, ChevronDown, ChevronRight } from 'lucide-react';
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
  const { toast } = useToast();
  const [serverUrl] = useState('https://final-meta-mcp-server-production.up.railway.app/mcp');

  /** Provider‑formatted conversation history (kept outside React state so we
   *   can mutate synchronously without rerenders). Each element is already in
   *   the shape expected by the specific provider. */
  const providerMessagesRef = useRef<any[]>([]);

  useEffect(() => {
    // Load saved settings
    const savedSettings = localStorage.getItem('climaty-settings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      setApiKey(settings.apiKey || '');
      const provider = API_PROVIDERS.find(p => p.name === settings.provider) || API_PROVIDERS[0];
      setSelectedProvider(provider);
      setSelectedModel(settings.model || provider.models[0]);
    } else {
      setSelectedModel(selectedProvider.models[0]);
    }

    // Connect to MCP server and fetch available tools
    connectToMCPServer();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addLog = (level: 'info' | 'error' | 'warning', message: string) => {
    const log: ConnectionLog = {
      timestamp: new Date(),
      level,
      message
    };
    setConnectionLogs(prev => [...prev, log]);
    console.log(`[MCP ${level.toUpperCase()}] ${message}`);
  };

  const connectToMCPServer = async () => {
    setIsConnecting(true);
    setIsConnected(false);
    setMcpTools([]);
    setConnectionLogs([]);
    
    addLog('info', 'Starting MCP connection using official SDK...');
    addLog('info', `Target server: ${serverUrl}`);

    try {
      // Disconnect existing connection if any
      if (mcpClientRef.current.isConnected()) {
        await mcpClientRef.current.disconnect();
      }

      addLog('info', 'Connecting to MCP server...');
      
      await mcpClientRef.current.connect(
        serverUrl,
        (manifest) => {
          // This fires when we get the manifest with tools
          setMcpTools(manifest.tools || []);
          addLog('info', `✅ Got manifest with ${manifest.tools?.length || 0} tools: ${manifest.tools?.map((t: MCPTool) => t.name).join(', ') || 'none'}`);
          setIsConnected(true);
          setIsConnecting(false);
          
          toast({
            title: 'MCP Server Connected',
            description: `Connected with ${manifest.tools?.length || 0} tools available.`,
          });
        }
      );
      
      addLog('info', '✅ MCP connection established using official SDK!');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addLog('error', `❌ Connection failed: ${errorMessage}`);
      
      setIsConnected(false);
      setIsConnecting(false);
      toast({
        title: 'Connection Failed',
        description: `Failed to connect to MCP server: ${errorMessage}`,
        variant: 'destructive'
      });
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result) {
            setSelectedImages(prev => [...prev, e.target!.result as string]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

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
        await executeToolCallsNew(toolCalls);
      } else {
        appendAssistantMessage(msg.content ?? '');
        providerMessagesRef.current.push({ role: 'assistant', content: msg.content ?? '' });
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
        await executeToolCallsNew(toolCalls);
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

  /* ────────────────────────── NEW TOOL EXECUTION ─────────────────────────── */
  const executeToolCallsNew = async (toolCalls: ToolCall[]) => {
    const provider = selectedProvider.name;

    for (const tc of toolCalls) {
      setActiveToolCall(tc.id);
      updateToolCallStatus(tc.id, 'pending');
      try {
        const result = await mcpClientRef.current.callTool(tc.name, tc.args);
        tc.result = result.content;
        tc.status = 'success';
        updateToolCallStatus(tc.id, 'success', result.content);
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


  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border p-4 flex items-center justify-between bg-card">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-semibold text-card-foreground">climaty</h1>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnecting ? 'bg-yellow-500 animate-pulse' : isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm text-muted-foreground">
                {isConnecting ? 'Connecting...' : isConnected ? `${mcpTools.length} tools available` : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Terminal className="w-4 h-4 mr-2" />
                Logs
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  Connection Logs
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-[500px] w-full">
                  <div className="space-y-1 font-mono text-sm p-2">
                    {connectionLogs.map((log, index) => (
                      <div key={index} className={`flex gap-2 p-2 rounded text-xs ${
                        log.level === 'error' ? 'bg-destructive/10 text-destructive' :
                        log.level === 'warning' ? 'bg-yellow-500/10 text-yellow-600' :
                        'bg-muted/50'
                      }`}>
                        <span className="text-muted-foreground whitespace-nowrap">
                          {log.timestamp.toLocaleTimeString()}
                        </span>
                        <span className={`font-medium whitespace-nowrap ${
                          log.level === 'error' ? 'text-destructive' :
                          log.level === 'warning' ? 'text-yellow-600' :
                          'text-primary'
                        }`}>
                          [{log.level.toUpperCase()}]
                        </span>
                        <span className="flex-1 break-words overflow-wrap-anywhere">{log.message}</span>
                      </div>
                    ))}
                    {connectionLogs.length === 0 && (
                      <div className="text-muted-foreground text-center py-8">
                        No logs yet. Connection will be attempted automatically.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </DialogContent>
          </Dialog>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={connectToMCPServer}
            disabled={isConnecting}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isConnecting ? 'animate-spin' : ''}`} />
            Reconnect
          </Button>
          
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>API Configuration</DialogTitle>
              </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="provider">Provider</Label>
                <Select 
                  value={selectedProvider.name} 
                  onValueChange={(value) => {
                    const provider = API_PROVIDERS.find(p => p.name === value)!;
                    setSelectedProvider(provider);
                    setSelectedModel(provider.models[0]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {API_PROVIDERS.map(provider => (
                      <SelectItem key={provider.name} value={provider.name}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="model">Model</Label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedProvider.models.map(model => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
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
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                />
              </div>
              
              <div className="flex gap-2 pt-4">
                <Button 
                  onClick={() => {
                    const settings = {
                      provider: selectedProvider.name,
                      model: selectedModel,
                      apiKey: apiKey
                    };
                    localStorage.setItem('climaty-settings', JSON.stringify(settings));
                    toast({
                      title: 'Settings Saved',
                      description: 'Your configuration has been saved successfully.',
                    });
                  }}
                  className="flex-1"
                >
                  Save Settings
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => {
                    localStorage.removeItem('climaty-settings');
                    setApiKey('');
                    setSelectedProvider(API_PROVIDERS[0]);
                    setSelectedModel(API_PROVIDERS[0].models[0]);
                    toast({
                      title: 'Settings Cleared',
                      description: 'All settings have been reset.',
                    });
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tools Panel */}
      <div className="border-b border-border p-4 bg-muted/30">
        <div className="flex items-center gap-2 mb-2">
          <Wrench className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Available Tools</span>
          {activeToolCall && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {activeToolCall}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {mcpTools.map((tool) => (
            <Badge key={tool.name} variant="outline" className="text-xs">
              {tool.name}
            </Badge>
          ))}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4 max-w-4xl mx-auto">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground mb-2">Welcome to MCP Client</h3>
              <p className="text-muted-foreground">Start a conversation to interact with MCP tools</p>
            </div>
          )}
          
          {messages.map((message) => (
            <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {message.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-primary-foreground" />
                </div>
              )}
              
              <div className={`max-w-[70%] ${message.role === 'user' ? 'order-first' : ''}`}>
                <Card className={`p-4 ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>
                  {message.images && message.images.length > 0 && (
                    <div className="mb-3 grid grid-cols-2 gap-2">
                      {message.images.map((image, index) => (
                        <img 
                          key={index} 
                          src={image} 
                          alt={`Uploaded image ${index + 1}`}
                          className="rounded-lg max-h-32 object-cover"
                        />
                      ))}
                    </div>
                  )}
                  
                  {message.content && (
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  )}
                  
                  {message.toolCalls && message.toolCalls.length > 0 && (
                     <div className="mt-4">
                       <ToolCallsDisplayComponent toolCalls={message.toolCalls} />
                    </div>
                  )}
                </Card>
                
                <div className="text-xs text-muted-foreground mt-1 px-1">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
              
              {message.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
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
              <Card className="p-4 bg-card">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-muted-foreground">Thinking...</span>
                </div>
              </Card>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t border-border p-4 bg-card">
        <div className="max-w-4xl mx-auto">
          {selectedImages.length > 0 && (
            <div className="mb-3 flex gap-2 flex-wrap">
              {selectedImages.map((image, index) => (
                <div key={index} className="relative">
                  <img 
                    src={image} 
                    alt={`Selected ${index + 1}`}
                    className="w-16 h-16 object-cover rounded-lg border"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full p-0"
                    onClick={() => removeImage(index)}
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
          )}
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
            >
              <Paperclip className="w-4 h-4" />
            </Button>
            
            <div className="flex-1 relative">
              <Textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Type your message..."
                className="min-h-[44px] resize-none pr-12"
                disabled={isLoading}
              />
              <Button
                size="sm"
                onClick={sendMessage}
                disabled={isLoading || (!inputMessage.trim() && selectedImages.length === 0)}
                className="absolute right-2 bottom-2"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageUpload}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
};

// Tool Calls Display Component
const ToolCallsDisplayComponent = ({ toolCalls }: { toolCalls: ToolCall[] }) => {
  const [expandedCalls, setExpandedCalls] = useState<Set<string>>(new Set());

  const toggleExpanded = (toolCallId: string) => {
    setExpandedCalls(prev => {
      const newSet = new Set(prev);
      if (newSet.has(toolCallId)) {
        newSet.delete(toolCallId);
      } else {
        newSet.add(toolCallId);
      }
      return newSet;
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Wrench className="w-3 h-3" />
        Tool Calls ({toolCalls.length})
      </div>
      {toolCalls.map((toolCall) => {
        const isExpanded = expandedCalls.has(toolCall.id);
        return (
          <Card key={toolCall.id} className="bg-muted/30 border-l-4 border-l-primary overflow-hidden">
            <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(toolCall.id)}>
              <CollapsibleTrigger asChild>
                <div className="w-full p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        toolCall.status === 'success' ? 'default' :
                        toolCall.status === 'error' ? 'destructive' : 'secondary'
                      } className="text-xs">
                        {toolCall.status === 'pending' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                        {toolCall.status === 'success' && <Play className="w-3 h-3 mr-1" />}
                        {toolCall.status === 'error' && <FileText className="w-3 h-3 mr-1" />}
                        {toolCall.name}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {isExpanded ? 
                        <ChevronDown className="w-4 h-4 text-muted-foreground" /> : 
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      }
                    </div>
                  </div>
                </div>
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <div className="px-3 pb-3 space-y-3 border-t border-border/50">
                  {Object.keys(toolCall.args).length > 0 && (
                    <div className="pt-3">
                      <div className="text-xs font-medium text-muted-foreground mb-2">Arguments:</div>
                      <pre className="text-xs bg-background/60 p-3 rounded border overflow-x-auto">
                        {JSON.stringify(toolCall.args, null, 2)}
                      </pre>
                    </div>
                  )}
                  
                  {toolCall.result && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-2">Result:</div>
                      <div className="bg-background/60 p-3 rounded border">
                        {Array.isArray(toolCall.result) ? (
                          <div className="space-y-2">
                            {toolCall.result.map((item: any, idx: number) => (
                              <div key={idx}>
                                {item.type === 'text' ? (
                                  <pre className="whitespace-pre-wrap font-mono text-sm bg-muted/20 p-2 rounded border overflow-x-auto">
                                    {item.text}
                                  </pre>
                                ) : (
                                  <pre className="text-sm whitespace-pre-wrap overflow-x-auto bg-muted/30 p-2 rounded font-mono">
                                    {typeof item === 'object' ? JSON.stringify(item, null, 2) : item}
                                  </pre>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : typeof toolCall.result === 'object' ? (
                          <pre className="text-sm whitespace-pre-wrap overflow-x-auto font-mono">
                            {JSON.stringify(toolCall.result, null, 2)}
                          </pre>
                        ) : (
                          <pre className="text-sm whitespace-pre-wrap overflow-x-auto font-mono bg-muted/20 p-2 rounded border">
                            {toolCall.result.toString()}
                          </pre>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {toolCall.error && (
                    <div>
                      <div className="text-xs font-medium text-destructive mb-2">Error:</div>
                      <div className="text-sm bg-destructive/10 text-destructive p-3 rounded border border-destructive/20">
                        {toolCall.error}
                      </div>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}
    </div>
  );
};

export default MCPClient;
