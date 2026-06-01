import { Shimmer } from "./Shimmer";

export function Thinking() {
  return (
    <div className="thinking">
      <Shimmer as="span" className="thinking-text">
        Thinking…
      </Shimmer>
    </div>
  );
}
