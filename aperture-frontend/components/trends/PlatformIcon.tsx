import React from "react";

export type SupportedPlatform = "x" | "reddit" | "telegram";

interface PlatformIconProps {
  platform: string;
  size?: "sm" | "md" | "lg" | "xl";
  shape?: "circle" | "rounded";
  className?: string;
  customBg?: string;
  showBadge?: boolean;
}

export function normalizePlatform(nameOrSlug?: string): SupportedPlatform {
  const p = (nameOrSlug || "").toLowerCase();
  if (p.includes("x") || p.includes("twitter")) return "x";
  if (p.includes("reddit") || p === "rd") return "reddit";
  if (p.includes("tele") || p === "tg") return "telegram";
  // Default fallback to telegram for any legacy/other platforms
  return "telegram";
}

export function getPlatformMeta(nameOrSlug?: string) {
  const norm = normalizePlatform(nameOrSlug);
  switch (norm) {
    case "x":
      return { id: "x", name: "X", color: "#000000" };
    case "reddit":
      return { id: "reddit", name: "Reddit", color: "#FF4500" };
    case "telegram":
      return { id: "telegram", name: "Telegram", color: "#24A1DE" };
  }
}

export function PlatformIcon({
  platform,
  size = "sm",
  shape = "circle",
  className = "",
  customBg,
  showBadge = true,
}: PlatformIconProps) {
  const norm = normalizePlatform(platform);
  const meta = getPlatformMeta(norm);

  const iconSizes = {
    sm: norm === "x" ? "w-2.5 h-2.5" : "w-3 h-3",
    md: norm === "x" ? "w-3.5 h-3.5" : "w-4 h-4",
    lg: norm === "x" ? "w-5 h-5" : "w-5 h-5",
    xl: norm === "x" ? "w-6 h-6" : "w-7 h-7",
  };

  const badgeSizes = {
    sm: "w-[22px] h-[22px]",
    md: "w-7 h-7",
    lg: "w-10 h-10",
    xl: "w-[64px] h-[64px]",
  };

  const shapeClasses = {
    circle: "rounded-full",
    rounded: "rounded-lg",
  };

  const renderSvg = () => {
    switch (norm) {
      case "x":
        return (
          <svg
            className={`${iconSizes[size]} fill-white`}
            viewBox="0 0 24 24"
            aria-label="X"
          >
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        );
      case "reddit":
        return (
          <svg
            className={`${iconSizes[size]} fill-white`}
            viewBox="0 0 24 24"
            aria-label="Reddit"
          >
            <path d="M22 12c0-1.1-.9-2-2-2-.41 0-.79.13-1.11.34-1.34-.94-3.15-1.55-5.16-1.64l1.07-5.02 3.5.74c.03.82.7 1.48 1.52 1.48 1.1 0 2-.9 2-2s-.9-2-2-2c-.84 0-1.53.52-1.82 1.25l-3.92-.83a.475.475 0 0 0-.55.37l-1.2 5.65c-2.06.07-3.92.68-5.28 1.63-.32-.22-.71-.35-1.13-.35-1.1 0-2 .9-2 2 0 .76.43 1.42 1.06 1.76-.04.28-.06.56-.06.85 0 3.86 4.03 7 9 7s9-3.14 9-7c0-.29-.02-.57-.06-.85.63-.34 1.06-1 1.06-1.76zm-14.5 2c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5zm8.93 4.29c-.77.77-2.04 1.08-3.43 1.08s-2.66-.31-3.43-1.08a.5.5 0 0 1 .71-.71c.56.56 1.58.79 2.72.79s2.16-.23 2.72-.79a.5.5 0 0 1 .71.71zm-.93-2.79c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
          </svg>
        );
      case "telegram":
        return (
          <svg
            className={`${iconSizes[size]} fill-white translate-x-[-0.5px]`}
            viewBox="0 0 24 24"
            aria-label="Telegram"
          >
            <path d="m20.665 3.717-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l-.313 4.693c.46 0 .663-.211.921-.46l2.211-2.15 4.599 3.397c.848.467 1.457.227 1.668-.785l3.019-14.228c.309-1.239-.473-1.8-1.282-1.434z" />
          </svg>
        );
    }
  };

  if (!showBadge) {
    return renderSvg();
  }

  const bg = customBg || meta.color;

  return (
    <div
      className={`${badgeSizes[size]} ${shapeClasses[shape]} flex flex-shrink-0 items-center justify-center text-white shrink-0 shadow-sm ${className}`}
      style={{ backgroundColor: bg }}
      title={meta.name}
    >
      {renderSvg()}
    </div>
  );
}
