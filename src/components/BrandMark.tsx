type BrandMarkProps = {
  variant: "dark" | "light";
  size?: "sm" | "md";
};

export function BrandMark({ variant, size = "md" }: BrandMarkProps) {
  const top =
    variant === "dark" ? "text-stone-300" : "text-[#6d6d6d]";
  const blue = "text-[#2a5790]";
  const bar = "bg-[#2a5790]";
  const topSize = size === "sm" ? "text-[10px]" : "text-[11px]";
  const bottomSize = size === "sm" ? "text-base" : "text-xl";
  const barWidth = size === "sm" ? "w-8" : "w-11";

  return (
    <span
      className="inline-flex flex-col items-start leading-none"
      aria-label="La Métallerie du Sud"
    >
      <span
        className={`${topSize} font-semibold uppercase tracking-[0.22em] ${top}`}
      >
        La Métallerie
      </span>
      <span className="mt-1 flex items-end gap-1.5">
        <span
          className={`${bottomSize} font-semibold uppercase tracking-[0.14em] ${blue}`}
        >
          Du Sud
        </span>
        <span
          aria-hidden
          className={`mb-[0.28em] h-[3px] ${barWidth} ${bar}`}
          style={{ clipPath: "polygon(0 0, 100% 45%, 100% 100%, 0 100%)" }}
        />
      </span>
    </span>
  );
}
