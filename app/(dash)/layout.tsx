import Link from "next/link";
import { redirect } from "next/navigation";
import { getAccountById } from "@/lib/account";
import { getSession } from "@/lib/session";
import { NavLink } from "./nav-link";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  if (!session) redirect("/login");

  const account = await getAccountById(session.accountId);
  if (!account) redirect("/login");

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
          <Link href="/automations" className="text-sm font-semibold tracking-tight">
            Lesschat
          </Link>

          <nav className="flex items-center gap-1">
            <NavLink href="/automations">Automations</NavLink>
            <NavLink href="/inbox">Inbox</NavLink>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {!account.webhookSubscribed ? (
              <span
                className="rounded-full bg-warn-soft px-2.5 py-1 text-xs font-medium text-warn"
                title="Comment events will not reach this app until webhooks are subscribed in the Meta dashboard."
              >
                Webhooks not subscribed
              </span>
            ) : null}
            <span className="text-sm text-muted">@{account.username}</span>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="text-sm text-muted transition hover:text-ink"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
