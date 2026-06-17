import type { DisplayModelOption } from "../../lib/model-ref-display";

type SettingsModelOptionContentProps = {
  option: DisplayModelOption;
};

export function SettingsModelOptionContent({ option }: SettingsModelOptionContentProps) {
  return (
    <span className="settings-model-option-main">
      <span className="settings-model-option-provider">{option.providerLabel}</span>
      {option.showLab ? (
        <span className="settings-model-option-lab">{option.lab}</span>
      ) : null}
      <span className="settings-model-option-name">{option.modelName}</span>
    </span>
  );
}
