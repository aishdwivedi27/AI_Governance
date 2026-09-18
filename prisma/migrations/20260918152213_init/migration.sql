-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "systemName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "evidenceStrength" DOUBLE PRECISION NOT NULL,
    "violations" JSONB NOT NULL,
    "highRiskMatches" JSONB NOT NULL,
    "applicableArticles" TEXT[],
    "obligations" TEXT[],
    "riskScore" DOUBLE PRECISION,
    "reasoning" TEXT NOT NULL,
    "rulesVersion" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdByUserId" TEXT,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isSeedUser" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QaSession" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "answers" JSONB NOT NULL,
    "currentStep" TEXT NOT NULL,
    "llmExchange" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QaSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "obligationArticle" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requiredArtifact" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "owner" TEXT,
    "evidenceLink" TEXT,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assessment_timestamp_idx" ON "Assessment"("timestamp");

-- CreateIndex
CREATE INDEX "Assessment_classification_idx" ON "Assessment"("classification");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "ChecklistItem_assessmentId_idx" ON "ChecklistItem"("assessmentId");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
