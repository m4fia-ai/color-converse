export async function getManifest(base: string) {
  // Try different manifest endpoints since the server might not have /manifest
  const endpoints = [
    `${base}/manifest`,  // Standard manifest endpoint
    base,                // Root endpoint might return manifest
    `${base}/tools`,     // Tools endpoint
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`[MCP] Trying manifest endpoint: ${endpoint}`);
      const res = await fetch(endpoint, {
        mode: "cors",
        headers: { Accept: "application/json" }
      });
      
      if (res.ok) {
        const data = await res.json();
        console.log(`[MCP] Successfully fetched from ${endpoint}:`, data);
        
        // Check if response has tools directly or nested
        if (data.tools) {
          return data;
        } else if (Array.isArray(data)) {
          return { tools: data };
        } else if (data.result && data.result.tools) {
          return data.result;
        }
        
        // If we get here, the endpoint responded but doesn't have tools
        console.log(`[MCP] Endpoint ${endpoint} responded but no tools found in:`, data);
      } else {
        console.log(`[MCP] Endpoint ${endpoint} returned ${res.status}`);
      }
    } catch (error) {
      console.log(`[MCP] Failed to fetch from ${endpoint}:`, error);
    }
  }
  
  throw new Error(`No manifest found. Tried endpoints: ${endpoints.join(', ')}`);
}