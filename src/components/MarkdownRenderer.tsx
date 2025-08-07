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
        const processedContent = await unified()
          .use(remarkParse)
          .use(remarkGfm)
          .use(remarkRehype, { allowDangerousHtml: true })
          .use(rehypeRaw)
          .use(rehypeSanitize)
          .use(rehypeStringify)
          .process(content);

        setHtmlContent(String(processedContent));
      } catch (error) {
        console.error('Markdown processing error:', error);
        setHtmlContent(content); // Fallback to plain text
      }
    };

    processMarkdown();
  }, [content]);

  return (
    <div 
      className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-white prose-p:text-white prose-strong:text-white prose-li:text-white prose-table:text-white prose-th:text-white prose-td:text-white prose-code:text-white prose-pre:bg-black/20 prose-pre:text-white prose-blockquote:text-white prose-a:text-primary prose-a:hover:text-primary/80"
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
};