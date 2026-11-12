-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "reminderMinutes" INTEGER,
ADD COLUMN     "remindedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Task_remindedAt_dueDate_idx" ON "Task"("remindedAt", "dueDate");
