-- Create enums
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'DRIVER', 'ADMIN');
CREATE TYPE "VehicleType" AS ENUM ('THREE_WHEELER', 'MINI_TRUCK', 'TRUCK');
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "AvailabilityStatus" AS ENUM ('OFFLINE', 'ONLINE', 'BUSY');
CREATE TYPE "OrderStatus" AS ENUM ('CREATED', 'MATCHING', 'ASSIGNED', 'AT_PICKUP', 'LOADING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');
CREATE TYPE "InsurancePlan" AS ENUM ('NONE', 'BASIC', 'PREMIUM', 'HIGH_VALUE');
CREATE TYPE "TripStatus" AS ENUM ('ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED_PICKUP', 'LOADING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED');
CREATE TYPE "PaymentProvider" AS ENUM ('RAZORPAY', 'STRIPE', 'UPI', 'WALLET');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED');

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL UNIQUE,
  "email" TEXT UNIQUE,
  "passwordHash" TEXT,
  "role" "UserRole" NOT NULL,
  "rating" DOUBLE PRECISION NOT NULL DEFAULT 5,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "DriverProfile" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "vehicleType" "VehicleType" NOT NULL,
  "vehicleNumber" TEXT NOT NULL UNIQUE,
  "licenseNumber" TEXT NOT NULL UNIQUE,
  "aadhaarNumber" TEXT,
  "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
  "availabilityStatus" "AvailabilityStatus" NOT NULL DEFAULT 'OFFLINE',
  "currentLat" DOUBLE PRECISION,
  "currentLng" DOUBLE PRECISION,
  "lastActiveAt" TIMESTAMP(3),
  "idleSince" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DriverProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Vehicle" (
  "id" TEXT PRIMARY KEY,
  "driverProfileId" TEXT NOT NULL,
  "type" "VehicleType" NOT NULL,
  "capacityKg" INTEGER NOT NULL,
  "insuranceStatus" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Vehicle_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Order" (
  "id" TEXT PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "pickupAddress" TEXT NOT NULL,
  "pickupLat" DOUBLE PRECISION NOT NULL,
  "pickupLng" DOUBLE PRECISION NOT NULL,
  "dropAddress" TEXT NOT NULL,
  "dropLat" DOUBLE PRECISION NOT NULL,
  "dropLng" DOUBLE PRECISION NOT NULL,
  "scheduledAt" TIMESTAMP(3),
  "vehicleType" "VehicleType" NOT NULL,
  "goodsDescription" TEXT NOT NULL,
  "goodsType" TEXT,
  "goodsValue" DECIMAL(12,2) NOT NULL,
  "insuranceSelected" "InsurancePlan" NOT NULL DEFAULT 'NONE',
  "insurancePremium" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "gstin" TEXT,
  "invoiceValue" DECIMAL(12,2),
  "hsnCode" TEXT,
  "ewayBillNumber" TEXT,
  "status" "OrderStatus" NOT NULL DEFAULT 'CREATED',
  "estimatedPrice" DECIMAL(10,2) NOT NULL,
  "finalPrice" DECIMAL(10,2),
  "waitingCharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Trip" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL UNIQUE,
  "driverId" TEXT NOT NULL,
  "queuedDriverId" TEXT,
  "status" "TripStatus" NOT NULL DEFAULT 'ASSIGNED',
  "etaMinutes" INTEGER,
  "pickupTime" TIMESTAMP(3),
  "loadingStart" TIMESTAMP(3),
  "loadingEnd" TIMESTAMP(3),
  "deliveryTime" TIMESTAMP(3),
  "distanceKm" DOUBLE PRECISION,
  "durationMinutes" INTEGER,
  "waitingCharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Trip_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DriverProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Trip_queuedDriverId_fkey" FOREIGN KEY ("queuedDriverId") REFERENCES "DriverProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Rating" (
  "id" TEXT PRIMARY KEY,
  "tripId" TEXT NOT NULL UNIQUE,
  "driverRating" DOUBLE PRECISION NOT NULL,
  "customerRating" DOUBLE PRECISION,
  "review" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Rating_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PricingRule" (
  "id" TEXT PRIMARY KEY,
  "minDriverRating" DOUBLE PRECISION NOT NULL,
  "maxDriverRating" DOUBLE PRECISION NOT NULL,
  "multiplier" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "Payment" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL UNIQUE,
  "provider" "PaymentProvider" NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "providerRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
