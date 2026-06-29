import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { Link } from "react-router-dom";
import type { DocPage, WelcomeCard } from "../lib/types";
import { useTocHeadings } from "../lib/use-toc";
import { isExternalHref } from "../lib/docs-nav";

type MarkdownPageProps = {
  page: DocPage;
};

function WelcomeCards({
  title,
  cards,
}: {
  title: string;
  cards: WelcomeCard[];
}): React.JSX.Element {
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const inner = (
            <>
              <h3 className="font-medium text-gray-900">{card.title}</h3>
              <p className="mt-1 text-sm text-gray-500">{card.description}</p>
            </>
          );
          const className =
            "rounded-lg border border-gray-200 bg-gray-50 p-4 transition-colors hover:border-gray-300 hover:bg-gray-100";

          if (isExternalHref(card.href)) {
            return (
              <a
                key={card.title}
                href={card.href}
                target="_blank"
                rel="noreferrer"
                className={className}
              >
                {inner}
              </a>
            );
          }

          return (
            <Link key={card.title} to={card.href} className={className}>
              {inner}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function MarkdownPage({ page }: MarkdownPageProps): React.JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null);
  useTocHeadings(contentRef, page.slug);

  useEffect(() => {
    document.title = `${page.title} — OpenHarness Docs`;
  }, [page.title]);

  return (
    <article className="min-w-0 flex-1 py-8 lg:py-10">
      <header className="mb-8 border-b border-gray-100 pb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
          {page.title}
        </h1>
        {page.description ? (
          <p className="mt-3 text-lg text-gray-500">{page.description}</p>
        ) : null}
      </header>

      <div ref={contentRef} className="prose prose-gray max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSlug]}
          components={{
            a: ({ href, children, ...props }) => {
              if (href?.startsWith("/")) {
                return (
                  <Link to={href} {...props}>
                    {children}
                  </Link>
                );
              }
              return (
                <a href={href} target="_blank" rel="noreferrer" {...props}>
                  {children}
                </a>
              );
            },
          }}
        >
          {page.body}
        </ReactMarkdown>
      </div>

      {page.startHereCards ? (
        <WelcomeCards title="Start here" cards={page.startHereCards} />
      ) : null}
      {page.featureCards ? (
        <WelcomeCards title="What you can do with OpenHarness" cards={page.featureCards} />
      ) : null}
    </article>
  );
}
