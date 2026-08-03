import { TextArea as BaseTextArea, cn, type TextAreaProps } from "@naviss29/design-system";

interface Props extends TextAreaProps {
  tone?: "light" | "dark";
}

const darkOverride =
  "border-darts-border bg-darts-surface text-darts-text placeholder-darts-text-secondary/60 focus:ring-darts-green";

export default function TextArea({ tone = "light", className, ...props }: Props) {
  return <BaseTextArea className={cn(tone === "dark" && darkOverride, className)} {...props} />;
}
