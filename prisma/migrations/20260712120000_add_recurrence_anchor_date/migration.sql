-- Preserve the original occurrence date so monthly/yearly recurrence can be
-- computed as anchorDate + interval*N (avoids day-of-month clamp compounding).
ALTER TABLE "RecurrenceRule" ADD COLUMN "anchorDate" TIMESTAMP(3);
