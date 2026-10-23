import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../database/prisma/prisma.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UpdatePasswordDto } from "./dto/update-password.dto";
import { UpdateNotificationPreferencesDto } from "./dto/update-notification-preferences.dto";
import { MediaService } from "../media/media.service";
import { CreateMediaUploadIntentDto } from "../media/dto/create-media-upload-intent.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
  ) {}

  private toInputJsonValue(value?: Record<string, any>): Prisma.InputJsonValue {
    return (value ?? {}) as Prisma.InputJsonValue;
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phoneE164: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            displayName: true,
            photoUrl: true,
            locale: true,
            timezone: true,
          },
        },
        roles: { select: { role: true } },
        verifications: {
          where: {
            type: { in: ["email", "phone"] },
            status: "verified",
          },
          select: { type: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("Usuario no encontrado.");
    }

    return {
      id: user.id,
      email: user.email,
      phoneE164: user.phoneE164,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      roles: user.roles.map((item) => item.role),
      profile: user.profile,
      contactVerification: {
        email: user.verifications.some((item) => item.type === "email"),
        phone: user.verifications.some((item) => item.type === "phone"),
      },
    };
  }

  async activateHost(userId: string) {
    const hostRole = await this.prisma.userRole.upsert({
      where: {
        userId_role: {
          userId,
          role: "host",
        },
      },
      create: {
        userId,
        role: "host",
      },
      update: {},
    });

    return {
      message: "Rol de anfitrión activado correctamente.",
      role: hostRole.role,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        firstName: dto.firstName?.trim() || null,
        lastName: dto.lastName?.trim() || null,
        displayName: dto.displayName?.trim() || null,
        locale: dto.locale ?? "es-PE",
        timezone: dto.timezone ?? "America/Lima",
      },
      update: {
        ...(dto.firstName !== undefined
          ? { firstName: dto.firstName.trim() || null }
          : {}),
        ...(dto.lastName !== undefined
          ? { lastName: dto.lastName.trim() || null }
          : {}),
        ...(dto.displayName !== undefined
          ? { displayName: dto.displayName.trim() || null }
          : {}),
        ...(dto.locale !== undefined ? { locale: dto.locale } : {}),
        ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
        updatedAt: new Date(),
      },
    });

    return {
      message: "Perfil actualizado correctamente.",
      profile: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        displayName: profile.displayName,
        photoUrl: profile.photoUrl,
        locale: profile.locale,
        timezone: profile.timezone,
      },
    };
  }

  async updateAvatar(userId: string, file: any, uploadKey?: string) {
    const { media } = await this.mediaService.uploadImage(
      userId,
      file,
      uploadKey,
      "profile",
    );
    return this.saveAvatarReference(userId, media);
  }

  createAvatarUploadIntent(userId: string, input: CreateMediaUploadIntentDto) {
    return this.mediaService.createUploadIntent(
      userId,
      input.uploadKey,
      input.sizeBytes,
      input.mimeType,
      "profile",
    );
  }

  async completeAvatarUpload(userId: string, mediaId: string, uploadKey: string) {
    const { media } = await this.mediaService.completeDirectUpload(
      userId,
      mediaId,
      uploadKey,
      "profile",
    );
    return this.saveAvatarReference(userId, media);
  }

  private async saveAvatarReference(userId: string, media: any) {
    const previous = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { avatarMediaId: true, photoUrl: true },
    });
    const previousMediaId =
      previous?.avatarMediaId ??
      (previous?.photoUrl
        ? (
            await this.prisma.media.findFirst({
              where: {
                ownerUserId: userId,
                OR: [
                  { publicUrl: previous.photoUrl },
                  { thumbnailPublicUrl: previous.photoUrl },
                ],
              },
              select: { id: true },
            })
          )?.id
        : null);
    const photoUrl = media.thumbnailPublicUrl ?? media.publicUrl;
    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        avatarMediaId: media.id,
        photoUrl,
        locale: "es-PE",
        timezone: "America/Lima",
      },
      update: {
        avatarMediaId: media.id,
        photoUrl,
        updatedAt: new Date(),
      },
      select: { photoUrl: true },
    });

    if (previousMediaId && previousMediaId !== media.id) {
      await this.mediaService.remove(
        { id: userId, roles: ["host"] },
        previousMediaId,
      );
    }

    return {
      message: "Foto de perfil actualizada correctamente.",
      photoUrl: profile.photoUrl,
    };
  }

  async updatePassword(userId: string, dto: UpdatePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    if (!user || !user.passwordHash) {
      throw new NotFoundException("Usuario no encontrado.");
    }

    const valid = this.verifyPassword(dto.currentPassword, user.passwordHash);

    if (!valid) {
      throw new BadRequestException("La contraseña actual es incorrecta.");
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: this.hashPassword(dto.newPassword),
          updatedAt: new Date(),
        },
      }),
      this.prisma.userSession.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      }),
    ]);

    return {
      message:
        "Contraseña actualizada correctamente. Todas las sesiones fueron cerradas.",
    };
  }

  async updateNotificationPreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ) {
    const preference = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        prefs: this.toInputJsonValue(dto.prefs),
      },
      update: {
        prefs: this.toInputJsonValue(dto.prefs),
        updatedAt: new Date(),
      },
    });

    return {
      message: "Preferencias actualizadas correctamente.",
      preference,
    };
  }

  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
  }

  private verifyPassword(password: string, storedHash: string): boolean {
    const [salt, originalHash] = storedHash.split(":");

    if (!salt || !originalHash) {
      return false;
    }

    const hashBuffer = scryptSync(password, salt, 64);
    const originalBuffer = Buffer.from(originalHash, "hex");

    if (hashBuffer.length !== originalBuffer.length) {
      return false;
    }

    return timingSafeEqual(hashBuffer, originalBuffer);
  }
}
