import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ────────────────────────────────────────────────────────────────────────
 * Account — the connected Instagram professional account.
 *
 * Single-tenant today: there is exactly one row. Every other table already
 * carries `accountId`, so going multi-tenant later is a matter of dropping
 * the "just read the first row" helper, not reshaping the schema.
 * ──────────────────────────────────────────────────────────────────────── */
export const account = pgTable("account", {
  id: uuid("id").primaryKey().defaultRandom(),
  igUserId: text("ig_user_id").notNull().unique(),
  username: text("username").notNull(),
  profilePictureUrl: text("profile_picture_url"),

  /** AES-256-GCM ciphertext. Never stored or logged in plaintext. */
  accessToken: text("access_token").notNull(),
  /** Long-lived tokens last 60 days; the daily cron refreshes well before this. */
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),

  webhookSubscribed: boolean("webhook_subscribed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ────────────────────────────────────────────────────────────────────────
 * Automation — one keyword rule: what to watch, what to reply, what to DM.
 * ──────────────────────────────────────────────────────────────────────── */
export const automation = pgTable(
  "automation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    /** draft | live | paused — only `live` automations fire. */
    status: text("status").notNull().default("draft"),

    keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
    /** exact_word | contains — see lib/automation/matcher.ts */
    matchMode: text("match_mode").notNull().default("exact_word"),

    /**
     * Which posts this applies to.
     *   all_posts      — every post on the account
     *   specific_posts — only the ids in `postIds`
     *   from_now_on    — only posts published at/after `appliesFrom`
     */
    scope: text("scope").notNull().default("all_posts"),
    postIds: jsonb("post_ids").$type<string[]>().notNull().default([]),
    appliesFrom: timestamp("applies_from", { withTimezone: true }),

    /**
     * Public comment replies. Multiple variants are picked at random:
     * posting the identical string on every comment is the fastest way to
     * get flagged as spam by Instagram.
     */
    replyVariants: jsonb("reply_variants").$type<string[]>().notNull().default([]),
    /** Set false to send the DM only, with no public reply. */
    replyEnabled: boolean("reply_enabled").notNull().default(true),

    /** DM body. `{link}` is substituted with `dmLink` at send time. */
    dmText: text("dm_text").notNull(),
    dmLink: text("dm_link"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("automation_account_status_idx").on(t.accountId, t.status)],
);

/* ────────────────────────────────────────────────────────────────────────
 * Webhook event — every raw delivery from Meta, stored before any work.
 *
 * Meta disables webhooks that respond slowly, so the receiver's only job is
 * to write this row and return 200. Processing happens after the response,
 * and this table is what makes that safe: a crash mid-processing leaves a
 * `pending` row that the cron sweeper retries.
 * ──────────────────────────────────────────────────────────────────────── */
export const webhookEvent = pgTable(
  "webhook_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** comments | messages */
    field: text("field").notNull(),
    payload: jsonb("payload").notNull(),

    /** pending | processing | done | failed | dead */
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),

    /**
     * Comment time + 7 days. Meta refuses private replies after this, so a
     * job still failing at this point is permanently dead, not retryable.
     */
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [index("webhook_event_status_idx").on(t.status, t.receivedAt)],
);

/* ────────────────────────────────────────────────────────────────────────
 * Comment event — one row per comment we acted on. Powers the Activity log.
 * ──────────────────────────────────────────────────────────────────────── */
export const commentEvent = pgTable(
  "comment_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    automationId: uuid("automation_id").references(() => automation.id, {
      onDelete: "set null",
    }),

    /**
     * UNIQUE. Meta allows exactly one private reply per comment, ever.
     * Enforcing that here means a duplicate webhook delivery cannot produce
     * a second DM even if the application logic is wrong.
     */
    commentId: text("comment_id").notNull(),
    mediaId: text("media_id"),
    commentText: text("comment_text").notNull(),
    matchedKeyword: text("matched_keyword"),

    fromIgId: text("from_ig_id"),
    fromUsername: text("from_username"),

    /** skipped | pending | sent | failed */
    replyStatus: text("reply_status").notNull().default("pending"),
    replyText: text("reply_text"),
    replyError: text("reply_error"),

    dmStatus: text("dm_status").notNull().default("pending"),
    dmError: text("dm_error"),

    commentedAt: timestamp("commented_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("comment_event_comment_id_idx").on(t.commentId),
    index("comment_event_account_created_idx").on(t.accountId, t.createdAt),
  ],
);

/* ────────────────────────────────────────────────────────────────────────
 * Cached media, so the automation builder's post picker is instant.
 * ──────────────────────────────────────────────────────────────────────── */
export const igPost = pgTable(
  "ig_post",
  {
    id: text("id").primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    caption: text("caption"),
    mediaType: text("media_type"),
    mediaUrl: text("media_url"),
    thumbnailUrl: text("thumbnail_url"),
    permalink: text("permalink"),
    timestamp: timestamp("timestamp", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ig_post_account_time_idx").on(t.accountId, t.timestamp)],
);

/* ────────────────────────────────────────────────────────────────────────
 * Inbox mirror.
 *
 * Instagram's conversations API returns only the 20 most recent messages per
 * thread — older ones come back as errors. Mirroring every `messages`
 * webhook into Postgres means history accumulates locally and is not capped.
 * ──────────────────────────────────────────────────────────────────────── */
export const conversation = pgTable(
  "conversation",
  {
    id: text("id").primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    participantIgId: text("participant_ig_id"),
    participantUsername: text("participant_username"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastMessagePreview: text("last_message_preview"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conversation_account_recent_idx").on(t.accountId, t.lastMessageAt)],
);

export const message = pgTable(
  "message",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    fromIgId: text("from_ig_id"),
    /** true when we sent it (including automated private replies). */
    isFromAccount: boolean("is_from_account").notNull().default(false),
    text: text("text"),
    /** Non-text payloads (images, shares, reels) summarised for display. */
    attachmentSummary: text("attachment_summary"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("message_conversation_time_idx").on(t.conversationId, t.sentAt)],
);
