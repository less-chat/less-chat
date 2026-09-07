import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { automation, commentEvent, conversation, db, message } from "@/db";
import { getSession } from "@/lib/session";
import { StatusPill } from "../automations/status-pill";

export const dynamic = "force-dynamic";

function timeAgo(date: Date | null): string {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { tab } = await searchParams;
  const activeTab = tab === "messages" ? "messages" : "activity";

  return (
    <div>
      <h1 className="text-lg font-semibold tracking-tight">Inbox</h1>
      <p className="mt-0.5 text-sm text-muted">
        What your automations did, and the DMs that came back.
      </p>

      <div className="mt-5 flex gap-1 border-b border-line">
        {[
          { key: "activity", label: "Activity" },
          { key: "messages", label: "Messages" },
        ].map((t) => (
          <Link
            key={t.key}
            href={`/inbox?tab=${t.key}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${
              activeTab === t.key
                ? "border-accent font-medium text-accent"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="mt-6">
        {activeTab === "activity" ? (
          <Activity accountId={session.accountId} />
        ) : (
          <Messages accountId={session.accountId} />
        )}
      </div>
    </div>
  );
}

/**
 * The automation log. This is the debugging surface for the question that
 * actually matters day to day: "why didn't this person get their link?"
 */
async function Activity({ accountId }: { accountId: string }) {
  const rows = await db
    .select({
      event: commentEvent,
      automationName: automation.name,
    })
    .from(commentEvent)
    .leftJoin(automation, eq(commentEvent.automationId, automation.id))
    .where(eq(commentEvent.accountId, accountId))
    .orderBy(desc(commentEvent.createdAt))
    .limit(100);

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line bg-surface p-12 text-center text-sm text-muted">
        Nothing yet. When someone comments a keyword on a covered post, it shows
        up here.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {rows.map(({ event, automationName }) => (
        <li key={event.id} className="px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-medium">@{event.fromUsername ?? "someone"}</span>{" "}
                <span className="text-muted">commented</span>{" "}
                <span className="break-words">&ldquo;{event.commentText}&rdquo;</span>
              </p>
              <p className="mt-1 text-xs text-muted">
                {automationName ?? "deleted automation"}
                {event.matchedKeyword ? ` · matched "${event.matchedKeyword}"` : ""} ·{" "}
                {timeAgo(event.createdAt)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-xs text-muted">reply</span>
              <StatusPill status={event.replyStatus} />
              <span className="ml-1 text-xs text-muted">DM</span>
              <StatusPill status={event.dmStatus} />
            </div>
          </div>

          {event.replyError || event.dmError ? (
            <p className="mt-2 rounded-lg bg-bad-soft px-3 py-2 text-xs text-bad">
              {event.dmError ?? event.replyError}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Read-only DM threads, served entirely from our mirror. Instagram's API
 * exposes only the 20 most recent messages per thread, so the local copy is
 * what makes older history visible at all.
 */
async function Messages({ accountId }: { accountId: string }) {
  const threads = await db
    .select()
    .from(conversation)
    .where(eq(conversation.accountId, accountId))
    .orderBy(desc(conversation.lastMessageAt))
    .limit(50);

  if (threads.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line bg-surface p-12 text-center text-sm text-muted">
        No conversations yet. They appear as people reply to your automated DMs.
      </p>
    );
  }

  const messages = await db
    .select()
    .from(message)
    .orderBy(desc(message.sentAt))
    .limit(500);

  const byThread = new Map<string, typeof messages>();
  for (const m of messages) {
    const list = byThread.get(m.conversationId) ?? [];
    list.push(m);
    byThread.set(m.conversationId, list);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Read-only. Reply from the Instagram app — sending from here would run
        into Meta&rsquo;s 24-hour messaging window.
      </p>

      {threads.map((thread) => {
        const thread_messages = (byThread.get(thread.id) ?? []).slice(0, 6).reverse();

        return (
          <details
            key={thread.id}
            className="overflow-hidden rounded-xl border border-line bg-surface"
          >
            <summary className="flex cursor-pointer items-center gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  @{thread.participantUsername ?? thread.participantIgId ?? "unknown"}
                </p>
                <p className="truncate text-xs text-muted">
                  {thread.lastMessagePreview ?? "No preview"}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted">
                {timeAgo(thread.lastMessageAt)}
              </span>
            </summary>

            <div className="space-y-2 border-t border-line bg-canvas px-5 py-4">
              {thread_messages.length === 0 ? (
                <p className="text-xs text-muted">No messages mirrored yet.</p>
              ) : (
                thread_messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.isFromAccount ? "justify-end" : "justify-start"}`}
                  >
                    <span
                      className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm break-words ${
                        m.isFromAccount
                          ? "rounded-br-sm bg-accent text-white"
                          : "rounded-bl-sm border border-line bg-surface"
                      }`}
                    >
                      {m.text ?? m.attachmentSummary ?? "(attachment)"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
