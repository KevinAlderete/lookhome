import { SetMetadata } from "@nestjs/common";

export const RESOURCE_OWNER_KEY = "resourceOwner";
export type ResourceOwnerType = "listing" | "room";

export const ResourceOwner = (resource: ResourceOwnerType) =>
  SetMetadata(RESOURCE_OWNER_KEY, resource);
