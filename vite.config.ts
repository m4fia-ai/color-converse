import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { spawn } from "child_process";

// Global MCP proxy state
let mcpProcess: any = null;
let pendingRequests = new Map();
let requestIdCounter = 1;
let buffer = '';

function handleMCPOutput(data: string) {
  buffer += data;
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  
  for (const line of lines) {
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        console.log('MCP response:', response);
        
        if (response.id && pendingRequests.has(response.id)) {
          const { resolve } = pendingRequests.get(response.id);
          pendingRequests.delete(response.id);
          resolve(response);
        }
      } catch (error) {
        console.error('Failed to parse MCP response:', error);
      }
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
    {
      name: 'mcp-proxy',
      configureServer(server: any) {
        // Start MCP proxy endpoint
        server.middlewares.use('/api/mcp-proxy/start', async (req: any, res: any, next: any) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method not allowed');
            return;
          }
          
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const config = JSON.parse(body);
              
              // Stop existing process
              if (mcpProcess && !mcpProcess.killed) {
                mcpProcess.kill();
              }
              
              pendingRequests.clear();
              buffer = '';
              
              const args = [
                '-y',
                'mcp-remote',
                config.remoteUrl,
                '--transport',
                config.transport || 'http-only'
              ];
              
              console.log('Starting mcp-remote with:', args);
              
              mcpProcess = spawn('npx', args, {
                stdio: ['pipe', 'pipe', 'pipe']
              });
              
              mcpProcess.stdout?.on('data', (data: Buffer) => {
                handleMCPOutput(data.toString());
              });
              
              mcpProcess.stderr?.on('data', (data: Buffer) => {
                console.error('mcp-remote stderr:', data.toString());
              });
              
              mcpProcess.on('error', (error: Error) => {
                console.error('mcp-remote error:', error);
              });
              
              mcpProcess.on('exit', (code: number) => {
                console.log('mcp-remote exited with code:', code);
                mcpProcess = null;
              });
              
              // Wait for startup
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ success: true }));
              
            } catch (error: any) {
              console.error('MCP proxy start error:', error);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: error.message }));
            }
          });
        });
        
        // MCP request endpoint
        server.middlewares.use('/api/mcp-proxy/request', async (req: any, res: any, next: any) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('Method not allowed');
            return;
          }
          
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const { method, params } = JSON.parse(body);
              
              if (!mcpProcess || mcpProcess.killed) {
                res.statusCode = 503;
                res.end(JSON.stringify({ error: 'MCP proxy not running' }));
                return;
              }
              
              const id = requestIdCounter++;
              const request = {
                jsonrpc: '2.0',
                id,
                method,
                ...(params !== undefined && { params })
              };
              
              const responsePromise = new Promise((resolve, reject) => {
                pendingRequests.set(id, { resolve, reject });
                
                setTimeout(() => {
                  if (pendingRequests.has(id)) {
                    pendingRequests.delete(id);
                    reject(new Error(`Timeout for ${method}`));
                  }
                }, 30000);
              });
              
              const requestStr = JSON.stringify(request) + '\n';
              console.log('Sending to mcp-remote:', requestStr.trim());
              mcpProcess.stdin?.write(requestStr);
              
              const response = await responsePromise;
              
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify(response));
              
            } catch (error: any) {
              console.error('MCP request error:', error);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: error.message }));
            }
          });
        });
      }
    }
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
