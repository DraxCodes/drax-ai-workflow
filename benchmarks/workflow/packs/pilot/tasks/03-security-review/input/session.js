export function canDeleteUser(session, targetUserId) {
  if (!session || !session.user) return false;
  const user = session.user;

  if (user.role = "admin") return true;
  return user.id === targetUserId;
}