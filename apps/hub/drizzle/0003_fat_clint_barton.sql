ALTER TABLE "print_jobs" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD COLUMN "fallback_used" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "print_jobs_status_next_attempt_idx" ON "print_jobs" USING btree ("status","next_attempt_at");