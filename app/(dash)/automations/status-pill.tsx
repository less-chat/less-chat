const STYLES: Record<string, string> = {
  live: "bg-good-soft text-good",
  paused: "bg-warn-soft text-warn",
  draft: "bg-canvas text-muted",
  sent: "bg-good-soft text-good",
  failed: "bg-bad-soft text-bad",
  pending: "bg-warn-soft text-warn",
  skipped: "bg-canvas text-muted",
  dead: "bg-bad-soft text-bad",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
        STYLES[status] ?? "bg-canvas text-muted"
      }`}
    >
      {status}
    </span>
  );
}
