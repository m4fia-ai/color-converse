interface MCPManifest {
  tools: any[];
}

export async function connectMCP(
  url: string,
  onManifest: (m: MCPManifest) => void,
  onEvent: (evt: any) => void,
) {
  console.log(`[MCP] Attempting to connect to: ${url}`);
  
  const resp = await fetch(url, {
    mode: "cors",
    headers: {
      // The server is http-only (NDJSON), but Accepting both is harmless
      Accept: "application/x-ndjson, text/event-stream"
    }
  });
  
  console.log(`[MCP] Response status: ${resp.status} ${resp.statusText}`);
  console.log(`[MCP] Response headers:`, Object.fromEntries(resp.headers.entries()));
  
  if (!resp.ok) {
    // Get response body for better error message
    const errorText = await resp.text();
    console.error(`[MCP] Error response body:`, errorText);
    throw new Error(`MCP connect failed: ${resp.status} - ${errorText || resp.statusText}`);
  }

  // Convert the stream into text lines
  const reader = resp.body!
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