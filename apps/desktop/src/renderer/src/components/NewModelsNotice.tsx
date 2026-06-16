import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Fragment, type ReactNode } from "react";
import type { HarnessModelInfo } from "../../../preload/api";
import {
  formatModelRefLabel,
  modelRefFromParts,
  toDisplayModelOption,
} from "../lib/model-ref-display";
import { useNewModelsNotice } from "../hooks/useNewModelsNotice";
import newModelsNoticeImage from "../images/image22.png";

const MAX_EXAMPLES = 3;

function formatModelLabel(model: HarnessModelInfo): string {
  if (model.name?.trim()) {
    return model.name.trim();
  }
  const ref = modelRefFromParts(model.provider, model.id);
  return formatModelRefLabel(toDisplayModelOption(ref));
}

function emphasizeModel(label: string): ReactNode {
  return <strong className="new-models-notice-model">{label}</strong>;
}

function renderExampleModels(labels: string[]): ReactNode {
  const examples = labels.slice(0, MAX_EXAMPLES);
  const remaining = labels.length - examples.length;

  let examplesPart: ReactNode;
  if (examples.length === 1) {
    examplesPart = emphasizeModel(examples[0]!);
  } else if (examples.length === 2) {
    examplesPart = (
      <>
        {emphasizeModel(examples[0]!)}
        {" and "}
        {emphasizeModel(examples[1]!)}
      </>
    );
  } else {
    examplesPart = (
      <>
        {examples.slice(0, -1).map((label, index) => (
          <Fragment key={label}>
            {index > 0 ? ", " : ""}
            {emphasizeModel(label)}
          </Fragment>
        ))}
        {", and "}
        {emphasizeModel(examples[examples.length - 1]!)}
      </>
    );
  }

  return (
    <>
      Now available, like {examplesPart}
      {remaining > 0 ? `, and ${remaining} more` : ""}.
    </>
  );
}

export function NewModelsNotice() {
  const { notice, dismiss } = useNewModelsNotice();

  if (!notice) {
    return null;
  }

  const labels = notice.models.map(formatModelLabel);

  return (
    <div
      className="new-models-notice app-region-no-drag"
      role="dialog"
      aria-labelledby="new-models-notice-title"
      aria-describedby="new-models-notice-copy"
    >
      <button
        type="button"
        className="new-models-notice-dismiss"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.75} aria-hidden />
      </button>
      <p id="new-models-notice-title" className="new-models-notice-title">
        New models available
      </p>
      <p id="new-models-notice-copy" className="new-models-notice-copy">
        {renderExampleModels(labels)}
      </p>
      <div className="new-models-notice-hero">
        <img
          className="new-models-notice-hero-image"
          src={newModelsNoticeImage}
          alt=""
          aria-hidden
        />
        <p className="new-models-notice-hero-label">OpenHarness {notice.version}</p>
      </div>
    </div>
  );
}
