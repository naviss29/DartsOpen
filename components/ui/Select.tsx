import { Select as BaseSelect, type SelectProps } from "@naviss29/design-system";
import { cn } from "@/lib/utils/cn";

interface Props extends SelectProps {
  tone?: "light" | "dark";
}

const darkOverride =
  "border-darts-border bg-darts-surface text-darts-text focus:ring-darts-green [color-scheme:dark]";

export default function Select({ tone = "light", className, ...props }: Props) {
  return <BaseSelect className={cn(tone === "dark" && darkOverride, className)} {...props} />;
}
