import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../database/prisma/prisma.service";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { UpdateBookingStatusDto } from "./dto/update-booking-status.dto";
import { bookingDateOnly, dateOnlyToUtcDate, getPeruDateOnly } from "./booking-dates";
import { PUBLIC_VISIBILITY_BLOCKING_BOOKING_STATUSES } from "../../lib/public-listing-visibility";

@Injectable()
export class BookingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BookingsService.name);
  private completionRunInProgress = false;
  private lifecycleTimer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.runCompletionSweepSafely();
    this.lifecycleTimer = setInterval(
      () => void this.runCompletionSweepSafely(),
      15 * 60 * 1000,
    );
    this.lifecycleTimer.unref();
  }

  onModuleDestroy() {
    if (this.lifecycleTimer) clearInterval(this.lifecycleTimer);
  }

  private async runCompletionSweepSafely() {
    try {
      await this.completeExpiredActiveBookings();
    } catch (error) {
      this.logger.error(
        "No se pudieron completar las solicitudes vencidas.",
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async completeExpiredActiveBookings() {
    if (this.completionRunInProgress) return 0;
    this.completionRunInProgress = true;

    try {
      const today = dateOnlyToUtcDate(getPeruDateOnly());
      let completedCount = 0;
      let candidates = await this.prisma.booking.findMany({
        where: { status: "active", endDate: { lt: today } },
        select: {
          id: true,
          tenantUserId: true,
          hostUserId: true,
          room: { select: { listingId: true } },
        },
        orderBy: { endDate: "asc" },
        take: 100,
      });

      while (candidates.length > 0) {
        for (const candidate of candidates) {
          const completed = await this.prisma.$transaction(async (tx) => {
            await this.lockListing(tx, candidate.room?.listingId ?? candidate.id);
            const update = await tx.booking.updateMany({
              where: {
                id: candidate.id,
                status: "active",
                endDate: { lt: today },
              },
              data: { status: "completed", updatedAt: new Date() },
            });
            if (!update.count) return false;

            await this.createBookingNotifications(tx, candidate.id, [
              {
                userId: candidate.tenantUserId,
                perspective: "tenant",
                type: "booking.completed",
                title: "Estancia completada",
                body: "La estancia figura como completada. Ya puedes compartir tu reseña.",
              },
              {
                userId: candidate.hostUserId,
                perspective: "host",
                type: "booking.completed",
                title: "Estancia completada",
                body: "La estancia figura como completada. Ya puedes enviar tu valoración al huésped.",
              },
            ]);
            return true;
          });

          if (completed) completedCount += 1;
        }

        if (candidates.length < 100) break;
        candidates = await this.prisma.booking.findMany({
          where: { status: "active", endDate: { lt: today } },
          select: {
            id: true,
            tenantUserId: true,
            hostUserId: true,
            room: { select: { listingId: true } },
          },
          orderBy: { endDate: "asc" },
          take: 100,
        });
      }

      return completedCount;
    } finally {
      this.completionRunInProgress = false;
    }
  }

  private async createBookingNotifications(
    tx: Prisma.TransactionClient,
    bookingId: string,
    notifications: Array<{
      userId: string;
      perspective: "tenant" | "host";
      type: string;
      title: string;
      body: string;
    }>,
  ) {
    if (!notifications.length) return;
    const sentAt = new Date();

    await tx.notification.createMany({
      data: notifications.map((notification) => ({
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        status: "sent" as const,
        sentAt,
        data: {
          bookingId,
          perspective: notification.perspective,
        } as Prisma.InputJsonValue,
      })),
    });
  }

  private async lockListing(
    tx: Prisma.TransactionClient,
    listingId: string,
  ) {
    const lockKey = `listing:${listingId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  }

  async create(user: any, input: CreateBookingDto) {
    const startDate = new Date(input.startDate);

    if (Number.isNaN(startDate.getTime())) {
      throw new BadRequestException("startDate debe ser una fecha válida.");
    }
    if (bookingDateOnly(startDate) < getPeruDateOnly()) {
      throw new BadRequestException(
        "La fecha de ingreso no puede ser anterior a hoy.",
      );
    }

    const tenantUserId = user.id;
    let booking;

    try {
      booking = await this.prisma.$transaction(async (tx) => {
        // Serializes all availability checks for this room, including concurrent requests.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.roomId}))`;

        const room = await tx.room.findUnique({
          where: { id: input.roomId },
          include: { pricing: true, listing: true, availabilityRules: true },
        });

        if (!room) throw new BadRequestException("roomId no existe.");
        if (room.status !== "published") {
          throw new BadRequestException("El room no está publicado.");
        }
        if (room.listing.listingStatus !== "published") {
          throw new BadRequestException("El anuncio no está publicado.");
        }
        await this.lockListing(tx, room.listingId);
        if (tenantUserId === room.listing.hostUserId) {
          throw new BadRequestException(
            "No puedes reservar tu propio anuncio.",
          );
        }
        const blockingBooking = await tx.booking.findFirst({
          where: {
            status: {
              in: [...PUBLIC_VISIBILITY_BLOCKING_BOOKING_STATUSES],
            },
            room: { listingId: room.listingId },
          },
          select: { id: true },
        });
        if (blockingBooking) {
          throw new ConflictException(
            "El anuncio no recibe nuevas solicitudes mientras tenga una solicitud aprobada, una estancia en curso o una revisión pendiente.",
          );
        }
        if (!room.pricing) {
          throw new BadRequestException(
            "La unidad no tiene una tarifa configurada.",
          );
        }

        const rentalMode = room.pricing.rentalMode;
        if (rentalMode === "nightly" && (
          !Number.isInteger(input.guestCount) ||
          input.guestCount! < 1 ||
          input.guestCount! > room.maxOccupancy
        )) {
          throw new BadRequestException(
            "Indica una cantidad válida de huéspedes según la capacidad de la oferta.",
          );
        }
        const termMonths = rentalMode === "monthly" ? input.termMonths : null;
        const endDate =
          rentalMode === "monthly"
            ? termMonths
              ? this.addMonths(startDate, termMonths)
              : null
            : input.endDate
              ? new Date(input.endDate)
              : null;

        if (
          !endDate ||
          Number.isNaN(endDate.getTime()) ||
          startDate >= endDate
        ) {
          throw new BadRequestException(
            rentalMode === "monthly"
              ? "Debes indicar una duración mensual válida."
              : "endDate debe ser posterior a startDate.",
          );
        }
        if (room.availableFrom && startDate < room.availableFrom) {
          throw new BadRequestException(
            "La habitación no está disponible para la fecha de inicio indicada.",
          );
        }

        const quantity =
          rentalMode === "monthly"
            ? termMonths!
            : this.getStayNights(startDate, endDate);
        const minimum =
          rentalMode === "monthly"
            ? room.pricing.minTermMonths
            : room.pricing.minStayNights;
        const maximum =
          rentalMode === "monthly"
            ? room.pricing.maxTermMonths
            : room.pricing.maxStayNights;
        if (minimum != null && quantity < minimum) {
          throw new BadRequestException(
            `La duración mínima es de ${minimum} ${rentalMode === "monthly" ? "meses" : "noches"}.`,
          );
        }
        if (maximum != null && quantity > maximum) {
          throw new BadRequestException(
            `La duración máxima es de ${maximum} ${rentalMode === "monthly" ? "meses" : "noches"}.`,
          );
        }

        this.assertAvailabilityRules(
          room.availabilityRules,
          startDate,
          endDate,
        );

        // A Prisma transaction uses one PostgreSQL connection; run these reads
        // sequentially instead of queueing concurrent pg client.query calls.
        const overlappingBooking = await tx.booking.findFirst({
          where: {
            roomId: input.roomId,
            // Keep historical paid bookings blocking the dates they already occupy.
            status: { in: ["accepted", "paid", "active", "completed"] },
            AND: [
              { startDate: { lt: endDate } },
              { endDate: { gt: startDate } },
            ],
          },
          select: { id: true },
        });
        const overlappingBlock = await tx.calendarBlock.findFirst({
          where: {
            roomId: input.roomId,
            AND: [
              { startDate: { lt: endDate } },
              { endDate: { gt: startDate } },
            ],
          },
          select: { id: true },
        });

        if (overlappingBooking) {
          throw new BadRequestException(
            "Ya existe una reserva solapada para este room.",
          );
        }
        if (overlappingBlock) {
          throw new BadRequestException(
            "El room tiene fechas bloqueadas en ese rango.",
          );
        }

        const cleaningFee =
          rentalMode === "nightly"
            ? (room.pricing.cleaningFee ?? new Prisma.Decimal(0))
            : new Prisma.Decimal(0);
        const depositAmount =
          rentalMode === "monthly"
            ? (room.pricing.depositAmount ?? new Prisma.Decimal(0))
            : new Prisma.Decimal(0);
        const totalAmount = new Prisma.Decimal(room.pricing.rentAmount)
          .mul(quantity)
          .add(depositAmount)
          .add(cleaningFee);
        const pricingData = {
            pricingSnapshot: {
            create: {
              currencyCode: room.pricing.currencyCode,
              rentAmount: room.pricing.rentAmount,
              rentalMode,
              billingQuantity: quantity,
              depositAmount:
                rentalMode === "monthly"
                  ? (room.pricing.depositAmount ?? null)
                  : null,
              cleaningFee:
                rentalMode === "nightly" ? (room.pricing.cleaningFee ?? null) : null,
              totalAmount,
              breakdown: { rentalMode, quantity },
            },
          },
        };

        const booking = await tx.booking.create({
          data: {
            room: { connect: { id: input.roomId } },
            tenant: { connect: { id: tenantUserId } },
            host: { connect: { id: room.listing.hostUserId } },
            status: "requested",
            rentalMode,
            termMonths,
            startDate,
            endDate,
            guestCount: rentalMode === "nightly" ? input.guestCount! : 1,
            message: input.message?.trim() || null,
            ...pricingData,
          },
          include: {
            room: true,
            tenant: { select: { id: true, profile: { select: { displayName: true } } } },
            host: { select: { id: true, profile: { select: { displayName: true } } } },
            pricingSnapshot: {
              select: {
                currencyCode: true,
                rentAmount: true,
                rentalMode: true,
                billingQuantity: true,
                cleaningFee: true,
                depositAmount: true,
                totalAmount: true,
              },
            },
          },
        });
        await this.createBookingNotifications(tx, booking.id, [
          {
            userId: room.listing.hostUserId,
            perspective: "host",
            type: "booking.requested",
            title: "Nueva solicitud de alquiler",
            body: "Revisa las fechas y condiciones de la solicitud. Enviarla no confirma una reserva.",
          },
        ]);
        return booking;
      });
    } catch (error) {
      if (this.isDateConflict(error)) {
        throw new BadRequestException(
          "Ya existe una reserva solapada para este room.",
        );
      }
      throw error;
    }

    return {
      message: "Solicitud enviada al anfitrión.",
      booking,
    };
  }

  async startByTenant(user: any, id: string) {
    const today = getPeruDateOnly();
    const todayDate = dateOnlyToUtcDate(today);

    return this.prisma.$transaction(async (tx) => {
      const exists = await tx.booking.findUnique({
        where: { id },
        select: {
          id: true,
          tenantUserId: true,
          hostUserId: true,
          status: true,
          startDate: true,
          endDate: true,
          roomId: true,
          room: { select: { listingId: true } },
        },
      });

      if (!exists) throw new NotFoundException("Solicitud no encontrada.");
      if (exists.tenantUserId !== user.id) {
        throw new ForbiddenException("No puedes iniciar esta solicitud.");
      }
      await this.lockListing(tx, exists.room?.listingId ?? exists.roomId);
      if (exists.status !== "accepted") {
        throw new ConflictException(
          "Solo puedes confirmar el inicio de una solicitud aprobada.",
        );
      }
      if (bookingDateOnly(exists.startDate) > today) {
        throw new BadRequestException(
          "Podrás confirmar el inicio desde la fecha de ingreso indicada.",
        );
      }
      if (bookingDateOnly(exists.endDate) < today) {
        throw new BadRequestException(
          "La fecha de salida prevista ya pasó. Contacta al anfitrión para revisar la solicitud.",
        );
      }

      const update = await tx.booking.updateMany({
        where: {
          id,
          tenantUserId: user.id,
          status: "accepted",
          startDate: { lte: todayDate },
        },
        data: { status: "active", updatedAt: new Date() },
      });
      if (!update.count) {
        throw new ConflictException(
          "La solicitud cambió. Actualiza la página antes de continuar.",
        );
      }

      await this.ensureBookingCalendarBlock(tx, exists);
      await this.createBookingNotifications(tx, id, [
        {
          userId: exists.hostUserId,
          perspective: "host",
          type: "booking.started",
          title: "Inicio de estancia confirmado",
          body: "El huésped confirmó el inicio de esta estancia.",
        },
      ]);

      const booking = await tx.booking.findUnique({
        where: { id },
        include: {
          room: true,
          tenant: {
            select: { id: true, profile: { select: { displayName: true } } },
          },
          host: {
            select: { id: true, profile: { select: { displayName: true } } },
          },
        },
      });

      return {
        message: "Inicio de estancia confirmado.",
        booking,
      };
    });
  }

  private isDateConflict(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes("bookings_room_active_dates_excl") ||
      message.includes("23P01")
    );
  }

  private getStayNights(startDate: Date, endDate: Date) {
    return Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
  }

  private addMonths(date: Date, months: number) {
    const result = new Date(date);
    result.setUTCMonth(result.getUTCMonth() + months);
    return result;
  }

  private assertAvailabilityRules(
    rules: Array<{
      ruleType: string;
      startDate: Date | null;
      endDate: Date | null;
      weekPattern: unknown;
    }>,
    startDate: Date,
    endDate: Date,
  ) {
    const rangesOverlap = (rule: {
      startDate: Date | null;
      endDate: Date | null;
    }) =>
      rule.startDate != null &&
      rule.endDate != null &&
      rule.startDate < endDate &&
      rule.endDate > startDate;

    if (
      rules.some(
        (rule) => rule.ruleType === "blocked_range" && rangesOverlap(rule),
      )
    ) {
      throw new BadRequestException(
        "La habitación no está disponible en ese rango.",
      );
    }

    const openRanges = rules.filter(
      (rule) =>
        rule.ruleType === "open_range" && rule.startDate && rule.endDate,
    );
    if (
      openRanges.length > 0 &&
      !openRanges.some(
        (rule) => rule.startDate! <= startDate && rule.endDate! >= endDate,
      )
    ) {
      throw new BadRequestException(
        "La reserva está fuera del rango disponible.",
      );
    }

    const weeklyRules = rules.filter(
      (rule) => rule.ruleType === "weekly_pattern",
    );
    for (const rule of weeklyRules) {
      const days = (rule.weekPattern as { days?: unknown } | null)?.days;
      if (!Array.isArray(days)) continue;
      for (
        let day = new Date(startDate);
        day < endDate;
        day.setUTCDate(day.getUTCDate() + 1)
      ) {
        if (!days.includes(day.getUTCDay())) {
          throw new BadRequestException(
            "La reserva incluye días no disponibles.",
          );
        }
      }
    }
  }

  async findMine(user: any) {
    return this.findAll(user, "tenant");
  }

  async findHostBookings(user: any) {
    return this.findAll(user, "host");
  }

  async findAll(user: any, perspective: "default" | "tenant" | "host" = "default") {
    const roles: string[] = Array.isArray(user?.roles)
      ? user.roles.map((role: unknown) => String(role).toLowerCase())
      : [];

    const where = perspective === "tenant"
      ? { tenantUserId: user.id }
      : perspective === "host"
        ? { hostUserId: user.id }
        : roles.includes("admin") || roles.includes("support")
        ? {}
        : roles.includes("host")
          ? { hostUserId: user.id }
          : roles.includes("tenant")
            ? { tenantUserId: user.id }
            : { id: "__NO_RESULTS__" };

    return this.prisma.booking.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      include: {
        room: {
          select: {
            id: true,
            name: true,
            listing: { select: { id: true, title: true } },
          },
        },
        tenant: {
          select: {
            id: true,
            profile: { select: { displayName: true } },
          },
        },
        host: {
          select: {
            id: true,
            profile: { select: { displayName: true } },
          },
        },
        pricingSnapshot: {
          select: {
            currencyCode: true,
            rentAmount: true,
            rentalMode: true,
            billingQuantity: true,
            cleaningFee: true,
            depositAmount: true,
            totalAmount: true,
          },
        },
      },
    });
  }
  async findMineById(user: any, id: string) {
    const booking = await this.findOne(user, id, "tenant");
    const listingId = booking.room?.listing?.id;
    const conversation = listingId && booking.room.listing.hostUserId === booking.hostUserId
      ? await this.prisma.conversation.findFirst({
          where: {
            OR: [
              { roomId: booking.roomId, listingId },
              { roomId: null, listingId },
              { roomId: booking.roomId, listingId: null },
            ],
            AND: [
              { participants: { some: { userId: user.id } } },
              { participants: { some: { userId: booking.hostUserId } } },
              { participants: { every: { userId: { in: [user.id, booking.hostUserId] } } } },
            ],
          },
          orderBy: [{ updatedAt: "desc" }],
          select: { id: true },
        })
      : null;
    return { ...booking, relatedConversationId: conversation?.id ?? null };
  }

  async findHostBookingById(user: any, id: string) {
    return this.findOne(user, id, "host");
  }

  async findOne(user: any, id: string, perspective: "default" | "tenant" | "host" = "default") {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        room: {
          select: {
            id: true,
            name: true,
            status: true,
            listing: { select: { id: true, title: true, hostUserId: true, listingStatus: true, deletedAt: true } },
          },
        },
        tenant: {
          select: {
            id: true,
            profile: { select: { displayName: true } },
          },
        },
        host: {
          select: {
            id: true,
            profile: { select: { displayName: true } },
          },
        },
        pricingSnapshot: {
          select: {
            currencyCode: true,
            rentAmount: true,
            rentalMode: true,
            billingQuantity: true,
            cleaningFee: true,
            depositAmount: true,
            totalAmount: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException("Booking no encontrado.");
    }

    const roles: string[] = Array.isArray(user?.roles)
      ? user.roles.map((role: unknown) => String(role).toLowerCase())
      : [];
    const canView = perspective === "tenant"
      ? booking.tenantUserId === user.id
      : perspective === "host"
        ? booking.hostUserId === user.id
        : roles.includes("admin") ||
          roles.includes("support") ||
          booking.hostUserId === user.id ||
          booking.tenantUserId === user.id;

    if (!canView) {
      throw new ForbiddenException("No tienes acceso a este booking.");
    }

    return booking;
  }

  private async ensureBookingCalendarBlock(
    tx: Prisma.TransactionClient,
    booking: {
      id: string;
      roomId: string;
      startDate: Date;
      endDate: Date;
    },
  ) {
    const existing = await tx.calendarBlock.findFirst({
      where: { bookingId: booking.id },
      select: { id: true },
    });
    const data = {
      roomId: booking.roomId,
      startDate: booking.startDate,
      endDate: booking.endDate,
      reason: "booked" as const,
      bookingId: booking.id,
    };

    if (existing) {
      await tx.calendarBlock.update({ where: { id: existing.id }, data });
    } else {
      await tx.calendarBlock.create({ data });
    }
  }

  async updateStatus(user: any, id: string, input: UpdateBookingStatusDto) {
    const roles = Array.isArray(user?.roles)
      ? user.roles.map((role: unknown) => String(role).toLowerCase())
      : [];
    const isStaff = roles.includes("admin") || roles.includes("support");
    const today = getPeruDateOnly();
    const transitions: Record<string, string[]> = {
      requested: ["accepted", "rejected", "cancelled"],
      accepted: ["active", "cancelled"],
      active: ["completed", "disputed"],
      completed: ["disputed"],
      disputed: ["active", "completed", "cancelled"],
    };

    try {
      return await this.prisma.$transaction(async (tx) => {
        const exists = await tx.booking.findUnique({
          where: { id },
          select: {
            id: true,
            roomId: true,
            tenantUserId: true,
            hostUserId: true,
            startDate: true,
            endDate: true,
            status: true,
            room: { select: { listingId: true } },
          },
        });

        if (!exists) {
          throw new NotFoundException("Solicitud no encontrada.");
        }
        await this.lockListing(tx, exists.room?.listingId ?? exists.roomId);
        if (!transitions[exists.status]?.includes(input.status)) {
          throw new BadRequestException(
            "La transición de estado solicitada no es válida.",
          );
        }
        if (!isStaff && exists.status === "disputed") {
          throw new ForbiddenException(
            "Solo el equipo administrativo puede resolver una solicitud en revisión.",
          );
        }
        if (
          !isStaff &&
          !["accepted", "rejected", "cancelled", "completed"].includes(
            input.status,
          )
        ) {
          throw new ForbiddenException(
            "Solo el huésped puede confirmar el inicio de la estancia.",
          );
        }
        if (
          input.status === "active" &&
          bookingDateOnly(exists.startDate) > today
        ) {
          throw new BadRequestException(
            "No puedes iniciar la estancia antes de la fecha de ingreso indicada.",
          );
        }
        if (
          input.status === "active" &&
          bookingDateOnly(exists.endDate) < today
        ) {
          throw new BadRequestException(
            "La fecha de salida prevista ya pasó y no se puede iniciar la estancia.",
          );
        }

        const update = await tx.booking.updateMany({
          where: { id, status: exists.status },
          data: { status: input.status, updatedAt: new Date() },
        });
        if (!update.count) {
          throw new ConflictException(
            "La solicitud cambió. Actualiza la página antes de continuar.",
          );
        }

        if (input.status === "accepted" || input.status === "active") {
          await this.ensureBookingCalendarBlock(tx, exists);
        }
        if (["rejected", "cancelled"].includes(input.status)) {
          await tx.calendarBlock.deleteMany({ where: { bookingId: id } });
        }

        const booking = await tx.booking.findUnique({
          where: { id },
          include: {
            room: true,
            tenant: {
              select: { id: true, profile: { select: { displayName: true } } },
            },
            host: {
              select: { id: true, profile: { select: { displayName: true } } },
            },
          },
        });
        if (!booking) throw new NotFoundException("Solicitud no encontrada.");

        const notifications = this.statusNotifications(booking, input.status);
        await this.createBookingNotifications(tx, id, notifications);

        return {
          message: "Estado de la solicitud actualizado correctamente.",
          booking,
        };
      });
    } catch (error) {
      if (this.isDateConflict(error)) {
        throw new ConflictException(
          "Las fechas ya no están disponibles. Revisa la solicitud antes de aprobarla.",
        );
      }
      throw error;
    }
  }

  private statusNotifications(
    booking: { tenantUserId: string; hostUserId: string },
    status: string,
  ) {
    if (status === "accepted") {
      return [
        {
          userId: booking.tenantUserId,
          perspective: "tenant" as const,
          type: "booking.accepted",
          title: "Solicitud aprobada",
          body: "El anfitrión aprobó tu solicitud. Coordina los siguientes pasos directamente; LOOKHOME no procesa pagos.",
        },
      ];
    }
    if (status === "rejected" || status === "cancelled") {
      return [
        {
          userId: booking.tenantUserId,
          perspective: "tenant" as const,
          type: `booking.${status}`,
          title: status === "rejected" ? "Solicitud rechazada" : "Solicitud cancelada",
          body:
            status === "rejected"
              ? "El anfitrión rechazó tu solicitud. Puedes revisar otras ofertas disponibles."
              : "La solicitud fue cancelada. Revisa el detalle para ver su estado actualizado.",
        },
      ];
    }
    if (status === "active") {
      return [
        {
          userId: booking.tenantUserId,
          perspective: "tenant" as const,
          type: "booking.started",
          title: "Estancia en curso",
          body: "La solicitud se marcó como en curso.",
        },
        {
          userId: booking.hostUserId,
          perspective: "host" as const,
          type: "booking.started",
          title: "Estancia en curso",
          body: "La solicitud se marcó como en curso.",
        },
      ];
    }
    if (status === "completed") {
      return [
        {
          userId: booking.tenantUserId,
          perspective: "tenant" as const,
          type: "booking.completed",
          title: "Estancia completada",
          body: "Ya puedes compartir tu reseña sobre la oferta.",
        },
        {
          userId: booking.hostUserId,
          perspective: "host" as const,
          type: "booking.completed",
          title: "Estancia completada",
          body: "Ya puedes enviar tu valoración al huésped desde la solicitud.",
        },
      ];
    }
    if (status === "disputed") {
      return [
        {
          userId: booking.tenantUserId,
          perspective: "tenant" as const,
          type: "booking.disputed",
          title: "Solicitud en revisión",
          body: "La solicitud está en revisión. Las reseñas se habilitarán cuando la estancia figure como completada.",
        },
        {
          userId: booking.hostUserId,
          perspective: "host" as const,
          type: "booking.disputed",
          title: "Solicitud en revisión",
          body: "La solicitud está en revisión. Las reseñas se habilitarán cuando la estancia figure como completada.",
        },
      ];
    }
    return [];
  }
}
