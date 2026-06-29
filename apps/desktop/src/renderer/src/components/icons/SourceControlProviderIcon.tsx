import { AzureDevOpsIcon } from "./AzureDevOpsIcon";
import { GithubIcon } from "./GithubIcon";

export type SourceControlProviderId = "github" | "azure_devops";

type SourceControlProviderIconProps = {
  provider: string;
  size?: number;
  className?: string;
};

export function sourceControlProviderLabel(provider: string): string {
  return provider === "azure_devops" ? "Azure DevOps" : "GitHub";
}

export function SourceControlProviderIcon({
  provider,
  size = 16,
  className = "workflow-trigger-icon",
}: SourceControlProviderIconProps) {
  if (provider === "azure_devops") {
    return <AzureDevOpsIcon size={size} className={className} />;
  }
  return <GithubIcon size={size} className={className} />;
}
