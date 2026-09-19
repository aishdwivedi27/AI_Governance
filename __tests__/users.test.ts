// __tests__/users.test.ts
import {
  findUserByEmail,
  findUserById,
  createUser,
  updateUserPassword,
  listUsers,
  deleteUser,
} from '../lib/users';
import { prisma } from '../lib/prisma';

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as unknown as {
  user: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

function toRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: overrides.id ?? 'user-1',
    email: overrides.email ?? 'user@example.com',
    passwordHash: overrides.passwordHash ?? 'hashed',
    isSeedUser: overrides.isSeedUser ?? false,
    createdByUserId: overrides.createdByUserId ?? null,
    createdAt: overrides.createdAt ?? new Date('2024-01-01T00:00:00Z'),
    updatedAt: overrides.updatedAt ?? new Date('2024-01-01T00:00:00Z'),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('findUserByEmail', () => {
  it('normalizes email casing and returns passwordHash', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(toRow({ email: 'user@example.com' }));

    const result = await findUserByEmail('User@Example.com ');

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
    });
    expect(result).toMatchObject({ email: 'user@example.com', passwordHash: 'hashed' });
  });

  it('returns null when no user found', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    expect(await findUserByEmail('nobody@example.com')).toBeNull();
  });
});

describe('findUserById', () => {
  it('returns a UserRecord without passwordHash', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(toRow({ id: 'user-1' }));
    const result = await findUserById('user-1');
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).toMatchObject({ id: 'user-1' });
  });
});

describe('createUser', () => {
  it('normalizes email and defaults isSeedUser/createdByUserId', async () => {
    mockPrisma.user.create.mockResolvedValueOnce(toRow({ email: 'new@example.com' }));

    await createUser({ email: 'New@Example.com', passwordHash: 'h' });

    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'new@example.com',
        passwordHash: 'h',
        isSeedUser: false,
        createdByUserId: null,
      },
    });
  });

  it('passes through isSeedUser and createdByUserId when provided', async () => {
    mockPrisma.user.create.mockResolvedValueOnce(toRow());
    await createUser({
      email: 'seed@example.com',
      passwordHash: 'h',
      isSeedUser: true,
      createdByUserId: 'admin-1',
    });
    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'seed@example.com',
        passwordHash: 'h',
        isSeedUser: true,
        createdByUserId: 'admin-1',
      },
    });
  });
});

describe('updateUserPassword', () => {
  it('updates the passwordHash for the given id', async () => {
    mockPrisma.user.update.mockResolvedValueOnce(toRow());
    await updateUserPassword('user-1', 'new-hash');
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: 'new-hash' },
    });
  });
});

describe('listUsers', () => {
  it('returns all users ordered by createdAt without passwordHash', async () => {
    mockPrisma.user.findMany.mockResolvedValueOnce([toRow({ id: 'a' }), toRow({ id: 'b' })]);
    const result = await listUsers();
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'asc' } });
    expect(result).toHaveLength(2);
    expect(result[0]).not.toHaveProperty('passwordHash');
  });
});

describe('deleteUser', () => {
  it('deletes the user by id', async () => {
    mockPrisma.user.delete.mockResolvedValueOnce(toRow());
    await deleteUser('user-1');
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
  });
});
