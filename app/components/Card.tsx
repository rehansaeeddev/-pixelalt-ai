import type { ReactNode } from "react";

type CardProps = {
  heading?: string;
  children: ReactNode;
};

export function Card({ heading, children }: CardProps) {
  return <s-section heading={heading}>{children}</s-section>;
}

type StatTileProps = {
  label: string;
  value: string;
  icon: string;
  tone?: "default" | "success" | "warning" | "critical";
};

const TONE_TO_ICON_TONE: Record<string, "neutral" | "success" | "warning" | "critical"> = {
  default: "neutral",
  success: "success",
  warning: "warning",
  critical: "critical",
};

export function StatTile({ label, value, icon, tone = "default" }: StatTileProps) {
  return (
    <s-box padding="base" borderWidth="base" borderColor="base" borderRadius="base" background="base">
      <s-stack direction="inline" gap="base" alignItems="center">
        <s-box padding="small-200" borderRadius="base" background="subdued">
          <s-icon type={icon as never} tone={TONE_TO_ICON_TONE[tone]} />
        </s-box>
        <s-stack direction="block" gap="small-200">
          <s-text color="subdued">{label}</s-text>
          <s-text type="strong">{value}</s-text>
        </s-stack>
      </s-stack>
    </s-box>
  );
}
