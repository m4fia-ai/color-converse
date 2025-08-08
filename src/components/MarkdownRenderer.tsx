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
    <>
      <div className="overflow-x-auto">
        <div
          className="prose prose-sm max-w-none dark:prose-invert markdown-table"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </div>

      {/* global style block – exactly the same rules from RemarkTableParser */}
      <style jsx global>{`
        .markdown-table table {
          border-collapse: separate;
          border-spacing: 0;
          width: 100%;
          margin: 1rem 0;
          background-color: rgba(0, 0, 0, 0.3);
          border-radius: 0.75rem;
          overflow: hidden;
          font-feature-settings: 'tnum';
          font-variant-numeric: tabular-nums;
          font-size: 14px;
        }

        .markdown-table th {
          background-color: transparent;
          font-weight: 600;
          text-align: left;
          padding: 1rem;
          border: 1px solid rgb(212, 212, 212);
          color: rgb(38, 38, 38);
          letter-spacing: -0.01em;
          line-height: 1.5;
          font-size: 14px;
        }

        .markdown-table th:first-child            { border-top-left-radius: 0.75rem; }
        .markdown-table th:last-child             { border-top-right-radius: 0.75rem; }
        .markdown-table tr:last-child td:first-child { border-bottom-left-radius: 0.75rem; }
        .markdown-table tr:last-child td:last-child  { border-bottom-right-radius: 0.75rem; }

        .markdown-table td {
          padding: 1rem;
          border: 1px solid rgb(212, 212, 212);
          vertical-align: middle;
          color: rgb(38, 38, 38);
          background-color: transparent;
          font-size: 14px;
          line-height: 1.5;
          font-feature-settings: 'tnum';
          font-variant-numeric: tabular-nums;
        }

        .markdown-table tr:hover td { background-color: rgba(0, 0, 0, 0.4); }

        .markdown-table p { margin: 0; font-size: 14px; line-height: 1.5; color: rgb(38, 38, 38); }

        /* ---------------- dark mode overrides ---------------- */
        .dark .markdown-table table { background-color: rgba(0, 0, 0, 0.3); }
        .dark .markdown-table th    { color: rgb(229, 229, 229); border-color: rgb(82, 82, 82); }
        .dark .markdown-table td    { color: rgb(229, 229, 229); border-color: rgb(82, 82, 82); }
        .dark .markdown-table tr:hover td { background-color: rgba(0, 0, 0, 0.4); }
        .dark .markdown-table p     { color: rgb(229, 229, 229); }

        /* links, code, strong, etc. */
        .markdown-table strong { font-weight: 600; letter-spacing: -0.01em; }
        .markdown-table a      { color: rgb(59, 130, 246); text-decoration: none; font-weight: 500; }
        .dark .markdown-table a { color: rgb(96, 165, 250); }
        .markdown-table code  {
          background-color: rgb(212, 212, 212);
          padding: 0.2rem 0.4rem;
          border-radius: 0.25rem;
          font-family: ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
          font-size: 14px;
        }
        .dark .markdown-table code { background-color: rgb(82, 82, 82); }
      `}</style>
    </>
  );
};
