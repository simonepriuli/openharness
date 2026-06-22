import teamsIconUrl from "../../icons/ms-teams.svg";

type MsTeamsIconProps = {
  size?: number;
  className?: string;
};

export function MsTeamsIcon({ size = 16, className }: MsTeamsIconProps) {
  return (
    <img
      src={teamsIconUrl}
      alt=""
      width={size}
      height={size}
      className={className ? `ms-teams-icon ${className}` : "ms-teams-icon"}
      aria-hidden
    />
  );
}
