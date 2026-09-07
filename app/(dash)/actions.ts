"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { automation, db } from "@/db";
import { getSession } from "@/lib/session";

const formSchema = z.object({
  name: z.string().trim().min(1, "Give the automation a name."),
  keywords: z
    .string()
    .transform((s) => s.split(",").map((k) => k.trim()).filter(Boolean))
    .pipe(z.array(z.string()).min(1, "Add at least one keyword.")),
  matchMode: z.enum(["exact_word", "contains"]),
  scope: z.enum(["all_posts", "specific_posts", "from_now_on"]),
  postIds: z.array(z.string()).default([]),
  replyEnabled: z.boolean(),
  replyVariants: z
    .string()
    .transform((s) => s.split("\n").map((v) => v.trim()).filter(Boolean)),
  dmText: z.string().trim().min(1, "The DM cannot be empty."),
  dmLink: z.string().trim(),
});

export interface ActionState {
  error?: string;
}

async function requireAccountId(): Promise<string> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.accountId;
}

function parse(formData: FormData) {
  return formSchema.safeParse({
    name: formData.get("name") ?? "",
    keywords: formData.get("keywords") ?? "",
    matchMode: formData.get("matchMode") ?? "exact_word",
    scope: formData.get("scope") ?? "all_posts",
    postIds: formData.getAll("postIds").map(String),
    replyEnabled: formData.get("replyEnabled") === "on",
    replyVariants: formData.get("replyVariants") ?? "",
    dmText: formData.get("dmText") ?? "",
    dmLink: formData.get("dmLink") ?? "",
  });
}

/**
 * A live automation must be able to actually do something. Catching this
 * here is what prevents the silent failure mode of publishing a rule that
 * DMs people an empty link.
 */
function validateForPublish(
  data: z.infer<typeof formSchema>,
  publish: boolean,
): string | null {
  if (!publish) return null;
  if (data.dmText.includes("{link}") && !data.dmLink) {
    return "Add the link before publishing — the DM contains {link} but no URL is set.";
  }
  if (data.replyEnabled && data.replyVariants.length === 0) {
    return "Add at least one comment reply, or turn off public replies.";
  }
  if (data.scope === "specific_posts" && data.postIds.length === 0) {
    return "Select at least one post, or change the scope to all posts.";
  }
  return null;
}

export async function createAutomation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const accountId = await requireAccountId();
  const parsed = parse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form." };
  }

  const publish = formData.get("intent") === "publish";
  const problem = validateForPublish(parsed.data, publish);
  if (problem) return { error: problem };

  const [row] = await db
    .insert(automation)
    .values({
      accountId,
      ...parsed.data,
      dmLink: parsed.data.dmLink || null,
      status: publish ? "live" : "draft",
      // `from_now_on` means "from the moment it went live", so the cutoff is
      // stamped at publish time rather than at creation.
      appliesFrom:
        parsed.data.scope === "from_now_on" && publish ? new Date() : null,
    })
    .returning({ id: automation.id });

  revalidatePath("/automations");
  redirect(`/automations/${row.id}`);
}

export async function updateAutomation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const accountId = await requireAccountId();
  const id = String(formData.get("id") ?? "");
  const parsed = parse(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form." };
  }

  const intent = formData.get("intent");
  const publish = intent === "publish";
  const problem = validateForPublish(parsed.data, publish);
  if (problem) return { error: problem };

  const [existing] = await db
    .select()
    .from(automation)
    .where(and(eq(automation.id, id), eq(automation.accountId, accountId)))
    .limit(1);
  if (!existing) return { error: "Automation not found." };

  const status = publish ? "live" : intent === "pause" ? "paused" : existing.status;

  await db
    .update(automation)
    .set({
      ...parsed.data,
      dmLink: parsed.data.dmLink || null,
      status,
      // Only stamp the cutoff the first time it goes live, so editing a
      // running automation doesn't silently move its window forward.
      appliesFrom:
        parsed.data.scope === "from_now_on"
          ? (existing.appliesFrom ?? (publish ? new Date() : null))
          : null,
      updatedAt: new Date(),
    })
    .where(eq(automation.id, id));

  revalidatePath("/automations");
  revalidatePath(`/automations/${id}`);
  return {};
}

export async function setStatus(id: string, status: "live" | "paused") {
  const accountId = await requireAccountId();

  const [existing] = await db
    .select()
    .from(automation)
    .where(and(eq(automation.id, id), eq(automation.accountId, accountId)))
    .limit(1);
  if (!existing) return;

  await db
    .update(automation)
    .set({
      status,
      appliesFrom:
        existing.scope === "from_now_on" && status === "live"
          ? (existing.appliesFrom ?? new Date())
          : existing.appliesFrom,
      updatedAt: new Date(),
    })
    .where(eq(automation.id, id));

  revalidatePath("/automations");
  revalidatePath(`/automations/${id}`);
}

export async function deleteAutomation(id: string) {
  const accountId = await requireAccountId();
  await db
    .delete(automation)
    .where(and(eq(automation.id, id), eq(automation.accountId, accountId)));
  revalidatePath("/automations");
  redirect("/automations");
}
