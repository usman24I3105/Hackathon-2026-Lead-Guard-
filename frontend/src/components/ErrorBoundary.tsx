import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./Primitives";

interface Props {
  children: ReactNode;
}

interface BoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Never show the stack trace to the user — log it for us instead.
    // eslint-disable-next-line no-console
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold mb-2">Something went wrong.</h1>
          <p className="text-sm text-ink-2 mb-5">
            We couldn't display this page. Reloading usually fixes it — your data is safe.
          </p>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    );
  }
}
