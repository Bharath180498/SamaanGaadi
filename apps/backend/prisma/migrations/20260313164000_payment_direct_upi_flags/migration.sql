-- AlterTable
ALTER TABLE "Payment"
ADD COLUMN "directPayToDriver" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "directUpiVpa" TEXT,
ADD COLUMN "directUpiName" TEXT,
ADD COLUMN "driverPaymentMethodId" TEXT;
