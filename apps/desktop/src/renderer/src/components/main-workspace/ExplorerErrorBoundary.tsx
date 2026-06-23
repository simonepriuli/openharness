import { Component, type ErrorInfo, type ReactNode } from "react";

type ExplorerErrorBoundaryProps = {
  children: ReactNode;
};

type ExplorerErrorBoundaryState = {
  error: Error | null;
};

export class ExplorerErrorBoundary extends Component<
  ExplorerErrorBoundaryProps,
  ExplorerErrorBoundaryState
> {
  state: ExplorerErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ExplorerErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ProjectExplorer]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="project-explorer-placeholder">
          <p>Project explorer failed to load.</p>
          <p className="mt-2 text-xs opacity-80">{this.state.error.message}</p>
        </div>
      );
    }

    return this.props.children;
  }
}
