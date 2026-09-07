import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createAutomation } from "../../actions";
import { AutomationForm } from "../automation-form";
import { listPosts } from "../posts";

export const dynamic = "force-dynamic";

export default async function NewAutomationPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const posts = await listPosts(session.accountId);

  return (
    <div>
      <h1 className="text-lg font-semibold tracking-tight">New automation</h1>
      <p className="mt-0.5 mb-6 text-sm text-muted">
        Pick posts, set keywords, write the messages, publish.
      </p>

      <AutomationForm
        action={createAutomation}
        posts={posts}
        submitLabel="Publish"
        defaults={{
          name: "Lesschat",
          keywords: [],
          matchMode: "exact_word",
          scope: "all_posts",
          postIds: [],
          replyEnabled: true,
          replyVariants: ["Just sent it! 📩", "Check your DMs 🙌", "Sent — enjoy!"],
          dmText:
            "Hey! Thanks for commenting! You can find the guides here: {link}",
          dmLink: "",
          status: "draft",
        }}
      />
    </div>
  );
}
