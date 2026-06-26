import { BrailleLoader } from "./BrailleLoader";
import { Shimmer } from "./Shimmer";
import { truncateSwarmTaskTitle, getSwarmWorkerStatusLabel, type SwarmWorkerState } from "../lib/swarm-progress";

interface SwarmWorkerRowProps {
  worker: SwarmWorkerState;
  model?: string;
}

function formatModelLabel(model?: string): string | undefined {
  if (!model?.trim()) return undefined;
  const trimmed = model.trim();
  const slash = trimmed.lastIndexOf("/");
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

export function SwarmWorkerRow({ worker, model }: SwarmWorkerRowProps) {
  const title = truncateSwarmTaskTitle(worker.task);
  const modelLabel = formatModelLabel(model);
  const statusText = getSwarmWorkerStatusLabel(worker);

  return (
    <div className="swarm-worker-row">
      <BrailleLoader className="swarm-worker-braille" decorative />
      <div className="swarm-worker-body">
        <div className="swarm-worker-title">
          <span className="swarm-worker-title-text">{title}</span>
          {modelLabel ? <span className="swarm-worker-model">{modelLabel}</span> : null}
        </div>
        <Shimmer as="span" className="swarm-worker-status">
          {statusText}
        </Shimmer>
      </div>
    </div>
  );
}
