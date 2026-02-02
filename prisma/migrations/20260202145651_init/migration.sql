/*
  Warnings:

  - You are about to drop the column `notes` on the `Task` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Task" DROP COLUMN "notes",
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;
