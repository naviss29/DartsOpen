import type { ReactNode } from "react";
import { Text, Title, cn } from "@naviss29/design-system";

interface Props {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "light" | "dark";
  className?: string;
}

export default function EmptyState({ icon, title, description, action, tone = "light", className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center",
        tone === "light" ? "border-gray-300" : "border-darts-border",
        className,
      )}
    >
      {icon && (
        <span className="text-4xl" aria-hidden="true">
          {icon}
        </span>
      )}
      <Title as="h3" size="sm" className={tone === "dark" ? "text-darts-text" : undefined}>
        {title}
      </Title>
      {description && (
        <Text tone="secondary" size="sm" className={tone === "dark" ? "text-darts-text-secondary" : undefined}>
          {description}
        </Text>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
