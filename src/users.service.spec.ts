import * as bcrypt from 'bcrypt';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

function makePrisma(user: unknown = { id: 'user-1', passwordHash: 'old-hash' }) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

describe('UsersService.resetPassword', () => {
  it("hashes the new password and updates only the user's passwordHash", async () => {
    const prisma = makePrisma();
    const service = new UsersService(prisma as never, {} as never);

    const result = await service.resetPassword('user-1', 'brand-new-password');

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const [[call]] = prisma.user.update.mock.calls;
    expect(call.where).toEqual({ id: 'user-1' });
    expect(Object.keys(call.data)).toEqual(['passwordHash']);
    expect(call.data.passwordHash).not.toBe('brand-new-password');
    await expect(bcrypt.compare('brand-new-password', call.data.passwordHash)).resolves.toBe(true);
    expect(result).toEqual({ success: true });
  });

  it('does not require the current password', async () => {
    const prisma = makePrisma();
    const service = new UsersService(prisma as never, {} as never);
    await expect(service.resetPassword('user-1', 'brand-new-password')).resolves.toBeDefined();
  });

  it('throws NotFoundException when the user does not exist', async () => {
    const prisma = makePrisma(null);
    const service = new UsersService(prisma as never, {} as never);
    await expect(service.resetPassword('missing', 'brand-new-password')).rejects.toThrow(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
