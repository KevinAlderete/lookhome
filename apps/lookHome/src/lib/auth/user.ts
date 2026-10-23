export function getUserDisplayName(user: any) {
  return (
    user?.profile?.displayName ||
    user?.name ||
    user?.profile?.fullName ||
    user?.profile?.name ||
    [user?.profile?.firstName, user?.profile?.lastName]
      .filter(Boolean)
      .join(" ") ||
    "Mi perfil"
  );
}

export function getUserAvatar(user: any) {
  return (
    user?.profile?.photoUrl ||
    user?.image ||
    user?.profile?.avatarUrl ||
    user?.profile?.image ||
    "/avatar-placeholder.png"
  );
}
