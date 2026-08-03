-- Delta-sync foundation.
--
-- `updatedAt` on the three user-owned models that lacked it: without one, a
-- client cannot tell that a row changed, so no incremental sync is possible.
-- Backfilled with now() rather than a fixed epoch, so the first sync after this
-- migration does not hand every client the entire table as "changed".
ALTER TABLE "Reminder"     ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "HabitCheckIn" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "FocusSession" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Deletions a client needs to learn about.
--
-- Deliberately NOT a `deletedAt` column on every model: that would require every
-- one of ~50 queries to filter it, and a single omission would serve deleted
-- rows with no symptom. Here rows are really deleted and existing queries are
-- untouched, so that class of bug cannot occur.
CREATE TABLE "Tombstone" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tombstone_pkey" PRIMARY KEY ("id")
);

-- The only query shape: "this user's tombstones since <cursor>".
CREATE INDEX "Tombstone_userId_deletedAt_idx" ON "Tombstone"("userId", "deletedAt");

-- Re-creating an id that was previously deleted must refresh the tombstone
-- rather than accumulate duplicates.
CREATE UNIQUE INDEX "Tombstone_userId_entityType_entityId_key"
    ON "Tombstone"("userId", "entityType", "entityId");

ALTER TABLE "Tombstone" ADD CONSTRAINT "Tombstone_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
