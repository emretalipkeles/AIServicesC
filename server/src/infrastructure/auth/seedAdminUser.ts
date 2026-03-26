import type { IUserRepository } from '../../domain/auth/interfaces/IUserRepository';
import type { IPasswordHasher } from '../../domain/auth/interfaces/IPasswordHasher';

const ADMIN_EMAIL = 'emre.keles@axiompmp.com';
const ADMIN_NAME = 'Emre Keles';
const ADMIN_PASSWORD = '123456';

export async function seedAdminUser(
  userRepository: IUserRepository,
  passwordHasher: IPasswordHasher,
): Promise<void> {
  const existing = await userRepository.findByEmail(ADMIN_EMAIL);
  if (existing) {
    console.log('[Auth] Admin user already exists, skipping seed');
    return;
  }

  const hashedPassword = await passwordHasher.hash(ADMIN_PASSWORD);
  await userRepository.create({
    email: ADMIN_EMAIL,
    name: ADMIN_NAME,
    password: hashedPassword,
    role: 'admin',
  });
  console.log(`[Auth] Admin user seeded: ${ADMIN_EMAIL}`);
}
