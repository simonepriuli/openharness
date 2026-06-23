import discordIconUrl from "./discord-icon-svgrepo-com.svg";

type DiscordIconProps = {
  size?: number;
  className?: string;
};

export function DiscordIcon({ size = 16, className }: DiscordIconProps) {
  return (
    <img
      src={discordIconUrl}
      alt=""
      width={size}
      height={size}
      className={className ? `discord-icon ${className}` : "discord-icon"}
      aria-hidden
    />
  );
}
