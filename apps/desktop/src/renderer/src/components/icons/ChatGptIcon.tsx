import chatGptIconUrl from "./chatgpt-6.svg";

type ChatGptIconProps = {
  size?: number;
  className?: string;
};

export function ChatGptIcon({ size = 16, className }: ChatGptIconProps) {
  return (
    <img
      src={chatGptIconUrl}
      alt=""
      width={size}
      height={size}
      className={className ? `chatgpt-icon ${className}` : "chatgpt-icon"}
      aria-hidden
    />
  );
}
