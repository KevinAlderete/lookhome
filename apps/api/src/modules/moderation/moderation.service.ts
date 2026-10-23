import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service";
import { CreateReportDto } from "./dto/create-report.dto";
import { ModerateEntityDto } from "./dto/moderate-entity.dto";
import { UpdateReportStatusDto } from "./dto/update-report-status.dto";
import { getAuthorizedConversation } from "../conversations/conversation-access";

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async createReport(userId: string, dto: CreateReportDto) {
    if (dto.entityType === "message") {
      const message = await this.prisma.message.findUnique({
        where: { id: dto.entityId },
        select: { id: true, senderUserId: true, conversationId: true },
      });
      if (!message) throw new NotFoundException("Mensaje no encontrado.");
      await getAuthorizedConversation(this.prisma, userId, message.conversationId);
      if (message.senderUserId === userId) {
        throw new BadRequestException("No puedes reportar tu propio mensaje.");
      }
    }

    const report = await this.prisma.report.create({
      data: {
        reporter: {
          connect: { id: userId },
        },
        entityType: dto.entityType,
        entityId: dto.entityId,
        reason: dto.reason,
        details: dto.details?.trim() || null,
        status: "open",
      },
    });

    return {
      message: "Reporte creado correctamente.",
      report,
    };
  }

  async listReports() {
    return this.prisma.report.findMany({
      include: {
        reporter: {
          select: {
            id: true,
            email: true,
            profile: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });
  }

  async updateReportStatus(reportId: string, dto: UpdateReportStatusDto) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: { id: true },
    });

    if (!report) {
      throw new NotFoundException("Reporte no encontrado.");
    }

    const updated = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: dto.status,
      },
    });

    return {
      message: "Estado del reporte actualizado.",
      report: updated,
    };
  }

  async applyModeration(moderatorUserId: string, dto: ModerateEntityDto) {
    const result = await this.prisma.$transaction(async (tx) => {
      const action = await tx.moderationAction.create({
        data: {
          moderator: {
            connect: { id: moderatorUserId },
          },
          entityType: dto.entityType,
          entityId: dto.entityId,
          action: dto.action,
          notes: dto.notes ?? null,
        },
      });

      if (dto.entityType === "listing" && dto.action === "unpublish") {
        await tx.listing.update({
          where: { id: dto.entityId },
          data: {
            listingStatus: "suspended",
          },
        });
      }

      if (dto.entityType === "room" && dto.action === "unpublish") {
        await tx.room.update({
          where: { id: dto.entityId },
          data: {
            status: "paused",
          },
        });
      }

      if (
        dto.entityType === "user" &&
        ["suspend", "ban"].includes(dto.action)
      ) {
        await tx.user.update({
          where: { id: dto.entityId },
          data: {
            status: "blocked",
          },
        });
      }

      if (dto.entityType === "message" && dto.action === "remove_content") {
        await tx.message.update({
          where: { id: dto.entityId },
          data: {
            content: "[contenido moderado]",
            metadata: {
              moderated: true,
              removedAt: new Date().toISOString(),
            },
          },
        });
      }

      if (dto.entityType === "review" && dto.action === "remove_content") {
        await tx.review.update({
          where: { id: dto.entityId },
          data: {
            comment: "[reseña moderada]",
          },
        });
      }

      return action;
    });

    return {
      message: "Acción de moderación aplicada correctamente.",
      action: result,
    };
  }
}
