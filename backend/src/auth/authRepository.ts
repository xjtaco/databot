import { getPrismaClient } from '../infrastructure/database';
import type { User, RefreshToken } from '@prisma/client';

export async function findUserByUsername(username: string): Promise<User | null> {
  const prisma = getPrismaClient();
  return prisma.user.findUnique({ where: { username } });
}

export async function findUserById(id: string): Promise<User | null> {
  const prisma = getPrismaClient();
  return prisma.user.findUnique({ where: { id } });
}

export async function createRefreshToken(
  userId: string,
  token: string,
  expiresAt: Date
): Promise<RefreshToken> {
  const prisma = getPrismaClient();
  return prisma.refreshToken.create({ data: { userId, token, expiresAt } });
}

export async function findRefreshToken(
  token: string
): Promise<(RefreshToken & { user: User }) | null> {
  const prisma = getPrismaClient();
  return prisma.refreshToken.findUnique({
    where: { token },
    include: { user: true },
  });
}

export async function deleteRefreshToken(token: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.refreshToken.deleteMany({ where: { token } });
}

export async function deleteUserRefreshTokens(userId: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.refreshToken.deleteMany({ where: { userId } });
}

export async function updateUserPassword(
  userId: string,
  passwordHash: string,
  mustChangePassword: boolean
): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.user.update({
    where: { id: userId },
    data: { password: passwordHash, mustChangePassword },
  });
}

export async function updateUser(
  userId: string,
  data: { name?: string; gender?: string; birthDate?: Date | null; email?: string }
): Promise<User> {
  const prisma = getPrismaClient();
  return prisma.user.update({ where: { id: userId }, data });
}
