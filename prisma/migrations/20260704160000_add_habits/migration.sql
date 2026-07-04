-- CreateTable
CREATE TABLE "Habit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '✅',
    "color" TEXT NOT NULL DEFAULT 'primary',
    "frequencyType" TEXT NOT NULL DEFAULT 'daily',
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "weeklyTarget" INTEGER NOT NULL DEFAULT 1,
    "goalType" TEXT NOT NULL DEFAULT 'achieve',
    "targetAmount" DOUBLE PRECISION DEFAULT 1,
    "unit" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Habit_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "HabitCheckIn" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HabitCheckIn_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "Habit_userId_archived_idx" ON "Habit"("userId", "archived");
-- CreateIndex
CREATE UNIQUE INDEX "HabitCheckIn_habitId_date_key" ON "HabitCheckIn"("habitId", "date");
-- AddForeignKey
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "HabitCheckIn" ADD CONSTRAINT "HabitCheckIn_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
