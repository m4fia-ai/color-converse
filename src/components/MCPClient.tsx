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
      // Try to connect to the actual MCP server
      // const response = await fetch('https://final-meta-mcp-server-production.up.railway.app/mcp', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify({
      //     jsonrpc: '2.0',
      //     id: 1,
      //     method: 'tools/list',
      //     params: {}
      //   })
      // });
      // example with the JS fetch API
      // const response = await fetch(
      //   "https://final-meta-mcp-server-production.up.railway.app/mcp",
      //  {
      //     method: "POST",
      //     headers: { 
      //       "Content-Type": "application/json" 
      //     },
      //     body: JSON.stringify({
      //       jsonrpc: "2.0",
      //       id: 1,
      //       method:  "tools/list", // built-in RPC
      //       params: {}
      //     }),
      //     mode: "cors",
      //  }
      // );


      // addLog('info', `HTTP Response Status: ${response.status} ${response.statusText}`);

      // if (!response.ok) {
      //   throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      // }

      // // const responseText = await response.text();
      // // addLog('info', `Raw response: ${responseText}`);

      // // let data;
      // // try {
      // //   data = await response.json();
      // // } catch (parseError) {
      // //   addLog('error', `Failed to parse JSON response: ${parseError}`);
      // //   throw new Error('Invalid JSON response from server');
      // // }
      // const data = await response.json();
      // if (data.error) {
      //   addLog('error', `MCP Error: ${data.error.message || JSON.stringify(data.error)}`);
      //   throw new Error(data.error.message || 'MCP server returned an error');
      // }

      // if (data.result && data.result.tools) {
      //   const tools: MCPTool[] = data.result.tools.map((tool: any) => ({
      //     name: tool.name,
      //     description: tool.description || 'No description available',
      //     inputSchema: tool.inputSchema
      //   }));

      //   setMcpTools(tools);
      //   setIsConnected(true);
      //   addLog('info', `Successfully connected! Found ${tools.length} tools:`);
      const response = await fetch(
        "https://final-meta-mcp-server-production.up.railway.app/mcp",
        {
          method: "POST",
          mode:   "cors",
          headers: {
            "Content-Type": "application/json",
            "Accept":       "application/json, text/event-stream"      // ← REQUIRED
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id:      1,
            method:  "tools/list",                   // ← slash, not dot
            params:  {}
          })
        }
      );

      // ---- peel the JSON-RPC payload out of the SSE stream ----
        const raw = await response.text();            // whole stream in one shot
        const dataLine = raw.split("\n").find(l => l.startsWith("data:"));
        if (!dataLine) throw new Error("No data line in SSE reply");
        
        const { result, error } = JSON.parse(dataLine.slice(5).trim());
        
        if (error) throw new Error(error.message || JSON.stringify(error));
        
        const tools: MCPTool[] = result.tools.map((t: any) => ({
          name:        t.name,
          description: t.description ?? "No description",
          inputSchema: t.inputSchema
        }));
      
        setMcpTools(tools);
        setIsConnected(true);
        addLog("info", `Successfully connected! Found ${tools.length} tools.`);

        tools.forEach(tool => {
          addLog('info', `  - ${tool.name}: ${tool.description}`);
        });

        toast({
          title: 'MCP Server Connected',
          description: `Connected successfully. ${tools.length} tools available.`,
        });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addLog('error', `Connection failed: ${errorMessage}`);
      
      // Try to provide more specific error information
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
      // Simulate AI response with tool calling
      setTimeout(() => {
        const toolsUsed = Math.random() > 0.5 ? [mcpTools[Math.floor(Math.random() * mcpTools.length)]] : [];
        
        if (toolsUsed.length > 0) {
          setActiveToolCall(toolsUsed[0].name);
          setTimeout(() => setActiveToolCall(null), 2000);
        }

        const response: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `I've processed your message${selectedImages.length > 0 ? ' and analyzed the image(s)' : ''}. ${toolsUsed.length > 0 ? `I used the ${toolsUsed[0].name} tool to help with your request.` : 'Here is my response based on your input.'}`,
          toolCalls: toolsUsed.map(tool => ({ name: tool.name, args: {} })),
          timestamp: new Date()
        };

        setMessages(prev => [...prev, response]);
        setIsLoading(false);
      }, 1500);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to send message.',
        variant: 'destructive'
      });
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