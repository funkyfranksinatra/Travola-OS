-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "pin" TEXT;

-- CreateTable
CREATE TABLE "ServiceEvent" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "partyKey" TEXT,
    "tableIds" TEXT[],
    "serverId" TEXT,
    "checkId" TEXT,
    "serviceDate" DATE NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TableSession" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "partyKey" TEXT,
    "partyName" TEXT,
    "tableIds" TEXT[],
    "primaryTableId" TEXT NOT NULL,
    "serverId" TEXT,
    "guestCount" INTEGER,
    "seatedAt" TIMESTAMP(3) NOT NULL,
    "firstOrderAt" TIMESTAMP(3),
    "lastFireAt" TIMESTAMP(3),
    "lastBumpAt" TIMESTAMP(3),
    "checkPaidAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "turnMinutes" INTEGER,
    "paidToClearMinutes" INTEGER,
    "checkId" TEXT,
    "subtotalCents" INTEGER,
    "totalCents" INTEGER,
    "tipCents" INTEGER,
    "ppaCents" INTEGER,
    "courseTimings" JSONB,
    "moves" JSONB,
    "origin" TEXT NOT NULL DEFAULT 'floor',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TableSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "station" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "ephemeral" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "description" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModifierGroup" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ModifierGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Modifier" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Modifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Check" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "partyKey" TEXT,
    "tableLabel" TEXT NOT NULL,
    "tableId" TEXT,
    "serverId" TEXT,
    "serverName" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "tipCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "guestCount" INTEGER NOT NULL DEFAULT 1,
    "currentCourse" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckItem" (
    "id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "seat" INTEGER,
    "course" INTEGER NOT NULL DEFAULT 1,
    "modifiers" JSONB NOT NULL,
    "station" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'held',
    "note" TEXT NOT NULL DEFAULT '',
    "firedAt" TIMESTAMP(3),
    "bumpedAt" TIMESTAMP(3),
    "voidReason" TEXT,

    CONSTRAINT "CheckItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "tipCents" INTEGER NOT NULL DEFAULT 0,
    "stripePaymentIntentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'captured',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddOn" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "menuItemId" TEXT,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "ephemeral" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AddOn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'kds',
    "printerToken" TEXT,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosSettings" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "taxRateBps" INTEGER NOT NULL DEFAULT 840,
    "tipPresets" JSONB NOT NULL DEFAULT '[18, 20, 25]',
    "receiptFooter" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "PosSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_MenuItemToModifierGroup" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MenuItemToModifierGroup_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceEvent_seq_key" ON "ServiceEvent"("seq");

-- CreateIndex
CREATE INDEX "ServiceEvent_restaurantId_seq_idx" ON "ServiceEvent"("restaurantId", "seq");

-- CreateIndex
CREATE INDEX "ServiceEvent_restaurantId_serviceDate_type_idx" ON "ServiceEvent"("restaurantId", "serviceDate", "type");

-- CreateIndex
CREATE INDEX "TableSession_restaurantId_serviceDate_idx" ON "TableSession"("restaurantId", "serviceDate");

-- CreateIndex
CREATE INDEX "TableSession_restaurantId_primaryTableId_clearedAt_idx" ON "TableSession"("restaurantId", "primaryTableId", "clearedAt");

-- CreateIndex
CREATE INDEX "TableSession_restaurantId_checkId_idx" ON "TableSession"("restaurantId", "checkId");

-- CreateIndex
CREATE INDEX "MenuCategory_restaurantId_idx" ON "MenuCategory"("restaurantId");

-- CreateIndex
CREATE INDEX "MenuItem_restaurantId_categoryId_idx" ON "MenuItem"("restaurantId", "categoryId");

-- CreateIndex
CREATE INDEX "ModifierGroup_restaurantId_idx" ON "ModifierGroup"("restaurantId");

-- CreateIndex
CREATE INDEX "Check_restaurantId_status_idx" ON "Check"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "Check_restaurantId_openedAt_idx" ON "Check"("restaurantId", "openedAt");

-- CreateIndex
CREATE INDEX "Check_restaurantId_tableId_status_idx" ON "Check"("restaurantId", "tableId", "status");

-- CreateIndex
CREATE INDEX "CheckItem_checkId_idx" ON "CheckItem"("checkId");

-- CreateIndex
CREATE INDEX "CheckItem_station_state_idx" ON "CheckItem"("station", "state");

-- CreateIndex
CREATE INDEX "Payment_restaurantId_createdAt_idx" ON "Payment"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "AddOn_restaurantId_menuItemId_idx" ON "AddOn"("restaurantId", "menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Station_printerToken_key" ON "Station"("printerToken");

-- CreateIndex
CREATE UNIQUE INDEX "Station_restaurantId_key_key" ON "Station"("restaurantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "PosSettings_restaurantId_key" ON "PosSettings"("restaurantId");

-- CreateIndex
CREATE INDEX "_MenuItemToModifierGroup_B_index" ON "_MenuItemToModifierGroup"("B");

-- CreateIndex
CREATE UNIQUE INDEX "Server_restaurantId_pin_key" ON "Server"("restaurantId", "pin");

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Modifier" ADD CONSTRAINT "Modifier_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ModifierGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckItem" ADD CONSTRAINT "CheckItem_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "Check"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "Check"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MenuItemToModifierGroup" ADD CONSTRAINT "_MenuItemToModifierGroup_A_fkey" FOREIGN KEY ("A") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MenuItemToModifierGroup" ADD CONSTRAINT "_MenuItemToModifierGroup_B_fkey" FOREIGN KEY ("B") REFERENCES "ModifierGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

