export type PublicProfileUpdate = {
  displayName: string;
  photoUrl: string | null;
};

declare global {
  interface WindowEventMap {
    "lookhome:profile-public-updated": CustomEvent<PublicProfileUpdate>;
  }
}

export function dispatchPublicProfileUpdate(detail: PublicProfileUpdate) {
  window.dispatchEvent(
    new CustomEvent("lookhome:profile-public-updated", { detail }),
  );
}
