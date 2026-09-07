import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { automation, commentEvent, db } from "@/db";
import { getSession } from "@/lib/session";
import { StatusPill } from "./status-pill";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const rows = await db
    .select({
      id: automation.id,
      name: automation.name,
      status: automation.status,
      keywords: automation.keywords,
      scope: automation.scope,
      dmLink: automation.dmLink,
      triggered: sql<number>`(
        select count(*)::int from ${commentEvent}
        where "comment_event"."automation_id" = "automation"."id"
      )`,
    })
    .from(automation)
    .where(eq(automation.accountId, session.accountId))
    .orderBy(desc(automation.createdAt));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Automations</h1>
          <p className="mt-0.5 text-sm text-muted">
            Keyword rules that reply to comments and DM the link.
          </p>
        </div>
        <Link
          href="/automations/new"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          New automation
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-line bg-surface p-12 text-center">
          <p className="text-sm font-medium">No automations yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            Create one to start replying to comments and sending your link
            automatically.
          </p>
          <Link
            href="/automations/new"
            className="mt-5 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            Create your first automation
          </Link>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/automations/${row.id}`}
                className="flex items-center gap-4 px-5 py-4 transition hover:bg-canvas"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{row.name}</span>
                    <StatusPill status={row.status} />
                    {row.status === "live" && !row.dmLink ? (
                      <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs text-warn">
                        No link set
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted">
                    {row.keywords.join(", ") || "no keywords"} ·{" "}
                    {row.scope.replace(/_/g, " ")}
                  </p>
                </div>
                <span className="shrink-0 text-right text-xs text-muted">
                  <span className="block text-sm font-medium text-ink">
                    {row.triggered}
                  </span>
                  triggered
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
