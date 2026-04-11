import * as userRepo from './userRepository';
import * as authService from '../auth/authService';
import * as authRepo from '../auth/authRepository';
import * as emailService from '../email/emailService';
import { ConflictError, ForbiddenError } from '../errors/types';
import { ErrorCode } from '../errors/errorCode';
import logger from '../utils/logger';

export interface CreateUserInput {
  username: string;
  email: string;
  name?: string;
  gender?: string;
  birthDate?: Date;
}

export interface CreateUserResult {
  user: userRepo.UserWithoutPassword;
  passwordSent: boolean;
  tempPassword?: string;
}

export async function createUserWithRandomPassword(
  input: CreateUserInput
): Promise<CreateUserResult> {
  const existingByUsername = await userRepo.findUserByUsername(input.username);
  if (existingByUsername) {
    throw new ConflictError('Username is already taken', ErrorCode.USERNAME_TAKEN);
  }

  const existingByEmail = await userRepo.findUserByEmail(input.email);
  if (existingByEmail) {
    throw new ConflictError('Email is already taken', ErrorCode.EMAIL_TAKEN);
  }

  const tempPassword = authService.generateRandomPassword();
  const hashedPassword = await authService.hashPassword(tempPassword);

  const created = await userRepo.createUser({
    username: input.username,
    email: input.email,
    password: hashedPassword,
    name: input.name,
    gender: input.gender,
    birthDate: input.birthDate,
  });

  // Strip password from result
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _password, ...user } = created;

  const passwordSent = await emailService.sendWelcomeEmail(
    input.email,
    input.username,
    tempPassword
  );

  logger.info('User created', { userId: created.id, username: created.username, passwordSent });

  return {
    user,
    passwordSent,
    tempPassword: passwordSent ? undefined : tempPassword,
  };
}

export async function lockUser(userId: string): Promise<void> {
  const user = await userRepo.findUserById(userId);
  if (user?.role === 'admin') {
    throw new ForbiddenError('Cannot lock admin account', ErrorCode.CANNOT_LOCK_ADMIN);
  }

  await userRepo.updateUser(userId, { locked: true });
  await authRepo.deleteUserRefreshTokens(userId);

  logger.info('User locked', { userId });
}

export async function unlockUser(userId: string): Promise<void> {
  await userRepo.updateUser(userId, { locked: false });
  logger.info('User unlocked', { userId });
}

export async function deleteUserById(userId: string, adminId: string): Promise<void> {
  const user = await userRepo.findUserById(userId);
  if (user?.role === 'admin') {
    throw new ForbiddenError('Cannot delete admin account', ErrorCode.CANNOT_DELETE_ADMIN);
  }

  await userRepo.reassignUserResources(userId, adminId);
  await userRepo.deleteUserChatSessions(userId);
  await userRepo.deleteUser(userId);

  logger.info('User deleted', { userId, resourcesReassignedTo: adminId });
}
