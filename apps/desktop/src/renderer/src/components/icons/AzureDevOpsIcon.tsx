import azureDevOpsIconUrl from "./azure-devops.svg";

type AzureDevOpsIconProps = {
  size?: number;
  className?: string;
};

export function AzureDevOpsIcon({ size = 16, className }: AzureDevOpsIconProps) {
  return (
    <img
      src={azureDevOpsIconUrl}
      alt=""
      width={size}
      height={size}
      className={className ? `azure-devops-icon ${className}` : "azure-devops-icon"}
      aria-hidden
    />
  );
}
