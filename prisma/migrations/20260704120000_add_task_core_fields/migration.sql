-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "estimatedPomos" INTEGER,
ADD COLUMN     "isAllDay" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "parentTaskId" TEXT,
ADD COLUMN     "priorityRank" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "timeEstimateMin" INTEGER;

-- Backfill priorityRank from existing priority values (new column defaulted to 2 = medium).
UPDATE "Task" SET "priorityRank" = CASE "priority"
    WHEN 'high' THEN 3
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 1
    WHEN 'none' THEN 0
    ELSE 2
END;

-- CreateIndex
CREATE INDEX "Task_userId_dueDate_idx" ON "Task"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "Task_userId_status_dueDate_idx" ON "Task"("userId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Task_userId_priorityRank_idx" ON "Task"("userId", "priorityRank");

-- CreateIndex
CREATE INDEX "Task_parentTaskId_idx" ON "Task"("parentTaskId");

-- CreateIndex
CREATE INDEX "FocusSession_userId_startTime_idx" ON "FocusSession"("userId", "startTime");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
