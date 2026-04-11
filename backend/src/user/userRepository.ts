import { getPrismaClient } from '../infrastructure/database';
import type { User } from '@prisma/client';

export type UserWithoutPassword = Omit<User, 'password'>;

export interface CreateUserData {
  username: string;
  email: string;
  password: string;
  name?: string;
  gender?: string;
  birthDate?: Date;
}

export interface UpdateUserData {
  name?: string;
  gender?: string;
  birthDate?: Date | null;
  email?: string;
  role?: string;
  locked?: boolean;
  mustChangePassword?: boolean;
}

export async function createUser(data: CreateUserData): Promise<User> {
  const prisma = getPrismaClient();
  return prisma.user.create({
    data: {
      username: data.username,
      email: data.email,
      password: data.password,
      name: data.name,
      gender: data.gender,
      birthDate: data.birthDate,
      mustChangePassword: true,
    },
  });
}

export async function findUserByUsername(username: string): Promise<User | null> {
  const prisma = getPrismaClient();
  return prisma.user.findUnique({ where: { username } });
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const prisma = getPrismaClient();
  return prisma.user.findUnique({ where: { email } });
}

export async function findUserById(id: string): Promise<User | null> {
  const prisma = getPrismaClient();
  return prisma.user.findUnique({ where: { id } });
}

export async function listUsers(
  page: number,
  pageSize: number,
  search?: string
): Promise<UserWithoutPassword[]> {
  const prisma = getPrismaClient();
  const where = buildSearchWhere(search);
  return prisma.user.findMany({
    where,
    omit: { password: true },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
}

export async function countUsers(search?: string): Promise<number> {
  const prisma = getPrismaClient();
  const where = buildSearchWhere(search);
  return prisma.user.count({ where });
}

function buildSearchWhere(search?: string) {
  if (!search || search.trim() === '') {
    return {};
  }
  const term = search.trim();
  return {
    OR: [
      { username: { contains: term, mode: 'insensitive' as const } },
      { name: { contains: term, mode: 'insensitive' as const } },
      { email: { contains: term, mode: 'insensitive' as const } },
    ],
  };
}

export async function updateUser(id: string, data: UpdateUserData): Promise<User> {
  const prisma = getPrismaClient();
  return prisma.user.update({ where: { id }, data });
}

export async function findFirstAdmin(): Promise<User | null> {
  const prisma = getPrismaClient();
  return prisma.user.findFirst({ where: { role: 'admin' } });
}

export async function deleteUser(id: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.user.delete({ where: { id } });
}

export async function reassignUserResources(userId: string, newOwnerId: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.$transaction([
    prisma.datasource.updateMany({
      where: { createdBy: userId },
      data: { createdBy: newOwnerId },
    }),
    prisma.workflow.updateMany({
      where: { createdBy: userId },
      data: { createdBy: newOwnerId },
    }),
    prisma.customNodeTemplate.updateMany({
      where: { createdBy: userId },
      data: { createdBy: newOwnerId },
    }),
    prisma.workflowSchedule.updateMany({
      where: { createdBy: userId },
      data: { createdBy: newOwnerId },
    }),
  ]);
}

export async function deleteUserChatSessions(userId: string): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.chatSession.deleteMany({ where: { userId } });
}
