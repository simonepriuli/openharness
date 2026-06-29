import { Link } from "react-router-dom";

export function NotFoundPage(): React.JSX.Element {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">Page not found</h1>
      <p className="mt-2 text-gray-500">This documentation page does not exist.</p>
      <Link to="/" className="mt-6 inline-block text-sm font-medium text-accent hover:underline">
        Back to documentation home
      </Link>
    </div>
  );
}
