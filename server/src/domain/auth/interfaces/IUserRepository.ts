export interface IAuthUser {
  id: string;
  email: string;
  name: string;
  password: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserRepository {
  findByEmail(email: string): Promise<IAuthUser | null>;
  findById(id: string): Promise<IAuthUser | null>;
  findAll(): Promise<IAuthUser[]>;
  create(user: Omit<IAuthUser, 'id' | 'createdAt' | 'updatedAt'>): Promise<IAuthUser>;
  update(id: string, data: Partial<Pick<IAuthUser, 'email' | 'name' | 'password' | 'role'>>): Promise<IAuthUser | null>;
  delete(id: string): Promise<boolean>;
}
