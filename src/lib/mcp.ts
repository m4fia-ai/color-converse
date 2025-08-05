interface MCPManifest {
  tools: any[];
}

export async function connectMCP(
  url: string,
  onManifest: (m: MCPManifest) => void,
  onEvent: (evt: any) => void,
) {
  console.log(`[MCP] Attempting to connect to: ${url}`);
  
  // First, try to establish a session with the MCP server
  try {
    // Generate a unique session ID
    const sessionId = crypto.randomUUID();
    console.log(`[MCP] Generated session ID: ${sessionId}`);
    
    const resp = await fetch(url, {
      mode: "cors",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/x-ndjson, text/event-stream, application/json",
        "X-Session-ID": sessionId,
        "X-MCP-Session": sessionId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "init",
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
      })
    });
    
    console.log(`[MCP] Response status: ${resp.status} ${resp.statusText}`);
    console.log(`[MCP] Response headers:`, Object.fromEntries(resp.headers.entries()));
    
    if (!resp.ok) {
      // Get response body for better error message
      const errorText = await resp.text();
      console.error(`[MCP] Error response body:`, errorText);
      throw new Error(`MCP connect failed: ${resp.status} - ${errorText || resp.statusText}`);
    }
    
    // Check if this is a JSON response (initialization response) or a stream
    const contentType = resp.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      // Handle JSON initialization response
      const initResponse = await resp.json();
      console.log(`[MCP] Initialization response:`, initResponse);
      
      // Now connect to the streaming endpoint with the session ID
      return connectMCPStream(url, sessionId, onManifest, onEvent);
    } else {
      // Handle direct streaming response
      return handleMCPStream(resp, onManifest, onEvent);
    }
    
  } catch (error) {
    console.error(`[MCP] Connection error:`, error);
    throw error;
  }
}

async function connectMCPStream(
  url: string, 
  sessionId: string, 
  onManifest: (m: MCPManifest) => void,
  onEvent: (evt: any) => void
) {
  console.log(`[MCP] Opening stream with session ID: ${sessionId}`);
  
  const resp = await fetch(url, {
    mode: "cors",
    headers: {
      "Accept": "text/event-stream, application/x-ndjson",
      "X-Session-ID": sessionId,
      "X-MCP-Session": sessionId,
    }
  });
  
  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`MCP stream failed: ${resp.status} - ${errorText}`);
  }
  
  return handleMCPStream(resp, onManifest, onEvent);
}

async function handleMCPStream(
  resp: Response,
  onManifest: (m: MCPManifest) => void,
  onEvent: (evt: any) => void
) {
  if (!resp.body) {
    throw new Error('No response body for MCP stream');
  }
  
  // Convert the stream into text lines
  const reader = resp.body
    .pipeThrough(new TextDecoderStream())
    .getReader();

  let buf = "";
  let gotManifest = false;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;

    let idx;
    while ((idx = buf.indexOf("\n")) > -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);

      if (!line) continue;                              // skip keep-alives

      // Some servers prefix NDJSON with "data:" (SSE style)
      const jsonString = line.startsWith("data:")
        ? line.slice(5)
        : line;

      let obj: any;
      try {
        obj = JSON.parse(jsonString);
        console.log(`[MCP] Received frame:`, obj);
      } catch {
        console.warn("Non-JSON MCP frame:", line);
        continue;
      }

      if (!gotManifest && obj.type === "manifest") {
        gotManifest = true;
        onManifest(obj.data);                           // ← tools, etc.
      } else {
        onEvent(obj);                                   // ← tool responses
      }
    }
  }
}