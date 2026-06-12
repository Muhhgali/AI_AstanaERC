import Image from "next/image";

type BrandMarkProps = {
  size?: "sm" | "md" | "lg";
  variant?: "mark" | "full";
  className?: string;
};

const markSizes = {
  sm: "h-9 w-9",
  md: "h-11 w-11",
  lg: "h-14 w-14",
};

const fullSizes = {
  sm: "h-9 w-32",
  md: "h-11 w-40",
  lg: "h-16 w-56",
};

export function BrandMark({
  size = "md",
  variant = "mark",
  className = "",
}: BrandMarkProps) {
  if (variant === "full") {
    return (
      <div
        className={`${fullSizes[size]} relative flex shrink-0 items-center ${className}`}
        aria-label="Астана ЕРЦ"
      >
        <Image
          src="/astana-erc-logo.png"
          alt="Астана ЕРЦ"
          fill
          sizes="224px"
          className="h-full w-full object-contain object-left"
        />
      </div>
    );
  }

  return (
    <div
      className={`${markSizes[size]} relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-sky-100 bg-white shadow-sm ${className}`}
      aria-label="Астана ЕРЦ"
    >
      <Image
        src="/astana-erc-logo.png"
        alt="Астана ЕРЦ"
        fill
        sizes="56px"
        className="h-[78%] w-[78%] object-contain"
      />
    </div>
  );
}
