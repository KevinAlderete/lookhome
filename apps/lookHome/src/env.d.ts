/// <reference types="astro/client" />

type AppUserRole =
  | string
  | {
      id?: string;
      name?: string;
      code?: string;
      slug?: string;
    };

type AppUser = {
  id: string;
  name?: string;
  email?: string;
  image?: string | null;
  role?: string | null;
  roles?: AppUserRole[];
  profile?: {
    displayName?: string | null;
    fullName?: string;
    name?: string;
    firstName?: string | null;
    lastName?: string | null;
    photoUrl?: string | null;
    avatarUrl?: string | null;
    image?: string | null;
  } | null;
};

declare namespace App {
  interface Locals {
    user: AppUser | null;
  }
}
