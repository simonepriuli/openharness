import { Children, isValidElement, memo, useMemo, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";
import { MermaidDiagram } from "./MermaidDiagram";

interface MarkdownContentProps {
  content: string;
}

function extractMermaidChart(children: ReactNode): string | null {
  const child = Children.only(children);
  if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) {
    return null;
  }

  const className = child.props.className ?? "";
  if (!className.includes("language-mermaid")) {
    return null;
  }

  const code = String(child.props.children ?? "").replace(/\n$/, "");
  return code;
}

function MarkdownContentInner({ content }: MarkdownContentProps) {
  const markdownComponents = useMemo(
    () => ({
      a: ({ href, children }: { href?: string; children?: ReactNode }) => (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      ),
      pre: ({ children, ...props }: { children?: ReactNode }) => {
        const mermaidChart = extractMermaidChart(children);
        if (mermaidChart !== null) {
          return <MermaidDiagram chart={mermaidChart} />;
        }

        return <CodeBlock {...props}>{children}</CodeBlock>;
      },
    }),
    [],
  );

  if (!content) return null;

  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export const MarkdownContent = memo(MarkdownContentInner);
