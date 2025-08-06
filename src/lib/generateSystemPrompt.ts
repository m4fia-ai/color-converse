/** lib/generateSystemPrompt.ts */
import { MCPTool } from './mcpClient';

const BASE_PROMPT = `
You are Campaign Builder AI by Climaty – an expert that helps marketers set up, optimise and debug Meta & Google campaigns.
Answer clearly, show JSON where relevant, and never reveal internal tool code.
When a tool is relevant, call it. Otherwise, guide the user in plain English.

IMPORTANT: For the first tool call in any conversation, do NOT include the session_id parameter. Use session_id only in subsequent tool calls after you've obtained it from a previous response.
`;

export const generateSystemPrompt = (tools: MCPTool[] = []) => {
  if (!tools.length) return BASE_PROMPT;

  const toolList = tools
    .map(
      (t) => `### ${t.name}
${t.description}
When you call this tool, pass **JSON** that matches this schema:

\`\`\`json
${JSON.stringify(t.inputSchema ?? {}, null, 2)}
\`\`\``,
    )
    .join('\n\n');

  return `${BASE_PROMPT}

Below is a catalogue of tools you can call at any time.  
Use them whenever they help you answer the user:

${toolList}`;
};