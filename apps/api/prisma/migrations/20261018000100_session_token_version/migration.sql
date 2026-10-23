ALTER TABLE "user_sessions"
  ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "user_sessions"
  ADD CONSTRAINT "user_sessions_token_version_positive"
  CHECK ("token_version" >= 1);
