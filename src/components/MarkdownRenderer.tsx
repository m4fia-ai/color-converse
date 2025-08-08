import { useState, useEffect } from 'react';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer = ({ content }: MarkdownRendererProps) => {
  const [htmlContent, setHtmlContent] = useState('');

  useEffect(() => {
    const processMarkdown = async () => {
      try {
        const processed = await unified()
          .use(remarkParse)
          .use(remarkGfm)
          .use(remarkRehype, { allowDangerousHtml: true })
          .use(rehypeRaw)
          .use(rehypeSanitize)
          .use(rehypeStringify)
          .process(content);

        setHtmlContent(String(processed));
      } catch (err) {
        console.error('Markdown processing error:', err);
        setHtmlContent(content);          // fallback: plain text
      }
    };

    processMarkdown();
  }, [content]);

  return (
    <div className="overflow-x-auto">
      <div
        className="prose prose-sm max-w-none dark:prose-invert markdown-table"
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    </div>
  );
};
