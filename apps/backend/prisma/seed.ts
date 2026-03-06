import {
  PrismaClient,
  UserRole,
  VehicleType,
  VerificationStatus,
  AvailabilityStatus,
  OrderStatus
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const customer = await prisma.user.upsert({
    where: { phone: '+919999999001' },
    update: {},
    create: {
      name: 'Acme Logistics Customer',
      phone: '+919999999001',
      email: 'customer@porter.local',
      role: UserRole.CUSTOMER,
      rating: 4.9
    }
  });

  const admin = await prisma.user.upsert({
    where: { phone: '+919999999002' },
    update: {},
    create: {
      name: 'Ops Admin',
      phone: '+919999999002',
      email: 'admin@porter.local',
      role: UserRole.ADMIN,
      rating: 5
    }
  });

  void admin;

  const driverUsers = await Promise.all(
    [
      { idx: 1, name: 'Ravi Kumar', rating: 4.9, vehicleType: VehicleType.MINI_TRUCK },
      { idx: 2, name: 'Sanjay Patel', rating: 4.6, vehicleType: VehicleType.THREE_WHEELER },
      { idx: 3, name: 'Imran Khan', rating: 4.2, vehicleType: VehicleType.TRUCK }
    ].map((driver) =>
      prisma.user.upsert({
        where: { phone: `+91999999910${driver.idx}` },
        update: { rating: driver.rating },
        create: {
          name: driver.name,
          phone: `+91999999910${driver.idx}`,
          email: `driver${driver.idx}@porter.local`,
          role: UserRole.DRIVER,
          rating: driver.rating
        }
      })
    )
  );

  await Promise.all(
    driverUsers.map((user, idx) =>
      prisma.driverProfile.upsert({
        where: { userId: user.id },
        update: {
          verificationStatus: VerificationStatus.APPROVED,
          availabilityStatus: AvailabilityStatus.ONLINE,
          idleSince: new Date(Date.now() - (idx + 1) * 60 * 60 * 1000),
          currentLat: 12.9716 + idx * 0.01,
          currentLng: 77.5946 + idx * 0.01
        },
        create: {
          userId: user.id,
          vehicleType: [VehicleType.MINI_TRUCK, VehicleType.THREE_WHEELER, VehicleType.TRUCK][idx],
          vehicleNumber: `KA01AB10${idx + 1}`,
          licenseNumber: `DL${idx + 1}234567890`,
          verificationStatus: VerificationStatus.APPROVED,
          availabilityStatus: AvailabilityStatus.ONLINE,
          idleSince: new Date(Date.now() - (idx + 1) * 60 * 60 * 1000),
          currentLat: 12.9716 + idx * 0.01,
          currentLng: 77.5946 + idx * 0.01,
          vehicles: {
            create: {
              type: [VehicleType.MINI_TRUCK, VehicleType.THREE_WHEELER, VehicleType.TRUCK][idx],
              capacityKg: [1500, 600, 9000][idx],
              insuranceStatus: 'ACTIVE'
            }
          }
        }
      })
    )
  );

  await prisma.order.create({
    data: {
      customerId: customer.id,
      pickupAddress: 'Koramangala, Bengaluru',
      pickupLat: 12.9352,
      pickupLng: 77.6245,
      dropAddress: 'Whitefield, Bengaluru',
      dropLat: 12.9698,
      dropLng: 77.7499,
      vehicleType: VehicleType.MINI_TRUCK,
      goodsDescription: 'Furniture packages',
      goodsType: 'Household',
      goodsValue: 45000,
      estimatedPrice: 920,
      status: OrderStatus.MATCHING
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
