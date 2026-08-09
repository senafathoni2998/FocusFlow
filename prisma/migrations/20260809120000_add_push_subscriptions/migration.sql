-- One browser that has agreed to receive reminders while it is closed.
-- Per browser rather than per user: a laptop and a desktop are two rows and
-- both should ring.
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccessAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- Globally unique: a browser hands back the SAME endpoint until the user clears
-- site data, so re-subscribing has to be an upsert rather than a second row that
-- would make every reminder arrive twice.
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
