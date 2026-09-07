/** Shapes of the Instagram webhook payloads we consume. */

export interface WebhookBody {
  object: string;
  entry: WebhookEntry[];
}

export interface WebhookEntry {
  id: string;
  time: number;
  /** Present for the `comments` field. */
  changes?: WebhookChange[];
  /** Present for the `messages` field. */
  messaging?: MessagingEvent[];
}

export interface WebhookChange {
  field: string;
  value: CommentValue;
}

export interface CommentValue {
  id: string;
  text: string;
  timestamp?: string;
  from?: { id: string; username?: string };
  media?: { id: string; media_product_type?: string };
  /** Set when this comment is itself a reply to another comment. */
  parent_id?: string;
}

export interface MessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    attachments?: { type: string }[];
  };
}

export interface IgMedia {
  id: string;
  caption?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
}
