import { useParams } from "react-router-dom";
import { getPageBySlug } from "../lib/content";
import { MarkdownPage } from "../components/MarkdownPage";
import { NotFoundPage } from "../components/NotFoundPage";

export function DocRoutePage(): React.JSX.Element {
  const params = useParams();
  const slugParam = params["*"] ?? "";
  const slug = slugParam ? `/${slugParam}` : "/";
  const page = getPageBySlug(slug);

  if (!page) {
    return <NotFoundPage />;
  }

  return <MarkdownPage page={page} />;
}
