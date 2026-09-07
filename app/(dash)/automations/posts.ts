import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, igPost } from "@/db";
import type { PostOption } from "./automation-form";

/** Cached media for the post picker — no API call on page render. */
export async function listPosts(accountId: string): Promise<PostOption[]> {
  return db
    .select({
      id: igPost.id,
      caption: igPost.caption,
      thumbnailUrl: igPost.thumbnailUrl,
      timestamp: igPost.timestamp,
    })
    .from(igPost)
    .where(eq(igPost.accountId, accountId))
    .orderBy(desc(igPost.timestamp))
    .limit(60);
}
