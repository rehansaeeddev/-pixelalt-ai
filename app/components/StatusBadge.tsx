const STATUS_LABEL: Record<string, string> = {
  not_generated: "Not Generated",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};

const STATUS_TONE: Record<string, "critical" | "warning" | "success" | "neutral"> = {
  not_generated: "warning",
  processing: "neutral",
  completed: "success",
  failed: "critical",
};

export function StatusBadge({ status }: { status: string }) {
  return <s-badge tone={STATUS_TONE[status] ?? "neutral"}>{STATUS_LABEL[status] ?? status}</s-badge>;
}
