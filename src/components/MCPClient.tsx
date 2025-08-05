import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Textarea } from './ui/textarea';
import { Settings, Send, Paperclip, Loader2, Bot, User, Wrench, Terminal, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useToast } from '@/hooks/use-toast';

interface MCPTool {
  name: string;
  description: string;
  inputSchema?: any;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  toolCalls?: { name: string; args: any }[];
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mcpTools, setMcpTools] = useState<MCPTool[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionLogs, setConnectionLogs] = useState<ConnectionLog[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<APIProvider>(API_PROVIDERS[0]);
  const [selectedModel, setSelectedModel] = useState('');
  const [activeToolCall, setActiveToolCall] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    
    addLog('info', 'Attempting to connect to MCP server...');
    addLog('info', 'Server URL: https://final-meta-mcp-server-production.up.railway.app/mcp');

    try {
      // Generate a simple session ID for this connection
      const sessionId = `climaty-${Date.now()}`;
      addLog('info', `Generated session ID: ${sessionId}`);
      
      // Step 1: Initialize the MCP session
      addLog('info', 'Step 1: Initializing MCP session...');
      const initResponse = await fetch(
        "https://final-meta-mcp-server-production.up.railway.app/mcp",
        {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "Mcp-Session-Id": sessionId,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-06-18",
              capabilities: {
                roots: { listChanged: true },
                sampling: {}
              },
              clientInfo: {
                name: "climaty",
                version: "1.0.0"
              }
            }
          }),
          mode: "cors",
        }
      );

      addLog('info', `Initialize Response Status: ${initResponse.status} ${initResponse.statusText}`);
      addLog('info', `Content-Type: ${initResponse.headers.get('content-type')}`);

      if (!initResponse.ok) {
        const errorText = await initResponse.text();
        addLog('error', `Initialize failed: ${errorText}`);
        throw new Error(`HTTP ${initResponse.status}: ${initResponse.statusText}`);
      }

      let initData;
      const contentType = initResponse.headers.get('content-type') || '';
      
      if (contentType.includes('text/event-stream')) {
        // Handle SSE response
        addLog('info', 'Handling SSE response...');
        const reader = initResponse.body?.getReader();
        const decoder = new TextDecoder();
        let sseData = '';
        
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            sseData += chunk;
            
            // Look for data lines in SSE format
            const lines = sseData.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonStr = line.substring(6);
                try {
                  initData = JSON.parse(jsonStr);
                  addLog('info', `Parsed SSE data: ${JSON.stringify(initData)}`);
                  break;
                } catch (e) {
                  addLog('warning', `Failed to parse SSE data: ${jsonStr}`);
                }
              }
            }
            if (initData) break;
          }
        }
      } else {
        // Handle JSON response
        addLog('info', 'Handling JSON response...');
        initData = await initResponse.json();
      }
      if (initData.error) {
        addLog('error', `Initialize Error: ${initData.error.message || JSON.stringify(initData.error)}`);
        throw new Error(initData.error.message || 'Initialize failed');
      }

      // Check if session ID was provided in response headers
      const headerSessionId = initResponse.headers.get('Mcp-Session-Id');
      addLog('info', `Header Session ID: ${headerSessionId || 'None provided'}`);
      
      // Use generated session ID if no header session ID provided
      const finalSessionId = headerSessionId || sessionId;
      
      // Step 2: Send initialized notification
      addLog('info', 'Step 2: Sending initialized notification...');
      const notifyResponse = await fetch(
        "https://final-meta-mcp-server-production.up.railway.app/mcp",
        {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "Mcp-Session-Id": finalSessionId,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "notifications/initialized",
            params: {}
          }),
          mode: "cors",
        }
      );

      addLog('info', `Initialized notification status: ${notifyResponse.status}`);
      if (notifyResponse.status === 400) {
        const notifyError = await notifyResponse.text();
        addLog('error', `Notification error: ${notifyError}`);
      }

      // Step 3: Get available tools
      addLog('info', 'Step 3: Fetching available tools...');
      const toolsResponse = await fetch(
        "https://final-meta-mcp-server-production.up.railway.app/mcp",
        {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "Mcp-Session-Id": finalSessionId,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/list",
            params: {}
          }),
          mode: "cors",
        }
      );

      addLog('info', `Tools Response Status: ${toolsResponse.status} ${toolsResponse.statusText}`);
      addLog('info', `Tools Content-Type: ${toolsResponse.headers.get('content-type')}`);

      if (!toolsResponse.ok) {
        const errorText = await toolsResponse.text();
        addLog('error', `Tools request failed: ${errorText}`);
        throw new Error(`HTTP ${toolsResponse.status}: ${toolsResponse.statusText}`);
      }

      let toolsData;
      const toolsContentType = toolsResponse.headers.get('content-type') || '';
      
      if (toolsContentType.includes('text/event-stream')) {
        // Handle SSE response for tools
        addLog('info', 'Handling tools SSE response...');
        const reader = toolsResponse.body?.getReader();
        const decoder = new TextDecoder();
        let sseData = '';
        
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            sseData += chunk;
            
            // Look for data lines in SSE format
            const lines = sseData.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonStr = line.substring(6);
                try {
                  toolsData = JSON.parse(jsonStr);
                  addLog('info', `Parsed tools SSE data: ${JSON.stringify(toolsData)}`);
                  break;
                } catch (e) {
                  addLog('warning', `Failed to parse tools SSE data: ${jsonStr}`);
                }
              }
            }
            if (toolsData) break;
          }
        }
      } else {
        // Handle JSON response for tools
        addLog('info', 'Handling tools JSON response...');
        toolsData = await toolsResponse.json();
      }
      if (toolsData.error) {
        addLog('error', `Tools Error: ${toolsData.error.message || JSON.stringify(toolsData.error)}`);
        throw new Error(toolsData.error.message || 'Tools request failed');
      }

      if (toolsData.result && toolsData.result.tools) {
        const tools: MCPTool[] = toolsData.result.tools.map((tool: any) => ({
          name: tool.name,
          description: tool.description || 'No description available',
          inputSchema: tool.inputSchema
        }));

        setMcpTools(tools);
        setIsConnected(true);
        addLog('info', `Successfully connected! Found ${tools.length} tools:`);

        tools.forEach(tool => {
          addLog('info', `  - ${tool.name}: ${tool.description}`);
        });

        toast({
          title: 'MCP Server Connected',
          description: `Connected successfully. ${tools.length} tools available.`,
        });
      } else {
        addLog('warning', 'Server responded but no tools found in response');
        addLog('info', `Response structure: ${JSON.stringify(toolsData, null, 2)}`);
        setIsConnected(true); // Still mark as connected even if no tools
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addLog('error', `Connection failed: ${errorMessage}`);
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        addLog('error', 'Network error - possibly CORS, server down, or connection timeout');
      }
      
      setIsConnected(false);
      toast({
        title: 'Connection Failed',
        description: `Failed to connect to MCP server: ${errorMessage}`,
        variant: 'destructive'
      });
    } finally {
      setIsConnecting(false);
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
    if (!inputMessage.trim() && selectedImages.length === 0) return;
    if (!apiKey) {
      toast({
        title: 'API Key Required',
        description: 'Please set your API key in settings.',
        variant: 'destructive'
      });
      return;
    }
    if (!selectedModel) {
      toast({
        title: 'Model Required',
        description: 'Please select a model in settings.',
        variant: 'destructive'
      });
      return;
    }

    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      images: selectedImages.length > 0 ? [...selectedImages] : undefined,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newMessage]);
    setInputMessage('');
    setSelectedImages([]);
    setIsLoading(true);

    try {
      // Prepare the request based on the provider
      let requestBody: any;
      let headers: any = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      };

      const messageContent: any = { role: 'user', content: inputMessage };
      
      // Add images if any (for models that support it)
      if (selectedImages.length > 0 && selectedProvider.name === 'OpenAI') {
        messageContent.content = [
          { type: 'text', text: inputMessage },
          ...selectedImages.map(image => ({
            type: 'image_url',
            image_url: { url: image }
          }))
        ];
      }

      if (selectedProvider.name === 'OpenAI') {
        requestBody = {
          model: selectedModel,
          messages: [messageContent],
          max_tokens: 1000
        };
      } else if (selectedProvider.name === 'Anthropic') {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        delete headers['Authorization'];
        
        requestBody = {
          model: selectedModel,
          max_tokens: 1000,
          messages: [messageContent]
        };
      } else if (selectedProvider.name === 'Google') {
        const response = await fetch(`${selectedProvider.baseUrl}/models/${selectedModel}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: inputMessage }]
            }]
          })
        });

        if (!response.ok) {
          throw new Error(`Google API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';
        
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content,
          timestamp: new Date()
        };

        setMessages(prev => [...prev, assistantMessage]);
        setIsLoading(false);
        return;
      }

      // For OpenAI and Anthropic
      const response = await fetch(selectedProvider.baseUrl + (selectedProvider.name === 'Anthropic' ? '/messages' : '/chat/completions'), {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      let content: string;

      if (selectedProvider.name === 'OpenAI') {
        content = data.choices?.[0]?.message?.content || 'No response generated';
      } else if (selectedProvider.name === 'Anthropic') {
        content = data.content?.[0]?.text || 'No response generated';
      } else {
        content = 'No response generated';
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('API Error:', error);
      toast({
        title: 'Error',
        description: `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
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
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  Connection Logs
                </DialogTitle>
              </DialogHeader>
              <ScrollArea className="flex-1 min-h-[300px]">
                <div className="space-y-1 font-mono text-sm">
                  {connectionLogs.map((log, index) => (
                    <div key={index} className={`flex gap-2 p-2 rounded text-xs ${
                      log.level === 'error' ? 'bg-destructive/10 text-destructive' :
                      log.level === 'warning' ? 'bg-yellow-500/10 text-yellow-600' :
                      'bg-muted/50'
                    }`}>
                      <span className="text-muted-foreground">
                        {log.timestamp.toLocaleTimeString()}
                      </span>
                      <span className={`font-medium ${
                        log.level === 'error' ? 'text-destructive' :
                        log.level === 'warning' ? 'text-yellow-600' :
                        'text-primary'
                      }`}>
                        [{log.level.toUpperCase()}]
                      </span>
                      <span className="flex-1 break-all">{log.message}</span>
                    </div>
                  ))}
                  {connectionLogs.length === 0 && (
                    <div className="text-muted-foreground text-center py-8">
                      No logs yet. Connection will be attempted automatically.
                    </div>
                  )}
                </div>
              </ScrollArea>
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
                  
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  
                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {message.toolCalls.map((toolCall, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          <Wrench className="w-3 h-3 mr-1" />
                          {toolCall.name}
                        </Badge>
                      ))}
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