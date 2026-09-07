"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { ActionState } from "../actions";

export interface PostOption {
  id: string;
  caption: string | null;
  thumbnailUrl: string | null;
  timestamp: Date | null;
}

export interface AutomationDefaults {
  id?: string;
  name: string;
  keywords: string[];
  matchMode: string;
  scope: string;
  postIds: string[];
  replyEnabled: boolean;
  replyVariants: string[];
  dmText: string;
  dmLink: string | null;
  status: string;
}

interface Props {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  defaults: AutomationDefaults;
  posts: PostOption[];
  submitLabel: string;
}

function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-baseline gap-2.5">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
          {n}
        </span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
        </div>
      </div>
      <div className="mt-4 pl-8.5">{children}</div>
    </section>
  );
}

export function AutomationForm({ action, defaults, posts, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);

  // Mirrored into React state purely to drive the live preview and the
  // conditional post picker; the form itself posts normally.
  const [scope, setScope] = useState(defaults.scope);
  const [replyEnabled, setReplyEnabled] = useState(defaults.replyEnabled);
  const [dmText, setDmText] = useState(defaults.dmText);
  const [dmLink, setDmLink] = useState(defaults.dmLink ?? "");
  const [keywords, setKeywords] = useState(defaults.keywords.join(", "));

  const previewDm = dmText.replace(/\{link\}/g, dmLink || "{link}");

  return (
    <form action={formAction} className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}

      <div className="space-y-4">
        <div className="rounded-xl border border-line bg-surface p-5">
          <label htmlFor="automation-name" className="text-sm font-semibold">
            Name
          </label>
          <p className="mt-0.5 text-xs text-muted">Only shown to you, in the list.</p>
          <input
            id="automation-name"
            name="name"
            defaultValue={defaults.name}
            placeholder="Link-in-bio guide"
            className="field mt-3"
          />
        </div>

        <Step n={1} title="Which posts?">
          <div className="space-y-2">
            {[
              { value: "all_posts", label: "All posts", hint: "Every post, past and future" },
              {
                value: "from_now_on",
                label: "Posts from now on",
                hint: "Only posts published after this goes live",
              },
              {
                value: "specific_posts",
                label: "Specific posts",
                hint: "Pick exactly which posts trigger it",
              },
            ].map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                  scope === option.value
                    ? "border-accent bg-accent-soft"
                    : "border-line hover:border-muted"
                }`}
              >
                <input
                  type="radio"
                  name="scope"
                  value={option.value}
                  checked={scope === option.value}
                  onChange={(e) => setScope(e.target.value)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block text-xs text-muted">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>

          {scope === "specific_posts" ? (
            posts.length === 0 ? (
              <p className="mt-4 rounded-lg bg-canvas p-3 text-xs text-muted">
                No posts cached yet. They appear after the first inbox sync runs,
                or you can trigger <code>/api/cron/sync-inbox</code> manually.
              </p>
            ) : (
              <div className="mt-4 grid max-h-72 grid-cols-3 gap-2 overflow-y-auto rounded-lg border border-line p-2 sm:grid-cols-4">
                {posts.map((post) => (
                  <label key={post.id} className="group relative cursor-pointer">
                    <input
                      type="checkbox"
                      name="postIds"
                      value={post.id}
                      defaultChecked={defaults.postIds.includes(post.id)}
                      className="peer sr-only"
                    />
                    <span className="block overflow-hidden rounded-md border-2 border-transparent peer-checked:border-accent">
                      {post.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={post.thumbnailUrl}
                          alt=""
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <span className="grid aspect-square w-full place-items-center bg-canvas p-1 text-center text-[10px] leading-tight text-muted">
                          {post.caption?.slice(0, 40) ?? "Post"}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )
          ) : null}
        </Step>

        <Step
          n={2}
          title="Which keywords?"
          hint="Comma-separated. Matched case- and emoji-insensitively."
        >
          <input
            name="keywords"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="guide, link, send"
            className="field"
          />

          <div className="mt-3 space-y-2">
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="matchMode"
                value="exact_word"
                defaultChecked={defaults.matchMode === "exact_word"}
                className="mt-1"
              />
              <span>
                Whole word
                <span className="block text-xs text-muted">
                  &ldquo;link&rdquo; will not fire on &ldquo;linkedin&rdquo;. Recommended.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="matchMode"
                value="contains"
                defaultChecked={defaults.matchMode === "contains"}
                className="mt-1"
              />
              <span>
                Anywhere in the comment
                <span className="block text-xs text-muted">
                  Catches more, including partial words.
                </span>
              </span>
            </label>
          </div>
        </Step>

        <Step
          n={3}
          title="Public comment reply"
          hint="One per line. A random line is used each time, so replies don't look automated."
        >
          <label className="mb-3 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="replyEnabled"
              checked={replyEnabled}
              onChange={(e) => setReplyEnabled(e.target.checked)}
            />
            Reply publicly to the comment
          </label>
          <textarea
            name="replyVariants"
            rows={4}
            defaultValue={defaults.replyVariants.join("\n")}
            disabled={!replyEnabled}
            placeholder={"Just sent it! 📩\nCheck your DMs 🙌\nSent — enjoy!"}
            className="field font-mono text-xs disabled:opacity-50"
          />
        </Step>

        <Step
          n={4}
          title="The DM"
          hint="Use {link} where the URL should go. You can fill the link in later."
        >
          <textarea
            name="dmText"
            rows={3}
            value={dmText}
            onChange={(e) => setDmText(e.target.value)}
            className="field"
          />
          <input
            name="dmLink"
            value={dmLink}
            onChange={(e) => setDmLink(e.target.value)}
            placeholder="https://your-link-here.com"
            className="field mt-2"
          />
          {dmText.includes("{link}") && !dmLink ? (
            <p className="mt-2 text-xs text-warn">
              You can save this as a draft, but the link is required to publish.
            </p>
          ) : null}
        </Step>

        {state.error ? (
          <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
            {state.error}
          </p>
        ) : null}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            name="intent"
            value="publish"
            disabled={pending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Saving…" : submitLabel}
          </button>
          <button
            type="submit"
            name="intent"
            value="save"
            disabled={pending}
            className="rounded-lg border border-line bg-surface px-4 py-2 text-sm transition hover:border-muted disabled:opacity-50"
          >
            Save as draft
          </button>
          {defaults.status === "live" ? (
            <button
              type="submit"
              name="intent"
              value="pause"
              disabled={pending}
              className="rounded-lg border border-line bg-surface px-4 py-2 text-sm text-muted transition hover:text-ink disabled:opacity-50"
            >
              Pause
            </button>
          ) : null}
          <Link
            href="/automations"
            className="ml-auto text-sm text-muted transition hover:text-ink"
          >
            Cancel
          </Link>
        </div>
      </div>

      {/* Live preview */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-xl border border-line bg-surface p-5">
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
            Preview
          </h3>

          <div className="mt-4">
            <p className="text-xs text-muted">Someone comments</p>
            <div className="mt-1.5 rounded-lg bg-canvas px-3 py-2 text-sm">
              {keywords.split(",")[0]?.trim() || "your keyword"}
            </div>
          </div>

          {replyEnabled ? (
            <div className="mt-4">
              <p className="text-xs text-muted">You reply publicly</p>
              <div className="mt-1.5 rounded-lg bg-canvas px-3 py-2 text-sm">
                {defaults.replyVariants[0] || "one of your replies"}
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <p className="text-xs text-muted">They get a DM</p>
            <div className="mt-1.5 rounded-2xl rounded-br-sm bg-accent px-3.5 py-2.5 text-sm break-words text-white">
              {previewDm || "your message"}
            </div>
          </div>

          <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-muted">
            Instagram allows one DM per comment, sent within 7 days. Each person
            is messaged once per comment.
          </p>
        </div>
      </aside>
    </form>
  );
}
