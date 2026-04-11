import type { Request, Response } from 'express';
import { getStringParam } from '../utils/routeParams';
import { ValidationError, ForbiddenError } from '../errors/types';
import { ErrorCode } from '../errors/errorCode';
import * as userRepo from './userRepository';
import * as userService from './userService';

export async function listUsersHandler(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(String(req.query.pageSize ?? '20'), 10) || 20)
  );
  const search = req.query.search ? String(req.query.search) : undefined;

  const [users, total] = await Promise.all([
    userRepo.listUsers(page, pageSize, search),
    userRepo.countUsers(search),
  ]);

  res.json({ users, total, page, pageSize });
}

export async function createUserHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;

  if (typeof body.username !== 'string' || body.username.trim() === '') {
    throw new ValidationError('Username is required');
  }
  if (typeof body.email !== 'string' || body.email.trim() === '') {
    throw new ValidationError('Email is required');
  }

  const result = await userService.createUserWithRandomPassword({
    username: body.username.trim(),
    email: body.email.trim(),
    name: typeof body.name === 'string' ? body.name.trim() : undefined,
    gender: typeof body.gender === 'string' ? body.gender.trim() : undefined,
    birthDate:
      typeof body.birthDate === 'string' && body.birthDate ? new Date(body.birthDate) : undefined,
  });

  if (req.auditContext) {
    req.auditContext.params = {
      targetUsername: body.username.trim(),
      role: typeof body.role === 'string' ? body.role : 'user',
    };
  }

  res.status(201).json(result);
}

export async function getUserHandler(req: Request, res: Response): Promise<void> {
  const id = getStringParam(req, 'id');
  const user = await userRepo.findUserById(id);
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _password, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
}

export async function updateUserHandler(req: Request, res: Response): Promise<void> {
  const id = getStringParam(req, 'id');
  const body = req.body as Record<string, unknown>;

  const existing = await userRepo.findUserById(id);
  if (!existing) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  if (existing.role === 'admin') {
    if (
      (typeof body.username === 'string' && body.username !== existing.username) ||
      (typeof body.role === 'string' && body.role !== existing.role)
    ) {
      throw new ForbiddenError(
        'Cannot modify admin username or role',
        ErrorCode.CANNOT_MODIFY_ADMIN
      );
    }
  }

  const updateData: userRepo.UpdateUserData = {};
  if (typeof body.name === 'string') updateData.name = body.name.trim();
  if (typeof body.gender === 'string') updateData.gender = body.gender.trim();
  if (body.birthDate === null) {
    updateData.birthDate = null;
  } else if (typeof body.birthDate === 'string' && body.birthDate) {
    updateData.birthDate = new Date(body.birthDate);
  }
  if (typeof body.email === 'string') updateData.email = body.email.trim();
  if (typeof body.role === 'string') updateData.role = body.role.trim();

  const updated = await userRepo.updateUser(id, updateData);

  if (req.auditContext) {
    req.auditContext.params = {
      targetUsername: existing.username,
      changes: Object.keys(updateData),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _password, ...userWithoutPassword } = updated;
  res.json(userWithoutPassword);
}

export async function lockUserHandler(req: Request, res: Response): Promise<void> {
  const id = getStringParam(req, 'id');
  const user = await userRepo.findUserById(id);
  await userService.lockUser(id);
  if (req.auditContext && user) {
    req.auditContext.params = { targetUsername: user.username };
  }
  res.json({ success: true });
}

export async function unlockUserHandler(req: Request, res: Response): Promise<void> {
  const id = getStringParam(req, 'id');
  const user = await userRepo.findUserById(id);
  await userService.unlockUser(id);
  if (req.auditContext && user) {
    req.auditContext.params = { targetUsername: user.username };
  }
  res.json({ success: true });
}

export async function deleteUserHandler(req: Request, res: Response): Promise<void> {
  const id = getStringParam(req, 'id');

  const user = await userRepo.findUserById(id);

  // Find an admin user to reassign resources to
  const adminUser = await userRepo.findFirstAdmin();

  if (!adminUser) {
    throw new ValidationError('No admin user found to reassign resources');
  }

  await userService.deleteUserById(id, adminUser.id);

  if (req.auditContext && user) {
    req.auditContext.params = { targetUsername: user.username };
  }

  res.json(null);
}
