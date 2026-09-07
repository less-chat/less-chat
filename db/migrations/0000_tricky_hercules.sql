CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ig_user_id" text NOT NULL,
	"username" text NOT NULL,
	"profile_picture_url" text,
	"access_token" text NOT NULL,
	"token_expires_at" timestamp with time zone NOT NULL,
	"webhook_subscribed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_ig_user_id_unique" UNIQUE("ig_user_id")
);
--> statement-breakpoint
CREATE TABLE "automation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"match_mode" text DEFAULT 'exact_word' NOT NULL,
	"scope" text DEFAULT 'all_posts' NOT NULL,
	"post_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"applies_from" timestamp with time zone,
	"reply_variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reply_enabled" boolean DEFAULT true NOT NULL,
	"dm_text" text NOT NULL,
	"dm_link" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"automation_id" uuid,
	"comment_id" text NOT NULL,
	"media_id" text,
	"comment_text" text NOT NULL,
	"matched_keyword" text,
	"from_ig_id" text,
	"from_username" text,
	"reply_status" text DEFAULT 'pending' NOT NULL,
	"reply_text" text,
	"reply_error" text,
	"dm_status" text DEFAULT 'pending' NOT NULL,
	"dm_error" text,
	"commented_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"participant_ig_id" text,
	"participant_username" text,
	"last_message_at" timestamp with time zone,
	"last_message_preview" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ig_post" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"caption" text,
	"media_type" text,
	"media_url" text,
	"thumbnail_url" text,
	"permalink" text,
	"timestamp" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"from_ig_id" text,
	"is_from_account" boolean DEFAULT false NOT NULL,
	"text" text,
	"attachment_summary" text,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"field" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"expires_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "automation" ADD CONSTRAINT "automation_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_event" ADD CONSTRAINT "comment_event_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_event" ADD CONSTRAINT "comment_event_automation_id_automation_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ig_post" ADD CONSTRAINT "ig_post_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_account_status_idx" ON "automation" USING btree ("account_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "comment_event_comment_id_idx" ON "comment_event" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "comment_event_account_created_idx" ON "comment_event" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "conversation_account_recent_idx" ON "conversation" USING btree ("account_id","last_message_at");--> statement-breakpoint
CREATE INDEX "ig_post_account_time_idx" ON "ig_post" USING btree ("account_id","timestamp");--> statement-breakpoint
CREATE INDEX "message_conversation_time_idx" ON "message" USING btree ("conversation_id","sent_at");--> statement-breakpoint
CREATE INDEX "webhook_event_status_idx" ON "webhook_event" USING btree ("status","received_at");