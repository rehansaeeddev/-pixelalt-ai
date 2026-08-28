-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" DATETIME
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "defaultLanguage" TEXT NOT NULL DEFAULT 'en',
    "tone" TEXT NOT NULL DEFAULT 'professional',
    "contentCategory" TEXT NOT NULL DEFAULT 'general',
    "brandDescription" TEXT,
    "includeBrandName" BOOLEAN NOT NULL DEFAULT false,
    "targetKeywords" TEXT,
    "forbiddenWords" TEXT,
    "autoGenerateOnSync" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ShopBilling" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "planTier" TEXT NOT NULL DEFAULT 'free',
    "creditBalance" INTEGER NOT NULL DEFAULT 30,
    "creditsGrantedTotal" INTEGER NOT NULL DEFAULT 30,
    "cycleStartedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopifySubscriptionId" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "shopifyImageId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "productHandle" TEXT NOT NULL,
    "productStatus" TEXT NOT NULL,
    "productVendor" TEXT,
    "imageUrl" TEXT NOT NULL,
    "altText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'not_generated',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OtherImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "shopifyFileId" TEXT NOT NULL,
    "fileName" TEXT,
    "imageUrl" TEXT NOT NULL,
    "altText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'not_generated',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "imagesTotal" INTEGER NOT NULL DEFAULT 0,
    "imagesSucceeded" INTEGER NOT NULL DEFAULT 0,
    "imagesFailed" INTEGER NOT NULL DEFAULT 0,
    "creditsUsed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "AppSettings_shop_key" ON "AppSettings"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ShopBilling_shop_key" ON "ShopBilling"("shop");

-- CreateIndex
CREATE INDEX "ProductImage_shop_idx" ON "ProductImage"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ProductImage_shop_shopifyImageId_key" ON "ProductImage"("shop", "shopifyImageId");

-- CreateIndex
CREATE INDEX "OtherImage_shop_idx" ON "OtherImage"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "OtherImage_shop_shopifyFileId_key" ON "OtherImage"("shop", "shopifyFileId");

-- CreateIndex
CREATE INDEX "GenerationJob_shop_idx" ON "GenerationJob"("shop");
