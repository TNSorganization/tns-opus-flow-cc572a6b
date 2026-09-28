import { cn } from "@/lib/utils";
import logoDark from "@/assets/brand/tns-community-logo-dark.png";
import logoLight from "@/assets/brand/tns-community-logo-light.png";
import markDark from "@/assets/brand/tns-community-mark-dark.png";
import markLight from "@/assets/brand/tns-community-mark-light.png";

type BrandLogoProps = {
  kind?: "logo" | "mark";
  className?: string;
  alt?: string;
};

export function BrandLogo({ kind = "logo", className, alt = "TNS Community" }: BrandLogoProps) {
  const onDark = kind === "logo" ? logoLight : markLight;
  const onLight = kind === "logo" ? logoDark : markDark;
  const dimensions = kind === "logo" ? { width: 760, height: 435 } : { width: 206, height: 417 };

  return (
    <span className={cn("brand-logo", className)}>
      <img
        src={onDark}
        alt={alt}
        {...dimensions}
        className="brand-logo-on-dark h-full w-full object-contain"
      />
      <img
        src={onLight}
        alt={alt}
        {...dimensions}
        className="brand-logo-on-light h-full w-full object-contain"
      />
    </span>
  );
}
