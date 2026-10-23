import { SetMetadata } from "@nestjs/common";

export const OWNERSHIP_KEY = "ownership";

export type OwnershipResource =
  | "listing"
  | "room"
  | "booking-host"
  | "booking-tenant"
  | "conversation-participant"
  | "availability-rule"
  | "calendar-block";

export const Ownership = (resource: OwnershipResource) =>
  SetMetadata(OWNERSHIP_KEY, resource);
