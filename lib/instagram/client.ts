import "server-only";
import type { IgMedia } from "./types";

const API_VERSION = "v23.0";
const BASE = `https://graph.instagram.com/${API_VERSION}`;

/**
 * An error carrying Meta's own error code, so callers can distinguish
 * "this will never work, stop retrying" from "try again later".
 */
export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly subcode?: number,
    readonly status?: number,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }

  /**
   * True when retrying is pointless: the comment was deleted, the 7-day
   * private-reply window closed, or we already replied to this comment.
   */
  get isPermanent(): boolean {
    if (this.status === 400 || this.status === 403) return true;
    // 10 = permission denied, 100 = invalid parameter, 200 = permissions error.
    return this.code === 10 || this.code === 100 || this.code === 200;
  }
}

async function call<T>(
  path: string,
  init: RequestInit & { params?: Record<string, string> } = {},
): Promise<T> {
  const { params, ...rest } = init;
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);

  const res = await fetch(url, { ...rest, cache: "no-store" });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = json?.error ?? {};
    throw new InstagramApiError(
      err.message ?? `Instagram API ${res.status} on ${path}`,
      err.code,
      err.error_subcode,
      res.status,
    );
  }
  return json as T;
}

/** Profile of the connected account. */
export function getMe(token: string) {
  return call<{ user_id: string; username: string; profile_picture_url?: string }>("/me", {
    params: {
      fields: "user_id,username,profile_picture_url",
      access_token: token,
    },
  });
}

/** Recent media, for the automation builder's post picker. */
export function getMedia(token: string, limit = 50) {
  return call<{ data: IgMedia[] }>("/me/media", {
    params: {
      fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp",
      limit: String(limit),
      access_token: token,
    },
  });
}

/**
 * Subscribes this app to the account's `comments` and `messages` webhooks.
 *
 * Done automatically at login so the Meta dashboard never has to be touched
 * again after the initial app setup.
 */
export function subscribeWebhooks(token: string) {
  return call<{ success: boolean }>("/me/subscribed_apps", {
    method: "POST",
    params: {
      subscribed_fields: "comments,messages",
      access_token: token,
    },
  });
}

/** Posts a public reply underneath a comment. */
export function replyToComment(token: string, commentId: string, message: string) {
  return call<{ id: string }>(`/${commentId}/replies`, {
    method: "POST",
    params: { message, access_token: token },
  });
}

/**
 * Sends a Private Reply: a DM to a commenter with no pre-existing
 * conversation. This is the mechanism behind "comment LINK and I'll DM you".
 *
 * Meta's hard limits: one per comment ever, and only within 7 days of the
 * comment. A second attempt on the same comment returns an error, which is
 * why `comment_event.comment_id` is UNIQUE.
 */
export function sendPrivateReply(
  token: string,
  igUserId: string,
  commentId: string,
  text: string,
) {
  return call<{ recipient_id: string; message_id: string }>(`/${igUserId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    params: { access_token: token },
    body: JSON.stringify({
      recipient: { comment_id: commentId },
      message: { text },
    }),
  });
}

interface ConversationsResponse {
  data: {
    id: string;
    updated_time?: string;
    participants?: { data: { id: string; username?: string }[] };
    messages?: {
      data: {
        id: string;
        created_time?: string;
        from?: { id: string; username?: string };
        message?: string;
      }[];
    };
  }[];
}

/**
 * Lists DM threads with their most recent messages.
 *
 * Note the hard API cap: only the 20 most recent messages per conversation
 * are retrievable — anything older errors out. The Inbox therefore mirrors
 * messages into Postgres as webhooks arrive rather than relying on this.
 */
export function getConversations(token: string, limit = 50) {
  return call<ConversationsResponse>("/me/conversations", {
    params: {
      platform: "instagram",
      fields: "id,updated_time,participants,messages{id,created_time,from,message}",
      limit: String(limit),
      access_token: token,
    },
  });
}
