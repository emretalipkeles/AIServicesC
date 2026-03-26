import { eq } from 'drizzle-orm';
import { db } from '../database';
import { users } from '@shared/schema';
import type { IUserRepository, IAuthUser } from '../../domain/auth/interfaces/IUserRepository';

export class DrizzleUserRepository implements IUserRepository {
  async findByEmail(email: string): Promise<IAuthUser | null> {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user ?? null;
  }

  async findById(id: string): Promise<IAuthUser | null> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user ?? null;
  }

  async findAll(): Promise<IAuthUser[]> {
    return db.select().from(users);
  }

  async create(data: Omit<IAuthUser, 'id' | 'createdAt' | 'updatedAt'>): Promise<IAuthUser> {
    const [user] = await db.insert(users).values({
      email: data.email,
      name: data.name,
      password: data.password,
      role: data.role,
    }).returning();
    return user;
  }

  async update(id: string, data: Partial<Pick<IAuthUser, 'email' | 'name' | 'password' | 'role'>>): Promise<IAuthUser | null> {
    const [user] = await db.update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }
}
