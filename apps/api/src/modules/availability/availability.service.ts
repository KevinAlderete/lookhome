import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../database/prisma/prisma.service";
import { CreateAvailabilityRuleDto } from "./dto/create-availability-rule.dto";
import { CreateCalendarBlockDto } from "./dto/create-calendar-block.dto";

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  private toInputJsonValue(value?: Record<string, any>): Prisma.InputJsonValue {
    return (value ?? {}) as Prisma.InputJsonValue;
  }

  async createRule(input: CreateAvailabilityRuleDto) {
    const room = await this.prisma.room.findUnique({
      where: { id: input.roomId },
      select: {
        id: true,
        listing: { select: { _count: { select: { rooms: true } } } },
      },
    });

    if (!room) {
      throw new BadRequestException("roomId no existe.");
    }
    this.assertSingleOffer(room.listing._count.rooms);

    const startDate = input.startDate ? new Date(input.startDate) : null;
    const endDate = input.endDate ? new Date(input.endDate) : null;

    if (startDate && endDate && startDate >= endDate) {
      throw new BadRequestException("startDate debe ser anterior a endDate.");
    }

    if (
      ["open_range", "blocked_range"].includes(input.ruleType) &&
      (!startDate || !endDate)
    ) {
      throw new BadRequestException(
        "Las reglas por rango requieren startDate y endDate.",
      );
    }

    if (input.ruleType === "weekly_pattern") {
      const days = input.weekPattern?.days;
      if (
        !Array.isArray(days) ||
        days.length === 0 ||
        days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
      ) {
        throw new BadRequestException(
          "El patrón semanal requiere days con valores entre 0 y 6.",
        );
      }
    }

    const rule = await this.prisma.availabilityRule.create({
      data: {
        room: {
          connect: { id: input.roomId },
        },
        ruleType: input.ruleType,
        startDate,
        endDate,
        weekPattern: input.weekPattern
          ? this.toInputJsonValue(input.weekPattern)
          : undefined,
      },
    });

    return {
      message: "Regla de disponibilidad creada correctamente.",
      rule,
    };
  }

  async listRulesByRoom(roomId: string) {
    return this.prisma.availabilityRule.findMany({
      where: { roomId },
      orderBy: [{ createdAt: "desc" }],
    });
  }

  async createCalendarBlock(input: CreateCalendarBlockDto) {
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      startDate >= endDate
    ) {
      throw new BadRequestException("startDate debe ser anterior a endDate.");
    }

    if (input.reason === "booked") {
      throw new BadRequestException(
        "Los bloqueos de reservas se gestionan desde el flujo de reservas.",
      );
    }

    const room = await this.prisma.room.findUnique({
      where: { id: input.roomId },
      select: {
        id: true,
        listing: { select: { _count: { select: { rooms: true } } } },
      },
    });

    if (!room) {
      throw new BadRequestException("roomId no existe.");
    }
    this.assertSingleOffer(room.listing._count.rooms);

    const block = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.roomId}))`;

      const overlappingBooking = await tx.booking.findFirst({
        where: {
          roomId: input.roomId,
          // Retain historical paid bookings as availability blockers.
          status: {
            in: ["accepted", "paid", "active", "completed", "requested"],
          },
          AND: [{ startDate: { lt: endDate } }, { endDate: { gt: startDate } }],
        },
        select: { id: true },
      });
      if (overlappingBooking) {
        throw new BadRequestException(
          "No puedes bloquear fechas ya reservadas.",
        );
      }

      return tx.calendarBlock.create({
        data: {
          room: { connect: { id: input.roomId } },
          startDate,
          endDate,
          reason: input.reason,
        },
      });
    });

    return {
      message: "Bloque de calendario creado correctamente.",
      block,
    };
  }

  async listBlocksByRoom(roomId: string) {
    return this.prisma.calendarBlock.findMany({
      where: { roomId },
      orderBy: [{ startDate: "asc" }],
      include: {
        booking: true,
      },
    });
  }

  async removeRule(id: string) {
    const exists = await this.prisma.availabilityRule.findUnique({
      where: { id },
      select: {
        id: true,
        room: {
          select: {
            listing: { select: { _count: { select: { rooms: true } } } },
          },
        },
      },
    });

    if (!exists) {
      throw new NotFoundException("Regla no encontrada.");
    }
    this.assertSingleOffer(exists.room.listing._count.rooms);

    await this.prisma.availabilityRule.delete({
      where: { id },
    });

    return {
      message: "Regla eliminada correctamente.",
    };
  }

  async removeBlock(id: string) {
    const exists = await this.prisma.calendarBlock.findUnique({
      where: { id },
      select: {
        id: true,
        bookingId: true,
        room: {
          select: {
            listing: { select: { _count: { select: { rooms: true } } } },
          },
        },
      },
    });

    if (!exists) {
      throw new NotFoundException("Bloque no encontrado.");
    }
    this.assertSingleOffer(exists.room.listing._count.rooms);

    if (exists.bookingId) {
      throw new BadRequestException(
        "Los bloqueos asociados a reservas no se eliminan manualmente.",
      );
    }

    await this.prisma.calendarBlock.delete({
      where: { id },
    });

    return {
      message: "Bloque eliminado correctamente.",
    };
  }

  private assertSingleOffer(offerCount: number) {
    if (offerCount > 1) {
      throw new ConflictException(
        "Este anuncio conserva varias ofertas históricas; su disponibilidad queda protegida hasta una revisión.",
      );
    }
  }
}
