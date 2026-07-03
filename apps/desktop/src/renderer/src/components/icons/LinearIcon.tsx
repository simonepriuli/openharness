import linearIconUrl from "./linear-svgrepo-com.svg";

type LinearIconProps = {
  size?: number;
  className?: string;
};

export function LinearIcon({ size = 16, className }: LinearIconProps) {
  return (
    <img
      src={linearIconUrl}
      alt=""
      width={size}
      height={size}
      className={className ? `linear-icon ${className}` : "linear-icon"}
      aria-hidden
    />
  );
}
