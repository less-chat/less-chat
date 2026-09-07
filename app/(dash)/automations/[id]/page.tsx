import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { automation, commentEvent, db } from "@/db";
import { getSession } from "@/lib/session";
import { deleteAutomation, updateAutomation } from "../../actions";
import { AutomationForm } from "../automation-form";
import { listPosts } from "../posts";
import { StatusPill } from "../status-pill";

export const dynamic = "force-dynamic";

export default async function EditAutomationPage({
  params,
}: PageProps<"/automations/[id]">) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;

  const [row] = await db
    .select()
    .from(automation)
    .where(and(eq(automation.id, id), eq(automation.accountId, session.accountId)))
    .limit(1);
  if (!row) notFound();

  const [posts, recent] = await Promise.all([
    listPosts(session.accountId),
    db
      .select()
      .from(commentEvent)
      .where(eq(commentEvent.automationId, id))
      .orderBy(desc(commentEvent.createdAt))
      .limit(5),
  ]);

  const remove = deleteAutomation.bind(null, id);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">{row.name}</h1>
            <StatusPill status={row.status} />
          </div>
          {row.status === "live" && row.scope === "from_now_on" && row.appliesFrom ? (
            <p className="mt-0.5 text-xs text-muted">
              Applies to posts published after{" "}
              {row.appliesFrom.toLocaleString("en-US", { dateStyle: "medium" })}
            </p>
          ) : null}
        </div>
        <form action={remove}>
          <button type="submit" className="text-sm text-muted transition hover:text-bad">
            Delete
          </button>
        </form>
      </div>

      <AutomationForm
        action={updateAutomation}
        posts={posts}
        submitLabel={row.status === "live" ? "Save changes" : "Publish"}
        defaults={{
          id: row.id,
          name: row.name,
          keywords: row.keywords,
          matchMode: row.matchMode,
          scope: row.scope,
          postIds: row.postIds,
          replyEnabled: row.replyEnabled,
          replyVariants: row.replyVariants,
          dmText: row.dmText,
          dmLink: row.dmLink,
          status: row.status,
        }}
      />

      {recent.length > 0 ? (
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Recent triggers</h2>
            <Link href="/inbox" className="text-xs text-accent hover:underline">
              View all activity
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {recent.map((event) => (
              <li key={event.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="text-muted">
                    @{event.fromUsername ?? "someone"}
                  </span>{" "}
                  {event.commentText}
                </span>
                <StatusPill status={event.dmStatus} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
