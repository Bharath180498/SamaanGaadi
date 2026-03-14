import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AvailabilityStatus,
  InsurancePlan,
  KycVerificationStatus,
  OrderStatus,
  Prisma,
  SupportTicketStatus,
  TripStatus,
  VerificationStatus
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { KycService } from '../kyc/kyc.service';
import { AdminOperationsBookingsQueryDto } from './dto/admin-operations-bookings-query.dto';
import { AdminOperationsRidesQueryDto } from './dto/admin-operations-rides-query.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kycService: KycService
  ) {}

  private readonly activeOrderStatuses: OrderStatus[] = [
    OrderStatus.CREATED,
    OrderStatus.MATCHING,
    OrderStatus.ASSIGNED,
    OrderStatus.AT_PICKUP,
    OrderStatus.LOADING,
    OrderStatus.IN_TRANSIT
  ];

  private readonly activeRideStatuses: TripStatus[] = [
    TripStatus.ASSIGNED,
    TripStatus.DRIVER_EN_ROUTE,
    TripStatus.ARRIVED_PICKUP,
    TripStatus.LOADING,
    TripStatus.IN_TRANSIT
  ];

  async overview() {
    const [onlineDrivers, busyDrivers, pendingDrivers, tripsToday, activeOrders, completedOrders, revenue] =
      await Promise.all([
        this.prisma.driverProfile.count({ where: { availabilityStatus: AvailabilityStatus.ONLINE } }),
        this.prisma.driverProfile.count({ where: { availabilityStatus: AvailabilityStatus.BUSY } }),
        this.prisma.driverProfile.count({ where: { verificationStatus: VerificationStatus.PENDING } }),
        this.prisma.trip.count({
          where: {
            createdAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0))
            }
          }
        }),
        this.prisma.order.count({
          where: {
            status: {
              in: [OrderStatus.MATCHING, OrderStatus.ASSIGNED, OrderStatus.AT_PICKUP, OrderStatus.LOADING, OrderStatus.IN_TRANSIT]
            }
          }
        }),
        this.prisma.order.count({
          where: {
            status: OrderStatus.DELIVERED
          }
        }),
        this.prisma.order.aggregate({
          _sum: {
            finalPrice: true
          },
          where: {
            status: OrderStatus.DELIVERED
          }
        })
      ]);

    return {
      fleet: {
        onlineDrivers,
        busyDrivers,
        pendingApprovals: pendingDrivers
      },
      demand: {
        tripsToday,
        activeOrders,
        completedOrders
      },
      economics: {
        deliveredGrossRevenue: Number(revenue._sum.finalPrice ?? 0)
      }
    };
  }

  async tripAnalytics() {
    const trips = await this.prisma.trip.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      },
      include: {
        order: true
      },
      orderBy: { createdAt: 'asc' }
    });

    const bucket = new Map<string, { assignments: number; completed: number; avgEtaAccumulator: number; etaCount: number }>();

    for (const trip of trips) {
      const day = trip.createdAt.toISOString().slice(0, 10);
      const current = bucket.get(day) ?? {
        assignments: 0,
        completed: 0,
        avgEtaAccumulator: 0,
        etaCount: 0
      };

      current.assignments += 1;
      if (trip.status === TripStatus.COMPLETED) {
        current.completed += 1;
      }
      if (trip.etaMinutes) {
        current.avgEtaAccumulator += trip.etaMinutes;
        current.etaCount += 1;
      }

      bucket.set(day, current);
    }

    const series = [...bucket.entries()].map(([day, value]) => ({
      day,
      assignments: value.assignments,
      completed: value.completed,
      completionRate: value.assignments > 0 ? Number((value.completed / value.assignments).toFixed(2)) : 0,
      avgEtaMinutes:
        value.etaCount > 0 ? Number((value.avgEtaAccumulator / value.etaCount).toFixed(1)) : null
    }));

    return {
      window: '7d',
      series
    };
  }

  async demandHeatmap() {
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
        }
      },
      select: {
        pickupLat: true,
        pickupLng: true,
        vehicleType: true
      }
    });

    const grid = new Map<string, { lat: number; lng: number; demand: number; vehicleMix: Record<string, number> }>();

    for (const order of orders) {
      const latBucket = Number(order.pickupLat.toFixed(2));
      const lngBucket = Number(order.pickupLng.toFixed(2));
      const key = `${latBucket}:${lngBucket}`;

      const cell =
        grid.get(key) ?? {
          lat: latBucket,
          lng: lngBucket,
          demand: 0,
          vehicleMix: {}
        };

      cell.demand += 1;
      cell.vehicleMix[order.vehicleType] = (cell.vehicleMix[order.vehicleType] ?? 0) + 1;

      grid.set(key, cell);
    }

    return {
      window: '72h',
      cells: [...grid.values()].sort((a, b) => b.demand - a.demand)
    };
  }

  async fraudAlerts() {
    const trips = await this.prisma.trip.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
        }
      },
      include: {
        order: true,
        driver: {
          include: {
            user: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 100
    });

    const alerts = trips
      .map((trip) => {
        const riskSignals: string[] = [];

        if (Number(trip.waitingCharge) > 120) {
          riskSignals.push('High waiting charge');
        }

        if (trip.distanceKm && trip.durationMinutes) {
          const avgSpeed = trip.distanceKm / (trip.durationMinutes / 60);
          if (avgSpeed > 65) {
            riskSignals.push('Potential route anomaly');
          }
        }

        if (trip.driver.user.rating < 4) {
          riskSignals.push('Low driver rating');
        }

        if (riskSignals.length === 0) {
          return null;
        }

        return {
          tripId: trip.id,
          orderId: trip.orderId,
          driverId: trip.driverId,
          driverName: trip.driver.user.name,
          createdAt: trip.createdAt,
          riskSignals,
          severity: riskSignals.length >= 2 ? 'HIGH' : 'MEDIUM'
        };
      })
      .filter(
        (
          alert
        ): alert is {
          tripId: string;
          orderId: string;
          driverId: string;
          driverName: string;
          createdAt: Date;
          riskSignals: string[];
          severity: 'HIGH' | 'MEDIUM';
        } => Boolean(alert)
      )
      .slice(0, 30);

    return {
      count: alerts.length,
      alerts
    };
  }

  async complianceOverview() {
    const [insuredOrders, ewayBillOrders, scheduledOrders, sosEvents] = await Promise.all([
      this.prisma.order.count({
        where: {
          insuranceSelected: {
            not: InsurancePlan.NONE
          }
        }
      }),
      this.prisma.order.count({
        where: {
          ewayBillNumber: {
            not: null
          }
        }
      }),
      this.prisma.order.count({
        where: {
          scheduledAt: {
            not: null
          }
        }
      }),
      this.prisma.trip.count({
        where: {
          status: {
            in: [TripStatus.DRIVER_EN_ROUTE, TripStatus.ARRIVED_PICKUP, TripStatus.LOADING, TripStatus.IN_TRANSIT]
          }
        }
      })
    ]);

    return {
      insuranceCoverageOrders: insuredOrders,
      ewayBillsGenerated: ewayBillOrders,
      scheduledDispatchOrders: scheduledOrders,
      activeTripsMonitored: sosEvents
    };
  }

  async dispatchAnalytics() {
    const decisions = await this.prisma.dispatchDecision.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 500
    });

    const offersCreated = decisions.filter((entry) =>
      ['NEW_ASSIGNMENT', 'REASSIGNMENT', 'QUEUE_OFFER'].includes(entry.assignmentMode)
    ).length;
    const offersAccepted = decisions.filter((entry) =>
      ['OFFER_ACCEPTED', 'QUEUE_ACCEPTED'].includes(entry.assignmentMode)
    ).length;
    const offersRejected = decisions.filter((entry) => entry.assignmentMode === 'OFFER_REJECTED').length;
    const noOffer = decisions.filter((entry) => entry.assignmentMode === 'NO_OFFER').length;
    const etaEntries = decisions
      .map((entry) => entry.routeEtaMinutes)
      .filter((value): value is number => typeof value === 'number' && value > 0);

    const avgEtaMinutes =
      etaEntries.length > 0
        ? Number((etaEntries.reduce((sum, value) => sum + value, 0) / etaEntries.length).toFixed(2))
        : null;

    const acceptanceRate =
      offersCreated > 0 ? Number((offersAccepted / offersCreated).toFixed(3)) : 0;

    return {
      window: '7d',
      offersCreated,
      offersAccepted,
      offersRejected,
      noOfferDecisions: noOffer,
      acceptanceRate,
      avgEtaMinutes
    };
  }

  async operationsSummary() {
    const [activeBookings, activeRides, pendingSupport, onlineDrivers, busyDrivers] = await Promise.all([
      this.prisma.order.count({
        where: {
          status: {
            in: this.activeOrderStatuses
          }
        }
      }),
      this.prisma.trip.count({
        where: {
          status: {
            in: this.activeRideStatuses
          }
        }
      }),
      this.prisma.supportTicket.count({
        where: {
          status: {
            not: SupportTicketStatus.RESOLVED
          }
        }
      }),
      this.prisma.driverProfile.count({
        where: { availabilityStatus: AvailabilityStatus.ONLINE }
      }),
      this.prisma.driverProfile.count({
        where: { availabilityStatus: AvailabilityStatus.BUSY }
      })
    ]);

    return {
      activeBookings,
      activeRides,
      pendingSupport,
      onlineDrivers,
      busyDrivers
    };
  }

  async operationsBookings(query: AdminOperationsBookingsQueryDto) {
    const limit = query.limit ?? 60;
    const scope = query.scope ?? 'active';

    const where: Prisma.OrderWhereInput = {
      ...(query.status
        ? { status: query.status }
        : scope === 'active'
          ? {
              status: {
                in: this.activeOrderStatuses
              }
            }
          : {})
    };

    if (scope === 'recent') {
      where.createdAt = {
        gte: new Date(Date.now() - 48 * 60 * 60 * 1000)
      };
    }

    return this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true
          }
        },
        trip: {
          include: {
            driver: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    phone: true,
                    rating: true
                  }
                }
              }
            },
            deliveryProof: {
              select: {
                id: true,
                receiverName: true,
                receiverSignature: true,
                photoUrl: true,
                photoFileKey: true,
                photoMimeType: true,
                signatureCapturedAt: true,
                createdAt: true,
                updatedAt: true
              }
            }
          }
        },
        payment: {
          select: {
            id: true,
            provider: true,
            status: true,
            amount: true,
            updatedAt: true
          }
        }
      }
    });
  }

  async operationsRides(query: AdminOperationsRidesQueryDto) {
    const limit = query.limit ?? 60;
    const scope = query.scope ?? 'active';

    const where: Prisma.TripWhereInput = {
      ...(query.status
        ? { status: query.status }
        : scope === 'active'
          ? {
              status: {
                in: this.activeRideStatuses
              }
            }
          : {})
    };

    if (scope === 'recent') {
      where.createdAt = {
        gte: new Date(Date.now() - 48 * 60 * 60 * 1000)
      };
    }

    return this.prisma.trip.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        order: {
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                phone: true
              }
            }
          }
        },
        driver: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                phone: true,
                rating: true
              }
            }
          }
        },
        deliveryProof: {
          select: {
            id: true,
            receiverName: true,
            receiverSignature: true,
            photoUrl: true,
            photoFileKey: true,
            photoMimeType: true,
            signatureCapturedAt: true,
            createdAt: true,
            updatedAt: true
          }
        },
        rating: true
      }
    });
  }

  async operationsOrderDetail(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            role: true
          }
        },
        trip: {
          include: {
            driver: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    phone: true,
                    email: true,
                    rating: true
                  }
                }
              }
            }
          }
        },
        payment: true,
        supportTickets: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            subject: true,
            status: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });

    if (!order) {
      throw new NotFoundException(`Order not found: ${orderId}`);
    }

    return order;
  }

  async operationsRideDetail(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        order: {
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true
              }
            },
            payment: true
          }
        },
        driver: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                rating: true
              }
            }
          }
        },
        deliveryProof: true,
        rating: true,
        supportTickets: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            subject: true,
            status: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });

    if (!trip) {
      throw new NotFoundException(`Trip not found: ${tripId}`);
    }

    return trip;
  }

  pendingKycReview() {
    return this.kycService.pendingReview();
  }

  kycHistory(status: KycVerificationStatus, limit?: number) {
    return this.kycService.history(status, limit);
  }

  kycReviewDetails(verificationId: string) {
    return this.kycService.reviewDetails(verificationId);
  }

  approveKyc(verificationId: string, adminUserId: string) {
    return this.kycService.approve(verificationId, adminUserId);
  }

  rejectKyc(verificationId: string, adminUserId: string, reason: string) {
    return this.kycService.reject(verificationId, adminUserId, reason);
  }
}
