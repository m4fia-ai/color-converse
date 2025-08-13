import { useState, useEffect } from 'react';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import { ToolCallIndicator } from './ToolCallIndicator';
import { CampaignSummaryTable } from './CampaignSummaryTable';

interface MarkdownRendererProps {
  content: string;
}

// Custom rehype plugin to make links open in new tab
const rehypeExternalLinks = () => {
  return (tree: any) => {
    visit(tree, 'element', (node) => {
      if (node.tagName === 'a') {
        node.properties = node.properties || {};
        node.properties.target = '_blank';
        node.properties.rel = 'noopener noreferrer';
      }
    });
  };
};

// Enhanced sanitize schema that preserves list styling
const enhancedSanitizeSchema = {
  attributes: {
    '*': ['className', 'style'],
    a: ['href', 'target', 'rel'],
    ol: ['start', 'type', 'reversed'],
    li: ['value'],
    div: ['dataComponentId'],
    span: []
  },
  tagNames: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'strong', 'em', 'b', 'i', 'u',
    'ol', 'ul', 'li',
    'a', 'code', 'pre',
    'blockquote',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'div', 'span',
    'hr'
  ]
};

export const MarkdownRenderer = ({ content }: MarkdownRendererProps) => {
  const [processedContent, setProcessedContent] = useState('');
  const [customComponents, setCustomComponents] = useState<JSX.Element[]>([]);

  useEffect(() => {
    const processContent = async () => {
      // Extract custom components first
      const components: JSX.Element[] = [];
      let processedText = content;

      // Handle ToolCallIndicator components
      processedText = processedText.replace(
        /<ToolCallIndicator\s+status="([^"]+)"\s+toolName="([^"]+)"(?:\s+duration="(\d+)")?\s*\/>/g,
        (match, status, toolName, duration) => {
          const id = `component-${components.length}`;
          const durationNum = duration ? parseInt(duration) : undefined;
          components.push(
            <ToolCallIndicator 
              key={id}
              status={status as 'pre-call' | 'calling' | 'success' | 'error'} 
              toolName={toolName} 
              duration={durationNum} 
              compact 
            />
          );
          return `<div data-component-id="${id}"></div>`;
        }
      );

      // Handle CampaignSummaryTable components  
      processedText = processedText.replace(
        /<CampaignSummaryTable\s+items='([^']+)'\s+title="([^"]+)"\s*\/>/g,
        (match, itemsJson, title) => {
          const id = `component-${components.length}`;
          try {
            const items = JSON.parse(itemsJson);
            components.push(
              <CampaignSummaryTable 
                key={id}
                items={items} 
                title={title} 
              />
            );
          } catch (e) {
            console.error('Failed to parse campaign summary items:', e);
            components.push(<div key={id}>Error rendering campaign summary</div>);
          }
          return `<div data-component-id="${id}"></div>`;
        }
      );

      setCustomComponents(components);

      // Process markdown
      try {
        const processed = await unified()
          .use(remarkParse)
          .use(remarkGfm)
          .use(remarkRehype, { allowDangerousHtml: true })
          .use(rehypeRaw)
          .use(rehypeExternalLinks) // Add our custom plugin for external links
          .use(rehypeSanitize, enhancedSanitizeSchema) // Use enhanced schema
          .use(rehypeStringify)
          .process(processedText);

        setProcessedContent(String(processed));
      } catch (err) {
        console.error('Markdown processing error:', err);
        setProcessedContent(processedText);
      }
    };

    processContent();
  }, [content]);

  // Replace component placeholders with actual components
  const renderWithComponents = (html: string) => {
    const parts = html.split(/(<div data-component-id="[^"]*"><\/div>)/);
    return parts.map((part, index) => {
      const match = part.match(/<div data-component-id="component-(\d+)"><\/div>/);
      if (match) {
        const componentIndex = parseInt(match[1]);
        return customComponents[componentIndex] || null;
      }
      return <span key={index} dangerouslySetInnerHTML={{ __html: part }} />;
    });
  };

  return (
    <div className="overflow-x-auto">
      <div className="prose prose-sm max-w-none dark:prose-invert markdown-content">
        {renderWithComponents(processedContent)}
      </div>
    </div>
  );
};
