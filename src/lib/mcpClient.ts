import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface MCPTool {
  name: string;
  description: string;
  inputSchema?: any;
}

interface MCPManifest {
  tools: MCPTool[];
}

export class MCPClientManager {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;

  async connect(
    url: string,
    onManifest: (manifest: MCPManifest) => void,
    onEvent?: (event: any) => void
  ): Promise<void> {
    console.log(`[MCP] Connecting using official SDK to: ${url}`);

    try {
      // Create the transport
      this.transport = new StreamableHTTPClientTransport(
        new URL(url),
        {
          requestInit: {
            // Add any additional headers if needed
          }
        }
      );

      // Create the client
      this.client = new Client(
        { name: "climaty", version: "1.0.0" },
        { capabilities: { tools: {} } }
      );

      // Connect to the server
      console.log(`[MCP] Establishing connection...`);
      await this.client.connect(this.transport);
      console.log(`[MCP] Connected successfully!`);

      // List available tools
      console.log(`[MCP] Fetching tools...`);
      const { tools } = await this.client.listTools();
      console.log(`[MCP] Retrieved ${tools.length} tools:`, tools.map(t => t.name));

      // Transform tools to match our interface
      const mcpTools: MCPTool[] = tools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema
      }));

      // Call the manifest callback
      onManifest({ tools: mcpTools });

    } catch (error) {
      console.error(`[MCP] Connection failed:`, error);
      throw error;
    }
  }

  async callTool(name: string, args: any): Promise<any> {
    if (!this.client) {
      throw new Error('MCP client not connected');
    }

    console.log(`[MCP] Calling tool: ${name} with args:`, args);
    
    try {
      const result = await this.client.callTool({
        name,
        arguments: args
      },
        {                                     // 2nd param = RequestOptions
    timeout: 180_000,                   // 2 min idle window
    resetTimeoutOnProgress: true,       // keep extending if server streams progress
    maxTotalTimeout: 300_000            // but never wait >5 min overall
  }
      );
      
      console.log(`[MCP] Tool response:`, result);
      return result;
    } catch (error) {
      console.error(`[MCP] Tool call failed:`, error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client && this.transport) {
      console.log(`[MCP] Disconnecting...`);
      await this.client.close();
      this.client = null;
      this.transport = null;
      console.log(`[MCP] Disconnected`);
    }
  }

  isConnected(): boolean {
    return this.client !== null;
  }
}