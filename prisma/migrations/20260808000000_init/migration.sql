-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'GENERATING', 'REVIEW', 'APPROVED', 'REJECTED', 'SCHEDULED', 'PROCESSING', 'PUBLISHED', 'FAILED', 'CANCELLED');
CREATE TYPE "Platform" AS ENUM ('FACEBOOK', 'INSTAGRAM');
CREATE TYPE "PostType" AS ENUM ('POSTER', 'CAROUSEL');
CREATE TYPE "ContentFormat" AS ENUM ('PORTRAIT', 'SQUARE', 'STORY');
CREATE TYPE "TemplateStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'INVALID');
CREATE TYPE "PublicationStatus" AS ENUM ('SCHEDULED', 'PROCESSING', 'PUBLISHED', 'FAILED', 'CANCELLED');
CREATE TYPE "JobLogStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateTable Brand
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "defaultLanguage" TEXT NOT NULL DEFAULT 'fr',
    "availableLanguages" TEXT[],
    "primaryColor" TEXT NOT NULL,
    "secondaryColor" TEXT NOT NULL,
    "accentColor" TEXT NOT NULL,
    "logoUrl" TEXT NOT NULL,
    "toneOfVoice" TEXT NOT NULL,
    "targetAudience" TEXT NOT NULL,
    "preferredCTAs" TEXT[],
    "forbiddenWords" TEXT[],
    "requiredTerms" TEXT[],
    "defaultHashtags" TEXT[],
    "visualGuidelines" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Brand_slug_key" ON "Brand"("slug");

CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PostType" NOT NULL,
    "format" "ContentFormat" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "TemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourcePath" TEXT NOT NULL,
    "configPath" TEXT NOT NULL,
    "previewPath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Template_brandId_sourcePath_version_key" ON "Template"("brandId", "sourcePath", "version");

CREATE TABLE "ContentDraft" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "type" "PostType" NOT NULL,
    "topic" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "generatedContent" JSONB,
    "qualityReport" JSONB,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT,
    "pipelineState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentDraft_idempotencyKey_key" ON "ContentDraft"("idempotencyKey");

CREATE TABLE "ContentSlide" (
    "id" TEXT NOT NULL,
    "contentDraftId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "headline" TEXT,
    "body" TEXT,
    "imageDescription" TEXT,
    "altText" TEXT,
    "renderedAssetUrl" TEXT,
    CONSTRAINT "ContentSlide_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentSlide_contentDraftId_position_key" ON "ContentSlide"("contentDraftId", "position");

CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "contentDraftId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "externalPostId" TEXT,
    "externalPostUrl" TEXT,
    "status" "PublicationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "lastError" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Publication_idempotencyKey_key" ON "Publication"("idempotencyKey");

CREATE TABLE "JobLog" (
    "id" TEXT NOT NULL,
    "contentDraftId" TEXT,
    "publicationId" TEXT,
    "provider" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" "JobLogStatus" NOT NULL,
    "requestSummary" JSONB,
    "responseSummary" JSONB,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Template" ADD CONSTRAINT "Template_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentDraft" ADD CONSTRAINT "ContentDraft_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentDraft" ADD CONSTRAINT "ContentDraft_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentSlide" ADD CONSTRAINT "ContentSlide_contentDraftId_fkey" FOREIGN KEY ("contentDraftId") REFERENCES "ContentDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_contentDraftId_fkey" FOREIGN KEY ("contentDraftId") REFERENCES "ContentDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobLog" ADD CONSTRAINT "JobLog_contentDraftId_fkey" FOREIGN KEY ("contentDraftId") REFERENCES "ContentDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobLog" ADD CONSTRAINT "JobLog_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
