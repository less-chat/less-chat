import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getSession()) redirect("/automations");
  const { error } = await searchParams;

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-line bg-surface p-8 shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight">Lesschat</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Reply to keyword comments and send the link by DM, automatically.
          </p>

          {error ? (
            <p className="mt-5 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
              {error}
            </p>
          ) : null}

          <a
            href="/api/auth/instagram"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            Continue with Instagram
          </a>

          <p className="mt-4 text-xs leading-relaxed text-muted">
            Requires an Instagram <strong>Professional</strong> account
            (Business or Creator).
          </p>
        </div>
      </div>
    </main>
  );
}
