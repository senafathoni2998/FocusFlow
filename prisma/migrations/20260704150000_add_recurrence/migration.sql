-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "recurrenceId" TEXT;
-- CreateTable
CREATE TABLE "RecurrenceRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "freq" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "byWeekday" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "anchorMode" TEXT NOT NULL DEFAULT 'due',
    "until" TIMESTAMP(3),
    "count" INTEGER,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecurrenceRule_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "RecurrenceRule_userId_idx" ON "RecurrenceRule"("userId");
-- CreateIndex
CREATE UNIQUE INDEX "Task_recurrenceId_key" ON "Task"("recurrenceId");
-- AddForeignKey
ALTER TABLE "RecurrenceRule" ADD CONSTRAINT "RecurrenceRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "RecurrenceRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
