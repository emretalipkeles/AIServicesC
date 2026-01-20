export interface IRepository<T, TId = string> {
  findById(id: TId, tenantId?: string): Promise<T | null>;
  save(entity: T): Promise<void>;
  delete(id: TId, tenantId?: string): Promise<void>;
}

export interface IReadRepository<T, TId = string> {
  findById(id: TId, tenantId?: string): Promise<T | null>;
  findAll(tenantId?: string): Promise<T[]>;
}

export interface IWriteRepository<T, TId = string> {
  save(entity: T): Promise<void>;
  delete(id: TId, tenantId?: string): Promise<void>;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface PaginationOptions {
  page: number;
  pageSize: number;
}
