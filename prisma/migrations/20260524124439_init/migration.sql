-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('RETAINERSHIP', 'OUT_OF_RETAINERSHIP', 'INTERNAL');

-- CreateEnum
CREATE TYPE "EntrySource" AS ENUM ('MANUAL', 'WHATSAPP_BOT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "hoursTarget" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "overtimeThreshold" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reminderTime" TEXT NOT NULL DEFAULT '18:00',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hasRetainership" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "billingType" "BillingType" NOT NULL DEFAULT 'INTERNAL',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "whatsappNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskEntry" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "projectId" TEXT,
    "taskDescription" TEXT NOT NULL,
    "isMeeting" BOOLEAN NOT NULL DEFAULT false,
    "personCount" INTEGER,
    "meetingDuration" DOUBLE PRECISION,
    "billingOverride" "BillingType",
    "deletedAt" TIMESTAMP(3),
    "source" "EntrySource" NOT NULL DEFAULT 'MANUAL',
    "submittedByPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskHour" (
    "id" TEXT NOT NULL,
    "taskEntryId" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "TaskHour_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Client_name_key" ON "Client"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Project_name_clientId_key" ON "Project"("name", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_whatsappNumber_key" ON "TeamMember"("whatsappNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TaskHour_taskEntryId_teamMemberId_key" ON "TaskHour"("taskEntryId", "teamMemberId");

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskEntry" ADD CONSTRAINT "TaskEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskHour" ADD CONSTRAINT "TaskHour_taskEntryId_fkey" FOREIGN KEY ("taskEntryId") REFERENCES "TaskEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskHour" ADD CONSTRAINT "TaskHour_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
