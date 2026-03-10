-- CreateEnum
CREATE TYPE "DriverEnterpriseRequestStatus" AS ENUM ('PENDING', 'CONTACTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "DriverEnterprisePlanRequest" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" "DriverEnterpriseRequestStatus" NOT NULL DEFAULT 'PENDING',
    "contactName" TEXT,
    "contactPhone" TEXT,
    "city" TEXT,
    "fleetSize" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "DriverEnterprisePlanRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverEnterprisePlanRequest_driverId_status_createdAt_idx" ON "DriverEnterprisePlanRequest"("driverId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "DriverEnterprisePlanRequest" ADD CONSTRAINT "DriverEnterprisePlanRequest_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
