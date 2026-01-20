# Software Engineering Principles & Architecture Guide

This document outlines the core software engineering principles and architectural patterns that guide all backend development in this project. These principles ensure code quality, maintainability, scalability, and professional-grade enterprise software.

---

## Part 1: Fundamental Principles

### 1. KISS (Keep It Simple, Stupid)

**Strive for simplicity in design and implementation**

- Avoid unnecessary complexity that can hinder understanding and maintainability
- Focus on creating clean, readable, and concise code
- Choose straightforward solutions over clever but hard-to-understand implementations

**Example:**
```typescript
// GOOD: Simple and clear
function getUserById(id: string) {
  return storage.getUser(id);
}

// BAD: Unnecessarily complex
function getUserById(id: string) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(storage.getUser(id)), 0);
  });
}
```

---

### 2. DRY (Don't Repeat Yourself)

**Eliminate redundancy in code and processes**

- Promote code reuse and modular design to improve efficiency and reduce errors
- Centralize common functionalities and avoid duplication
- Extract repeated patterns into reusable functions or modules

**Example:**
```typescript
// GOOD: Centralized error handling
function handleApiError(res, error, context) {
  console.error(`Error in ${context}:`, error);
  res.status(500).json({ 
    success: false, 
    error: `Failed to ${context}`,
    details: error.message 
  });
}

// BAD: Repeated error handling in every route
app.get('/api/users', (req, res) => {
  try {
    // logic
  } catch (error) {
    console.error('Error in users:', error);
    res.status(500).json({ success: false, error: 'Failed to get users' });
  }
});
```

---

### 3. YAGNI (You Aren't Gonna Need It)

**Implement features that are currently required and avoid over-engineering**

- Resist the temptation to add unnecessary functionality that may never be used
- Focus on delivering value incrementally and iteratively
- Add features only when they are actually needed, not when you think they might be needed

**Example:**
```typescript
// GOOD: Build what's needed now
interface User {
  id: string;
  username: string;
  email: string;
}

// BAD: Over-engineering for hypothetical future needs
interface User {
  id: string;
  username: string;
  email: string;
  preferences?: UserPreferences;
  settings?: UserSettings;
  metadata?: Record<string, any>;
  customFields?: CustomField[];
  // ... features we don't actually use yet
}
```

---

### 4. Separation of Concerns

**Divide software into distinct, independent modules or components**

- Each module should have a clear responsibility and minimal overlap with others
- Promote loose coupling and high cohesion for maintainability and scalability
- Keep routing logic separate from business logic separate from data access

**Example:**
```typescript
// GOOD: Separated concerns
// routes.ts - routing only
app.post('/api/reports', async (req, res) => {
  const report = await reportService.generateReport(req.body);
  res.json(report);
});

// services/reports.ts - business logic
export async function generateReport(data) {
  const validated = validateReportData(data);
  return await storage.createReport(validated);
}

// BAD: Everything mixed together
app.post('/api/reports', async (req, res) => {
  // validation, business logic, database access all in route handler
});
```

---

### 5. Modularity

**Design software as a collection of interchangeable, reusable modules**

- Encapsulate related functionalities into self-contained units
- Enable easy modification, testing, and replacement of individual modules
- Each module should have a clear interface and minimal dependencies

**Example:**
```typescript
// GOOD: Modular structure
server/
├── middleware/
│   └── auth.ts         // Authentication module
├── services/
│   ├── reports.ts      // Report generation module
│   └── dimensions.ts   // Dimension population module
└── routes.ts           // Routing module

// BAD: Monolithic structure
server/
└── routes.ts           // Everything in one 2300-line file
```

---

## Part 2: SOLID Principles

### 6. Single Responsibility Principle (SRP)

**Each module, class, or function should have a single, well-defined responsibility**

- Avoid mixing multiple concerns within a single unit of code
- Facilitate understanding, testing, and maintenance of the codebase
- If you can describe what a module does with "and", it probably has too many responsibilities

**Example:**
```typescript
// GOOD: Single responsibility
class JWTAuthenticator {
  verify(token: string) { /* only handles JWT verification */ }
}

class PerformanceMetricsService {
  insert(metrics: Metric[]) { /* only handles metrics insertion */ }
}

// BAD: Multiple responsibilities
class PerformanceMetricsHandler {
  verifyJWT(token: string) { /* authentication */ }
  validateMetrics(metrics: Metric[]) { /* validation */ }
  insertMetrics(metrics: Metric[]) { /* data access */ }
  generateReport() { /* reporting */ }
}
```

---

### 7. Open-Closed Principle (OCP)

**Software entities should be open for extension but closed for modification**

- Encourage the use of abstractions and interfaces to enable extensibility
- Minimize the impact of changes on existing code
- Add new functionality by extending existing code, not modifying it

**Example:**
```typescript
// GOOD: Open for extension
interface StorageAdapter {
  save(data: any): Promise<void>;
  load(id: string): Promise<any>;
}

class MemStorage implements StorageAdapter { /* ... */ }
class PostgresStorage implements StorageAdapter { /* ... */ }

// Add new storage without changing existing code
class RedisStorage implements StorageAdapter { /* ... */ }

// BAD: Requires modification to add new storage types
function saveData(data: any, type: 'memory' | 'postgres') {
  if (type === 'memory') { /* ... */ }
  else if (type === 'postgres') { /* ... */ }
  // Must modify this function to add Redis support
}
```

---

### 8. Liskov Substitution Principle (LSP)

**Subtypes should be substitutable for their base types without affecting correctness**

- Ensure that derived classes adhere to the contract of their parent classes
- Maintain behavioral consistency and avoid unexpected side effects
- Child classes should extend, not replace, parent behavior

**Example:**
```typescript
// GOOD: Substitutable
interface ReportGenerator {
  generate(data: any): Promise<Report>;
}

class PDFReportGenerator implements ReportGenerator {
  generate(data: any): Promise<Report> {
    // Returns a Report, as promised
    return generatePDFReport(data);
  }
}

// Any code expecting ReportGenerator can use PDFReportGenerator

// BAD: Violates LSP
class BrokenReportGenerator implements ReportGenerator {
  generate(data: any): Promise<Report> {
    throw new Error("Not implemented"); // Breaks the contract
  }
}
```

---

### 9. Interface Segregation Principle (ISP)

**Clients should not be forced to depend on interfaces they do not use**

- Split large interfaces into smaller, more specific ones
- Promote loose coupling and improve modularity
- Create focused, cohesive interfaces

**Example:**
```typescript
// GOOD: Segregated interfaces
interface Readable {
  read(id: string): Promise<any>;
}

interface Writable {
  write(data: any): Promise<void>;
}

interface Deletable {
  delete(id: string): Promise<void>;
}

class ReadOnlyStorage implements Readable {
  read(id: string) { /* ... */ }
  // Not forced to implement write/delete
}

// BAD: Fat interface
interface Storage {
  read(id: string): Promise<any>;
  write(data: any): Promise<void>;
  delete(id: string): Promise<void>;
  update(id: string, data: any): Promise<void>;
  // ReadOnlyStorage forced to implement all methods
}
```

---

### 10. Dependency Inversion Principle (DIP)

**High-level modules should depend on abstractions, not concrete implementations**

- Invert the dependency flow to make code more flexible and testable
- Utilize dependency injection and interfaces to decouple modules
- Depend on interfaces/abstractions, not concrete classes

**Example:**
```typescript
// GOOD: Depends on abstraction
class ReportService {
  constructor(private storage: IStorage) { }
  
  async generateReport(data: any) {
    return await this.storage.createReport(data);
  }
}

// Can inject any storage implementation
const service = new ReportService(new MemStorage());
const service2 = new ReportService(new PostgresStorage());

// BAD: Depends on concrete implementation
class ReportService {
  private storage = new MemStorage(); // Hard-coded dependency
  
  async generateReport(data: any) {
    return await this.storage.createReport(data);
  }
}
```

---

## Part 3: Clean Architecture

### 11. Clean Architecture Layers

**Organize code into concentric layers with strict dependency rules**

Clean Architecture ensures that business logic is independent of frameworks, databases, and external systems. Dependencies always point inward toward the domain.

**The Four Layers:**

```
┌─────────────────────────────────────────────┐
│        1. Entities (Domain Layer)           │  ← Core business logic
│         - Business models                   │
│         - Domain rules                      │
│         - Enterprise logic                  │
└─────────────────────────────────────────────┘
                    ↑
┌─────────────────────────────────────────────┐
│     2. Use Cases (Application Layer)        │  ← Application business rules
│         - Application logic                 │
│         - Orchestration                     │
│         - DTOs, Commands, Queries           │
└─────────────────────────────────────────────┘
                    ↑
┌─────────────────────────────────────────────┐
│  3. Interface Adapters (Presentation)       │  ← Conversion layer
│         - Controllers                       │
│         - Presenters                        │
│         - ViewModels                        │
└─────────────────────────────────────────────┘
                    ↑
┌─────────────────────────────────────────────┐
│  4. Frameworks & Drivers (Infrastructure)   │  ← External concerns
│         - Database                          │
│         - Web framework                     │
│         - External APIs                     │
└─────────────────────────────────────────────┘
```

**Key Rules:**
- **Dependency Rule**: Dependencies can only point inward. Inner layers know nothing about outer layers
- **Entities**: Contain enterprise-wide business rules and models
- **Use Cases**: Contain application-specific business rules
- **Interface Adapters**: Convert data between use cases and external systems
- **Frameworks & Drivers**: External tools and frameworks

**Project Structure:**
```typescript
src/
├── domain/                      // Layer 1: Entities
│   ├── entities/
│   │   ├── User.ts
│   │   ├── Report.ts
│   │   └── Invoice.ts
│   ├── value-objects/
│   │   ├── Email.ts
│   │   ├── Money.ts
│   │   └── TenantId.ts
│   └── repositories/            // Interfaces only (implemented in infrastructure)
│       ├── IUserRepository.ts
│       └── IReportRepository.ts
│
├── application/                 // Layer 2: Use Cases
│   ├── use-cases/
│   │   ├── reports/
│   │   │   ├── GenerateReportUseCase.ts
│   │   │   └── GetReportByIdUseCase.ts
│   │   └── users/
│   │       ├── CreateUserUseCase.ts
│   │       └── AuthenticateUserUseCase.ts
│   ├── commands/                // CQRS Commands
│   │   ├── CreateReportCommand.ts
│   │   └── UpdateUserCommand.ts
│   ├── queries/                 // CQRS Queries
│   │   ├── GetReportQuery.ts
│   │   └── ListUsersQuery.ts
│   └── dto/
│       ├── ReportDto.ts
│       └── UserDto.ts
│
├── presentation/                // Layer 3: Interface Adapters
│   ├── controllers/
│   │   ├── ReportController.ts
│   │   └── UserController.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   ├── tenantIsolation.ts
│   │   └── errorHandler.ts
│   └── validators/
│       ├── reportValidator.ts
│       └── userValidator.ts
│
└── infrastructure/              // Layer 4: Frameworks & Drivers
    ├── database/
    │   ├── repositories/        // Concrete implementations
    │   │   ├── PostgresUserRepository.ts
    │   │   └── PostgresReportRepository.ts
    │   ├── migrations/
    │   └── seeds/
    ├── external-services/
    │   ├── EmailService.ts
    │   └── PaymentGateway.ts
    ├── web/
    │   ├── express-app.ts
    │   └── routes.ts
    └── config/
        ├── database.config.ts
        └── app.config.ts
```

**Example Implementation:**

```typescript
// domain/entities/Report.ts (Layer 1)
export class Report {
  constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly title: string,
    public readonly data: ReportData,
    private createdAt: Date
  ) {
    this.validate();
  }

  private validate() {
    if (!this.title || this.title.length < 3) {
      throw new Error('Report title must be at least 3 characters');
    }
  }

  // Domain logic - belongs here
  public isExpired(): boolean {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return this.createdAt < thirtyDaysAgo;
  }
}

// domain/repositories/IReportRepository.ts (Layer 1)
export interface IReportRepository {
  findById(id: string, tenantId: string): Promise<Report | null>;
  save(report: Report): Promise<void>;
  delete(id: string, tenantId: string): Promise<void>;
}

// application/use-cases/reports/GenerateReportUseCase.ts (Layer 2)
export class GenerateReportUseCase {
  constructor(
    private reportRepository: IReportRepository,
    private dimensionService: IDimensionService
  ) {}

  async execute(command: GenerateReportCommand): Promise<ReportDto> {
    // Application business logic
    const dimensions = await this.dimensionService.populate(command.data);
    
    const report = new Report(
      generateId(),
      command.tenantId,
      command.title,
      { ...command.data, dimensions },
      new Date()
    );

    await this.reportRepository.save(report);

    return this.toDto(report);
  }

  private toDto(report: Report): ReportDto {
    return {
      id: report.id,
      title: report.title,
      createdAt: report.createdAt
    };
  }
}

// presentation/controllers/ReportController.ts (Layer 3)
export class ReportController {
  constructor(private generateReportUseCase: GenerateReportUseCase) {}

  async create(req: Request, res: Response) {
    try {
      const command = new GenerateReportCommand(
        req.body.tenantId,
        req.body.title,
        req.body.data
      );

      const result = await this.generateReportUseCase.execute(command);
      
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

// infrastructure/database/repositories/PostgresReportRepository.ts (Layer 4)
export class PostgresReportRepository implements IReportRepository {
  constructor(private db: PostgresDatabase) {}

  async findById(id: string, tenantId: string): Promise<Report | null> {
    const row = await this.db.query(
      'SELECT * FROM reports WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (!row) return null;

    return new Report(
      row.id,
      row.tenant_id,
      row.title,
      row.data,
      row.created_at
    );
  }

  async save(report: Report): Promise<void> {
    await this.db.query(
      'INSERT INTO reports (id, tenant_id, title, data, created_at) VALUES ($1, $2, $3, $4, $5)',
      [report.id, report.tenantId, report.title, report.data, report.createdAt]
    );
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await this.db.query(
      'DELETE FROM reports WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
  }
}
```

**Benefits:**
- ✅ Business logic is independent of frameworks and databases
- ✅ Easy to test (mock outer layers)
- ✅ Can swap databases or frameworks without touching business logic
- ✅ Clear separation of concerns across layers

---

## Part 4: CQRS Pattern

### 12. CQRS (Command Query Responsibility Segregation)

**Separate read and write operations into distinct models**

CQRS separates commands (write operations that change state) from queries (read operations that return data). This allows optimization of each independently.

**Core Concepts:**
- **Commands**: Change state, return void or minimal acknowledgment
- **Queries**: Read state, never modify data
- **Separate Models**: Different models for reads and writes
- **Eventual Consistency**: Accept that read models may lag behind write models

**When to Use CQRS:**
- ✅ Different read and write scalability requirements
- ✅ Complex business logic on writes
- ✅ Need for optimized, denormalized read models
- ✅ High-performance requirements
- ✅ Event-sourced systems

**When NOT to Use CQRS:**
- ❌ Simple CRUD applications
- ❌ Low complexity domains
- ❌ Team unfamiliar with the pattern
- ❌ Strong consistency required everywhere

**Project Structure with CQRS:**

```typescript
src/
├── application/
│   ├── commands/               // Write side
│   │   ├── handlers/
│   │   │   ├── CreateReportCommandHandler.ts
│   │   │   └── UpdateUserCommandHandler.ts
│   │   └── models/
│   │       ├── CreateReportCommand.ts
│   │       └── UpdateUserCommand.ts
│   │
│   └── queries/                // Read side
│       ├── handlers/
│       │   ├── GetReportQueryHandler.ts
│       │   └── ListUsersQueryHandler.ts
│       └── models/
│           ├── GetReportQuery.ts
│           └── ListUsersQuery.ts
│
├── domain/
│   ├── write-models/           // Optimized for writes
│   │   ├── Report.ts
│   │   └── User.ts
│   └── read-models/            // Optimized for reads
│       ├── ReportListItem.ts
│       └── UserProfile.ts
│
└── infrastructure/
    ├── write-repositories/     // Write to normalized tables
    │   ├── ReportWriteRepository.ts
    │   └── UserWriteRepository.ts
    └── read-repositories/      // Read from denormalized views
        ├── ReportReadRepository.ts
        └── UserReadRepository.ts
```

**Example Implementation:**

```typescript
// application/commands/models/CreateReportCommand.ts
export class CreateReportCommand {
  constructor(
    public readonly tenantId: string,
    public readonly title: string,
    public readonly data: any
  ) {}
}

// application/commands/handlers/CreateReportCommandHandler.ts
export class CreateReportCommandHandler {
  constructor(
    private reportWriteRepository: IReportWriteRepository,
    private eventBus: IEventBus
  ) {}

  async handle(command: CreateReportCommand): Promise<string> {
    // Validation
    if (!command.title || command.title.length < 3) {
      throw new ValidationError('Title must be at least 3 characters');
    }

    // Create domain entity
    const report = Report.create(
      command.tenantId,
      command.title,
      command.data
    );

    // Persist
    await this.reportWriteRepository.save(report);

    // Publish domain event for read model updates
    await this.eventBus.publish(new ReportCreatedEvent(report));

    // Return only the ID
    return report.id;
  }
}

// application/queries/models/GetReportQuery.ts
export class GetReportQuery {
  constructor(
    public readonly reportId: string,
    public readonly tenantId: string
  ) {}
}

// application/queries/handlers/GetReportQueryHandler.ts
export class GetReportQueryHandler {
  constructor(private reportReadRepository: IReportReadRepository) {}

  async handle(query: GetReportQuery): Promise<ReportDto> {
    // Query optimized read model
    const report = await this.reportReadRepository.findById(
      query.reportId,
      query.tenantId
    );

    if (!report) {
      throw new NotFoundError('Report not found');
    }

    return report; // Already in DTO format from read model
  }
}

// application/queries/models/ListReportsQuery.ts
export class ListReportsQuery {
  constructor(
    public readonly tenantId: string,
    public readonly filters: {
      startDate?: Date;
      endDate?: Date;
      status?: string;
    },
    public readonly pagination: {
      page: number;
      pageSize: number;
    }
  ) {}
}

// application/queries/handlers/ListReportsQueryHandler.ts
export class ListReportsQueryHandler {
  constructor(private reportReadRepository: IReportReadRepository) {}

  async handle(query: ListReportsQuery): Promise<PaginatedResult<ReportListItemDto>> {
    // Query denormalized, optimized view
    const result = await this.reportReadRepository.list(
      query.tenantId,
      query.filters,
      query.pagination
    );

    return result;
  }
}

// presentation/controllers/ReportController.ts
export class ReportController {
  constructor(
    private commandBus: ICommandBus,
    private queryBus: IQueryBus
  ) {}

  // Command endpoint
  async create(req: Request, res: Response) {
    const command = new CreateReportCommand(
      req.user.tenantId,
      req.body.title,
      req.body.data
    );

    const reportId = await this.commandBus.execute(command);

    // Return 201 with location header
    res.status(201).json({ id: reportId });
  }

  // Query endpoint
  async getById(req: Request, res: Response) {
    const query = new GetReportQuery(
      req.params.id,
      req.user.tenantId
    );

    const report = await this.queryBus.execute(query);

    res.json(report);
  }

  // Query endpoint with filters
  async list(req: Request, res: Response) {
    const query = new ListReportsQuery(
      req.user.tenantId,
      {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        status: req.query.status
      },
      {
        page: parseInt(req.query.page) || 1,
        pageSize: parseInt(req.query.pageSize) || 20
      }
    );

    const result = await this.queryBus.execute(query);

    res.json(result);
  }
}

// infrastructure/read-repositories/PostgresReportReadRepository.ts
export class PostgresReportReadRepository implements IReportReadRepository {
  constructor(private db: PostgresDatabase) {}

  async findById(id: string, tenantId: string): Promise<ReportDto | null> {
    // Query from denormalized view for fast reads
    const row = await this.db.query(`
      SELECT 
        r.id,
        r.title,
        r.status,
        r.created_at,
        u.name as created_by_name,
        COUNT(rd.id) as data_points
      FROM reports_view r
      LEFT JOIN users u ON r.created_by = u.id
      LEFT JOIN report_data rd ON r.id = rd.report_id
      WHERE r.id = $1 AND r.tenant_id = $2
      GROUP BY r.id, u.name
    `, [id, tenantId]);

    return row ? this.mapToDto(row) : null;
  }

  async list(
    tenantId: string,
    filters: any,
    pagination: any
  ): Promise<PaginatedResult<ReportListItemDto>> {
    // Use materialized view or denormalized table for fast list queries
    const query = `
      SELECT * FROM reports_list_view
      WHERE tenant_id = $1
      ${filters.startDate ? 'AND created_at >= $2' : ''}
      ${filters.status ? 'AND status = $3' : ''}
      ORDER BY created_at DESC
      LIMIT $4 OFFSET $5
    `;

    const rows = await this.db.query(query, [
      tenantId,
      filters.startDate,
      filters.status,
      pagination.pageSize,
      (pagination.page - 1) * pagination.pageSize
    ]);

    return {
      items: rows.map(row => this.mapToListItemDto(row)),
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalCount: await this.getTotalCount(tenantId, filters)
    };
  }
}
```

**CQRS with Event Sourcing (Advanced):**

```typescript
// domain/events/ReportCreatedEvent.ts
export class ReportCreatedEvent {
  constructor(
    public readonly reportId: string,
    public readonly tenantId: string,
    public readonly title: string,
    public readonly occurredAt: Date
  ) {}
}

// infrastructure/event-handlers/ReportCreatedEventHandler.ts
export class ReportCreatedEventHandler {
  constructor(private readModelUpdater: IReadModelUpdater) {}

  async handle(event: ReportCreatedEvent): Promise<void> {
    // Update denormalized read model
    await this.readModelUpdater.updateReportListView(event);
    await this.readModelUpdater.updateDashboardStatistics(event);
  }
}
```

**Benefits of CQRS:**
- ✅ Optimized read and write models independently
- ✅ Scalability: Can scale reads and writes separately
- ✅ Simplified queries: No complex joins needed
- ✅ Better performance: Denormalized read models
- ✅ Clear intent: Commands vs Queries

**Challenges:**
- ⚠️ Increased complexity
- ⚠️ Eventual consistency
- ⚠️ More code to maintain
- ⚠️ Data synchronization overhead

---

## Part 5: Additional Enterprise Patterns

### 13. Repository Pattern

**Abstract data access behind a collection-like interface**

The Repository pattern mediates between the domain and data mapping layers, acting like an in-memory collection of domain objects.

```typescript
// domain/repositories/IUserRepository.ts
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByTenant(tenantId: string): Promise<User[]>;
  save(user: User): Promise<void>;
  delete(id: string): Promise<void>;
}

// Benefits:
// - Domain layer doesn't know about database
// - Easy to swap implementations
// - Testable with in-memory implementation
```

---

### 14. Unit of Work Pattern

**Maintain a list of objects affected by a business transaction and coordinate the writing out of changes**

```typescript
export interface IUnitOfWork {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  
  // Repositories
  users: IUserRepository;
  reports: IReportRepository;
  invoices: IInvoiceRepository;
}

// Usage in Use Case
async execute(command: CreateInvoiceCommand): Promise<string> {
  const uow = await this.unitOfWorkFactory.create();
  
  try {
    await uow.begin();
    
    // Multiple operations in single transaction
    const invoice = Invoice.create(command.data);
    await uow.invoices.save(invoice);
    
    const notification = Notification.create(invoice);
    await uow.notifications.save(notification);
    
    await uow.commit();
    return invoice.id;
  } catch (error) {
    await uow.rollback();
    throw error;
  }
}
```

---

### 15. Domain Events

**Use events to trigger side effects and maintain loose coupling**

```typescript
// domain/events/InvoiceCreatedEvent.ts
export class InvoiceCreatedEvent {
  constructor(
    public readonly invoiceId: string,
    public readonly customerId: string,
    public readonly amount: number,
    public readonly occurredAt: Date
  ) {}
}

// domain/entities/Invoice.ts
export class Invoice {
  private _events: DomainEvent[] = [];

  static create(data: CreateInvoiceData): Invoice {
    const invoice = new Invoice(/* ... */);
    invoice.addEvent(new InvoiceCreatedEvent(/* ... */));
    return invoice;
  }

  getEvents(): DomainEvent[] {
    return [...this._events];
  }

  clearEvents(): void {
    this._events = [];
  }
}

// application/use-cases/CreateInvoiceUseCase.ts
async execute(command: CreateInvoiceCommand): Promise<string> {
  const invoice = Invoice.create(command.data);
  
  await this.invoiceRepository.save(invoice);
  
  // Publish domain events
  const events = invoice.getEvents();
  for (const event of events) {
    await this.eventBus.publish(event);
  }
  
  return invoice.id;
}
```

---

### 16. Specification Pattern

**Encapsulate business rules as reusable objects**

```typescript
// domain/specifications/ISpecification.ts
export interface ISpecification<T> {
  isSatisfiedBy(candidate: T): boolean;
  and(other: ISpecification<T>): ISpecification<T>;
  or(other: ISpecification<T>): ISpecification<T>;
  not(): ISpecification<T>;
}

// domain/specifications/InvoiceOverdueSpecification.ts
export class InvoiceOverdueSpecification implements ISpecification<Invoice> {
  isSatisfiedBy(invoice: Invoice): boolean {
    const today = new Date();
    return invoice.dueDate < today && !invoice.isPaid;
  }
}

// domain/specifications/InvoiceHighValueSpecification.ts
export class InvoiceHighValueSpecification implements ISpecification<Invoice> {
  constructor(private threshold: number) {}
  
  isSatisfiedBy(invoice: Invoice): boolean {
    return invoice.amount >= this.threshold;
  }
}

// Usage
const overdueSpec = new InvoiceOverdueSpecification();
const highValueSpec = new InvoiceHighValueSpecification(10000);

// Combine specifications
const criticalInvoiceSpec = overdueSpec.and(highValueSpec);

if (criticalInvoiceSpec.isSatisfiedBy(invoice)) {
  // Send urgent notification
}
```

---

## Part 6: Quality & Testing Principles

### 17. Test-Driven Development (TDD)

**Write tests before implementation**

- Write failing test first (Red)
- Write minimal code to pass (Green)
- Refactor for quality (Refactor)

```typescript
// 1. RED: Write failing test
describe('CreateReportUseCase', () => {
  it('should create a report with valid data', async () => {
    const useCase = new CreateReportUseCase(mockRepository);
    const command = new CreateReportCommand('tenant-1', 'Q4 Report', data);
    
    const result = await useCase.execute(command);
    
    expect(result).toBeDefined();
    expect(result.title).toBe('Q4 Report');
  });
});

// 2. GREEN: Make it pass
export class CreateReportUseCase {
  async execute(command: CreateReportCommand): Promise<ReportDto> {
    const report = new Report(generateId(), command.tenantId, command.title, command.data);
    await this.repository.save(report);
    return this.toDto(report);
  }
}

// 3. REFACTOR: Improve code quality
```

---

### 18. Testing Pyramid

**Balance different types of tests**

```
           /\
          /  \         E2E Tests (Few)
         /    \        - Full user flows
        /------\       - Slow, expensive
       /        \      
      / Contract \     Integration Tests (Some)
     /  Tests     \    - API contracts
    /              \   - Database interactions
   /----------------\  
  /                  \ Unit Tests (Many)
 /     Unit Tests     \- Pure functions
/______________________\- Business logic
```

**Distribution:**
- 70% Unit Tests (fast, isolated, test business logic)
- 20% Integration Tests (test module interactions)
- 10% E2E Tests (test critical user journeys)

```typescript
// Unit Test (Fast, Isolated)
describe('Report Entity', () => {
  it('should throw error if title is too short', () => {
    expect(() => new Report('id', 'tenant-1', 'ab', data))
      .toThrow('Title must be at least 3 characters');
  });
});

// Integration Test (Database)
describe('PostgresReportRepository', () => {
  it('should save and retrieve report', async () => {
    const report = new Report('id', 'tenant-1', 'Test', data);
    await repository.save(report);
    
    const retrieved = await repository.findById('id', 'tenant-1');
    expect(retrieved).toEqual(report);
  });
});

// E2E Test (Full Flow)
describe('Create Report Flow', () => {
  it('should create report via API', async () => {
    const response = await request(app)
      .post('/api/reports')
      .send({ title: 'Test', data: {} })
      .expect(201);
    
    expect(response.body.id).toBeDefined();
  });
});
```

---

### 19. Dependency Injection

**Explicitly provide dependencies rather than hard-coding them**

```typescript
// BAD: Hard-coded dependencies
class ReportService {
  private repository = new PostgresReportRepository();
  private emailService = new SendGridEmailService();
}

// GOOD: Dependencies injected
class ReportService {
  constructor(
    private repository: IReportRepository,
    private emailService: IEmailService
  ) {}
}

// Usage with DI Container
container.register('IReportRepository', PostgresReportRepository);
container.register('IEmailService', SendGridEmailService);
container.register('ReportService', ReportService);

const service = container.resolve<ReportService>('ReportService');
```

---

## Part 7: Security & Data Integrity

### 20. Multi-Tenant Data Isolation

**Ensure strict tenant data separation**

```typescript
// Always include tenantId in queries
class PostgresReportRepository {
  async findById(id: string, tenantId: string): Promise<Report | null> {
    // ✅ GOOD: Tenant filter in WHERE clause
    const row = await this.db.query(
      'SELECT * FROM reports WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    
    // ❌ BAD: No tenant filter
    // const row = await this.db.query('SELECT * FROM reports WHERE id = $1', [id]);
    
    return row ? this.toDomain(row) : null;
  }
}

// Use Row-Level Security (RLS) in PostgreSQL
CREATE POLICY tenant_isolation ON reports
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

// Set tenant context at connection level
await db.query('SET app.current_tenant = $1', [tenantId]);
```

---

### 21. Input Validation

**Validate all external input at the boundary**

```typescript
// presentation/validators/CreateReportValidator.ts
export class CreateReportValidator {
  validate(input: any): ValidationResult {
    const errors: string[] = [];

    if (!input.title || typeof input.title !== 'string') {
      errors.push('Title is required and must be a string');
    }

    if (input.title && input.title.length < 3) {
      errors.push('Title must be at least 3 characters');
    }

    if (!input.data || typeof input.data !== 'object') {
      errors.push('Data is required and must be an object');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Use in controller
async create(req: Request, res: Response) {
  const validation = this.validator.validate(req.body);
  
  if (!validation.isValid) {
    return res.status(400).json({ errors: validation.errors });
  }
  
  // Continue with validated data
}
```

---

### 22. Idempotency

**Ensure operations can be safely retried**

```typescript
// Use idempotency keys for write operations
export class IdempotentCommandHandler {
  constructor(
    private commandHandler: ICommandHandler,
    private idempotencyStore: IIdempotencyStore
  ) {}

  async handle(command: Command, idempotencyKey: string): Promise<Result> {
    // Check if already processed
    const existing = await this.idempotencyStore.get(idempotencyKey);
    if (existing) {
      return existing.result;
    }

    // Process command
    const result = await this.commandHandler.handle(command);

    // Store result
    await this.idempotencyStore.set(idempotencyKey, {
      command,
      result,
      processedAt: new Date()
    });

    return result;
  }
}

// API usage
POST /api/invoices
Headers:
  Idempotency-Key: uuid-here
Body: { amount: 100, customerId: "cust-1" }
```

---

## Part 8: Observability & Operations

### 23. Structured Logging

**Use consistent, parseable log formats**

```typescript
// infrastructure/logging/Logger.ts
export class Logger {
  info(message: string, context: Record<string, any> = {}) {
    console.log(JSON.stringify({
      level: 'info',
      message,
      timestamp: new Date().toISOString(),
      ...context
    }));
  }

  error(message: string, error: Error, context: Record<string, any> = {}) {
    console.error(JSON.stringify({
      level: 'error',
      message,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      timestamp: new Date().toISOString(),
      ...context
    }));
  }
}

// Usage
logger.info('Report generated', {
  reportId: report.id,
  tenantId: report.tenantId,
  duration: Date.now() - startTime
});
```

---

### 24. Error Handling

**Define clear error hierarchy and handling strategy**

```typescript
// domain/errors/DomainError.ts
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends DomainError {}
export class NotFoundError extends DomainError {}
export class UnauthorizedError extends DomainError {}
export class ConflictError extends DomainError {}

// presentation/middleware/errorHandler.ts
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  logger.error('Request failed', err, {
    path: req.path,
    method: req.method,
    tenantId: req.user?.tenantId
  });

  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message });
  }

  if (err instanceof NotFoundError) {
    return res.status(404).json({ error: err.message });
  }

  if (err instanceof UnauthorizedError) {
    return res.status(401).json({ error: err.message });
  }

  // Default: internal server error
  res.status(500).json({ error: 'Internal server error' });
}
```

---

### 25. Health Checks & Monitoring

**Expose health endpoints for monitoring**

```typescript
// presentation/controllers/HealthController.ts
export class HealthController {
  constructor(
    private db: IDatabase,
    private cache: ICache
  ) {}

  async health(req: Request, res: Response) {
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkCache()
    ]);

    const allHealthy = checks.every(c => c.status === 'healthy');

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks
    });
  }

  private async checkDatabase(): Promise<HealthCheck> {
    try {
      await this.db.query('SELECT 1');
      return { name: 'database', status: 'healthy' };
    } catch (error) {
      return { name: 'database', status: 'unhealthy', error: error.message };
    }
  }

  private async checkCache(): Promise<HealthCheck> {
    try {
      await this.cache.ping();
      return { name: 'cache', status: 'healthy' };
    } catch (error) {
      return { name: 'cache', status: 'unhealthy', error: error.message };
    }
  }
}
```

---

## Part 9: API Design Principles

### 26. RESTful API Design

**Follow REST principles for predictable APIs**

```typescript
// Resource-oriented URLs
GET    /api/reports          // List reports
POST   /api/reports          // Create report
GET    /api/reports/:id      // Get single report
PUT    /api/reports/:id      // Update report (full)
PATCH  /api/reports/:id      // Update report (partial)
DELETE /api/reports/:id      // Delete report

// Nested resources
GET    /api/reports/:id/comments
POST   /api/reports/:id/comments

// Use HTTP status codes correctly
200 OK                  // Success
201 Created             // Resource created
204 No Content          // Success with no body
400 Bad Request         // Client error
401 Unauthorized        // Authentication required
403 Forbidden           // Authorized but not allowed
404 Not Found           // Resource doesn't exist
409 Conflict            // Duplicate or conflict
422 Unprocessable       // Validation error
500 Internal Server     // Server error
```

---

### 27. API Versioning

**Plan for API evolution**

```typescript
// URL versioning (recommended for major changes)
/api/v1/reports
/api/v2/reports

// Header versioning
GET /api/reports
Headers: Accept: application/vnd.myapi.v1+json

// Query parameter versioning
/api/reports?version=1
```

---

## Part 10: Performance & Scalability

### 28. Caching Strategy

**Cache at multiple levels**

```typescript
// application/services/ReportCachingService.ts
export class ReportCachingService {
  constructor(
    private cache: ICache,
    private repository: IReportRepository
  ) {}

  async getById(id: string, tenantId: string): Promise<Report> {
    const cacheKey = `report:${tenantId}:${id}`;
    
    // Try cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Cache miss - get from repository
    const report = await this.repository.findById(id, tenantId);
    if (report) {
      await this.cache.set(cacheKey, JSON.stringify(report), { ttl: 300 });
    }

    return report;
  }

  async invalidate(id: string, tenantId: string): Promise<void> {
    const cacheKey = `report:${tenantId}:${id}`;
    await this.cache.delete(cacheKey);
  }
}
```

---

### 29. Database Optimization

**Optimize queries and indexes**

```sql
-- Create indexes for common queries
CREATE INDEX idx_reports_tenant_created ON reports(tenant_id, created_at DESC);
CREATE INDEX idx_reports_status ON reports(tenant_id, status) WHERE status = 'active';

-- Use materialized views for expensive aggregations
CREATE MATERIALIZED VIEW report_statistics AS
SELECT 
  tenant_id,
  DATE(created_at) as date,
  COUNT(*) as report_count,
  AVG(processing_time) as avg_processing_time
FROM reports
GROUP BY tenant_id, DATE(created_at);

-- Refresh periodically
REFRESH MATERIALIZED VIEW CONCURRENTLY report_statistics;
```

```typescript
// Use pagination for large datasets
async list(tenantId: string, page: number, pageSize: number) {
  const offset = (page - 1) * pageSize;
  
  const query = `
    SELECT * FROM reports
    WHERE tenant_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `;
  
  return await this.db.query(query, [tenantId, pageSize, offset]);
}
```

---

### 30. Graceful Degradation

**Handle failures gracefully**

```typescript
// Circuit breaker pattern
export class CircuitBreaker {
  private failures = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private lastFailureTime?: Date;

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime!.getTime() > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = new Date();
    
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }
}
```

---

## Part 11: Feature-Based Organization

### 31. Organize by Feature, Not by Type

**Within each Clean Architecture layer, organize by business domain/feature, not by technical type**

As your application grows, flat technical folders become unmanageable. Instead of dumping all interfaces, entities, or repositories into single folders, organize by business feature.

**Problem with Type-Based Organization:**
```typescript
// BAD: Everything grouped by technical type
src/
├── domain/
│   ├── entities/
│   │   ├── Report.ts
│   │   ├── Invoice.ts
│   │   ├── User.ts
│   │   ├── AIPrompt.ts
│   │   ├── AIResponse.ts
│   │   ├── Payment.ts
│   │   ├── Customer.ts
│   │   └── ... (50+ files in one folder)
│   └── interfaces/
│       ├── IReportRepository.ts
│       ├── IInvoiceRepository.ts
│       ├── IUserRepository.ts
│       ├── IAIClient.ts
│       ├── IPaymentGateway.ts
│       └── ... (50+ files in one folder)
```

**Problems:**
- ❌ Hard to find related files
- ❌ Difficult to understand feature boundaries
- ❌ Changes to one feature touch multiple folders
- ❌ Can't easily see what belongs together
- ❌ Merge conflicts when multiple developers work on different features

**Solution: Feature-Based Organization:**
```typescript
// GOOD: Organized by business domain/feature
src/
├── domain/
│   ├── reports/                    // Everything about reports
│   │   ├── entities/
│   │   │   ├── Report.ts
│   │   │   └── ReportTemplate.ts
│   │   ├── value-objects/
│   │   │   └── ReportPeriod.ts
│   │   ├── interfaces/
│   │   │   └── IReportRepository.ts
│   │   ├── events/
│   │   │   ├── ReportCreatedEvent.ts
│   │   │   └── ReportGeneratedEvent.ts
│   │   └── specifications/
│   │       └── ReportValidSpecification.ts
│   │
│   ├── invoices/                   // Everything about invoices
│   │   ├── entities/
│   │   │   └── Invoice.ts
│   │   ├── value-objects/
│   │   │   ├── InvoiceNumber.ts
│   │   │   └── InvoiceLineItem.ts
│   │   ├── interfaces/
│   │   │   └── IInvoiceRepository.ts
│   │   └── events/
│   │       └── InvoiceCreatedEvent.ts
│   │
│   ├── ai/                         // Everything about AI features
│   │   ├── entities/
│   │   │   ├── AIPrompt.ts
│   │   │   └── AIResponse.ts
│   │   ├── interfaces/
│   │   │   ├── IAIClient.ts
│   │   │   └── IPromptRepository.ts
│   │   └── value-objects/
│   │       └── AIModel.ts
│   │
│   └── users/                      // Everything about users
│       ├── entities/
│       │   └── User.ts
│       ├── value-objects/
│       │   └── Email.ts
│       └── interfaces/
│           └── IUserRepository.ts
```

**Benefits:**
- ✅ All related code lives together
- ✅ Easy to find everything about a feature
- ✅ Clear feature boundaries
- ✅ Team members can work on different features without conflicts
- ✅ Easy to extract features into microservices later
- ✅ New developers can understand one feature at a time

**Apply This to ALL Layers:**

```typescript
src/
├── domain/
│   ├── reports/          // Feature folder
│   ├── invoices/         // Feature folder
│   └── ai/               // Feature folder
│
├── application/
│   ├── reports/          // Feature folder
│   │   ├── commands/
│   │   ├── queries/
│   │   └── services/
│   ├── invoices/         // Feature folder
│   └── ai/               // Feature folder
│
├── presentation/
│   ├── controllers/
│   │   ├── reports/      // Feature folder
│   │   ├── invoices/     // Feature folder
│   │   └── ai/           // Feature folder
│   └── validators/
│       ├── reports/      // Feature folder
│       ├── invoices/     // Feature folder
│       └── ai/           // Feature folder
│
└── infrastructure/
    ├── database/
    │   ├── repositories/
    │   │   ├── reports/  // Feature folder
    │   │   ├── invoices/ // Feature folder
    │   │   └── ai/       // Feature folder
    └── external-services/
        └── ai/           // Feature folder
            ├── OpenAIClient.ts
            └── BedrockClient.ts
```

**Detailed Example: AI Feature Across All Layers**

```typescript
// Domain Layer - AI Feature
domain/ai/
├── entities/
│   ├── AIPrompt.ts
│   ├── AIResponse.ts
│   └── AIConversation.ts
├── value-objects/
│   ├── AIModel.ts
│   └── TokenCount.ts
├── interfaces/
│   ├── IAIClient.ts
│   └── IPromptRepository.ts
├── events/
│   ├── PromptExecutedEvent.ts
│   └── ConversationStartedEvent.ts
└── specifications/
    └── PromptValidSpecification.ts

// Application Layer - AI Feature
application/ai/
├── commands/
│   ├── handlers/
│   │   ├── ExecutePromptCommandHandler.ts
│   │   └── CreateConversationCommandHandler.ts
│   └── models/
│       ├── ExecutePromptCommand.ts
│       └── CreateConversationCommand.ts
├── queries/
│   ├── handlers/
│   │   ├── GetPromptHistoryQueryHandler.ts
│   │   └── GetConversationQueryHandler.ts
│   └── models/
│       ├── GetPromptHistoryQuery.ts
│       └── GetConversationQuery.ts
├── services/
│   ├── AIOrchestrationService.ts
│   └── PromptOptimizationService.ts
└── dto/
    ├── AIPromptDto.ts
    └── AIResponseDto.ts

// Presentation Layer - AI Feature
presentation/controllers/ai/
├── AIPromptController.ts
├── AIConversationController.ts
└── AIAnalyticsController.ts

presentation/validators/ai/
├── PromptValidator.ts
└── ConversationValidator.ts

// Infrastructure Layer - AI Feature
infrastructure/external-services/ai/
├── OpenAIClient.ts           // OpenAI implementation
├── BedrockClient.ts          // AWS Bedrock implementation
└── AIClientFactory.ts        // Factory to create clients

infrastructure/database/repositories/ai/
├── PostgresPromptRepository.ts
└── PostgresConversationRepository.ts
```

**When to Create a New Feature Folder:**

Create a new feature folder when:
- ✅ You're building a distinct business capability (AI, Reports, Invoices, Payments)
- ✅ The feature has 3+ files in a layer
- ✅ The feature has clear boundaries and responsibilities
- ✅ The feature might grow significantly

Don't create a feature folder for:
- ❌ Single utility files (keep in `shared/`)
- ❌ Cross-cutting concerns (keep in `common/` or layer root)
- ❌ Very small features with 1-2 files (can live in layer root initially)

**Shared/Common Code:**

For code that truly spans ALL features:

```typescript
src/
├── domain/
│   ├── common/                  // Shared domain concepts
│   │   ├── Entity.ts
│   │   ├── ValueObject.ts
│   │   └── DomainEvent.ts
│   ├── reports/
│   ├── invoices/
│   └── ai/
│
├── shared/                      // Truly cross-cutting utilities
│   ├── utils/
│   │   ├── dateUtils.ts
│   │   └── stringUtils.ts
│   └── types/
│       └── common.ts
```

**Real-World Example: Building an AI Feature**

When Replit sees you want to add AI functionality, it should create:

```typescript
// Step 1: Create feature structure
mkdir -p src/domain/ai/{entities,value-objects,interfaces,events}
mkdir -p src/application/ai/{commands,queries,services,dto}
mkdir -p src/presentation/controllers/ai
mkdir -p src/infrastructure/external-services/ai

// Step 2: Create AI domain model
// src/domain/ai/interfaces/IAIClient.ts
export interface IAIClient {
  generateResponse(prompt: string, model: AIModel): Promise<AIResponse>;
  streamResponse(prompt: string, model: AIModel): AsyncIterator<string>;
}

// Step 3: Create application layer
// src/application/ai/commands/handlers/ExecutePromptCommandHandler.ts
export class ExecutePromptCommandHandler { ... }

// Step 4: Create presentation layer
// src/presentation/controllers/ai/AIPromptController.ts
export class AIPromptController { ... }

// Step 5: Create infrastructure
// src/infrastructure/external-services/ai/OpenAIClient.ts
export class OpenAIClient implements IAIClient { ... }
```

**Guidelines for Replit:**

1. **When user mentions a new feature (AI, Reports, Payments, etc.):**
   - Ask: "Does this feature exist yet?"
   - If NO: Create feature folder structure across all relevant layers
   - If YES: Add files to existing feature folders

2. **Default structure for new feature:**
   ```
   domain/[feature]/
   application/[feature]/
   presentation/controllers/[feature]/
   infrastructure/.../[feature]/
   ```

3. **Don't create feature folders prematurely:**
   - Start with 2-3 files in feature folder
   - Move from layer root to feature folder when it grows

4. **Use consistent naming:**
   - Folder names: lowercase, plural when appropriate (`reports`, `users`, `ai`)
   - Feature names should match domain language

---

## Complete Project Structure

Here's how all these principles come together in a production-ready structure with feature-based organization:

```
src/
├── domain/                              # Layer 1: Enterprise Business Rules
│   ├── common/                          # Shared domain concepts
│   │   ├── Entity.ts
│   │   ├── ValueObject.ts
│   │   ├── DomainEvent.ts
│   │   └── AggregateRoot.ts
│   │
│   ├── reports/                         # FEATURE: Reports
│   │   ├── entities/
│   │   │   ├── Report.ts
│   │   │   └── ReportTemplate.ts
│   │   ├── value-objects/
│   │   │   └── ReportPeriod.ts
│   │   ├── interfaces/
│   │   │   └── IReportRepository.ts
│   │   ├── events/
│   │   │   ├── ReportCreatedEvent.ts
│   │   │   └── ReportGeneratedEvent.ts
│   │   └── specifications/
│   │       └── ReportValidSpecification.ts
│   │
│   ├── invoices/                        # FEATURE: Invoices
│   │   ├── entities/
│   │   │   └── Invoice.ts
│   │   ├── value-objects/
│   │   │   ├── InvoiceNumber.ts
│   │   │   ├── InvoiceLineItem.ts
│   │   │   └── Money.ts
│   │   ├── interfaces/
│   │   │   └── IInvoiceRepository.ts
│   │   ├── events/
│   │   │   └── InvoiceCreatedEvent.ts
│   │   └── specifications/
│   │       └── InvoiceOverdueSpecification.ts
│   │
│   ├── users/                           # FEATURE: Users
│   │   ├── entities/
│   │   │   └── User.ts
│   │   ├── value-objects/
│   │   │   ├── Email.ts
│   │   │   └── TenantId.ts
│   │   └── interfaces/
│   │       └── IUserRepository.ts
│   │
│   ├── ai/                              # FEATURE: AI (example new feature)
│   │   ├── entities/
│   │   │   ├── AIPrompt.ts
│   │   │   ├── AIResponse.ts
│   │   │   └── AIConversation.ts
│   │   ├── value-objects/
│   │   │   ├── AIModel.ts
│   │   │   └── TokenCount.ts
│   │   ├── interfaces/
│   │   │   ├── IAIClient.ts
│   │   │   └── IPromptRepository.ts
│   │   └── events/
│   │       ├── PromptExecutedEvent.ts
│   │       └── ConversationStartedEvent.ts
│   │
│   └── errors/                          # Shared domain errors
│       ├── DomainError.ts
│       ├── ValidationError.ts
│       ├── NotFoundError.ts
│       └── BusinessRuleViolationError.ts
│
├── application/                         # Layer 2: Application Business Rules
│   ├── common/                          # Shared application concepts
│   │   ├── interfaces/
│   │   │   ├── IEventBus.ts
│   │   │   ├── ICommandBus.ts
│   │   │   └── IQueryBus.ts
│   │   └── base/
│   │       ├── BaseCommandHandler.ts
│   │       └── BaseQueryHandler.ts
│   │
│   ├── reports/                         # FEATURE: Reports
│   │   ├── commands/
│   │   │   ├── handlers/
│   │   │   │   ├── CreateReportCommandHandler.ts
│   │   │   │   └── GenerateReportCommandHandler.ts
│   │   │   └── models/
│   │   │       ├── CreateReportCommand.ts
│   │   │       └── GenerateReportCommand.ts
│   │   ├── queries/
│   │   │   ├── handlers/
│   │   │   │   ├── GetReportQueryHandler.ts
│   │   │   │   └── ListReportsQueryHandler.ts
│   │   │   └── models/
│   │   │       ├── GetReportQuery.ts
│   │   │       └── ListReportsQuery.ts
│   │   ├── services/
│   │   │   └── ReportGenerationService.ts
│   │   └── dto/
│   │       ├── ReportDto.ts
│   │       └── ReportListItemDto.ts
│   │
│   ├── invoices/                        # FEATURE: Invoices
│   │   ├── commands/
│   │   │   ├── handlers/
│   │   │   │   └── CreateInvoiceCommandHandler.ts
│   │   │   └── models/
│   │   │       └── CreateInvoiceCommand.ts
│   │   ├── queries/
│   │   │   ├── handlers/
│   │   │   │   └── ListInvoicesQueryHandler.ts
│   │   │   └── models/
│   │   │       └── ListInvoicesQuery.ts
│   │   ├── services/
│   │   │   └── InvoiceNumberGenerator.ts
│   │   └── dto/
│   │       └── InvoiceDto.ts
│   │
│   ├── users/                           # FEATURE: Users
│   │   ├── commands/
│   │   │   ├── handlers/
│   │   │   │   └── CreateUserCommandHandler.ts
│   │   │   └── models/
│   │   │       └── CreateUserCommand.ts
│   │   ├── queries/
│   │   │   ├── handlers/
│   │   │   │   └── GetUserProfileQueryHandler.ts
│   │   │   └── models/
│   │   │       └── GetUserProfileQuery.ts
│   │   └── dto/
│   │       └── UserDto.ts
│   │
│   └── ai/                              # FEATURE: AI
│       ├── commands/
│       │   ├── handlers/
│       │   │   ├── ExecutePromptCommandHandler.ts
│       │   │   └── CreateConversationCommandHandler.ts
│       │   └── models/
│       │       ├── ExecutePromptCommand.ts
│       │       └── CreateConversationCommand.ts
│       ├── queries/
│       │   ├── handlers/
│       │   │   ├── GetPromptHistoryQueryHandler.ts
│       │   │   └── GetConversationQueryHandler.ts
│       │   └── models/
│       │       ├── GetPromptHistoryQuery.ts
│       │       └── GetConversationQuery.ts
│       ├── services/
│       │   ├── AIOrchestrationService.ts
│       │   └── PromptOptimizationService.ts
│       └── dto/
│           ├── AIPromptDto.ts
│           └── AIResponseDto.ts
│
├── presentation/                        # Layer 3: Interface Adapters
│   ├── middleware/                      # Cross-cutting middleware
│   │   ├── auth.ts
│   │   ├── tenantIsolation.ts
│   │   ├── rateLimiting.ts
│   │   ├── requestLogger.ts
│   │   └── errorHandler.ts
│   │
│   ├── controllers/
│   │   ├── reports/                     # FEATURE: Reports
│   │   │   └── ReportController.ts
│   │   ├── invoices/                    # FEATURE: Invoices
│   │   │   └── InvoiceController.ts
│   │   ├── users/                       # FEATURE: Users
│   │   │   └── UserController.ts
│   │   ├── ai/                          # FEATURE: AI
│   │   │   ├── AIPromptController.ts
│   │   │   └── AIConversationController.ts
│   │   └── HealthController.ts          # Shared
│   │
│   ├── validators/
│   │   ├── reports/                     # FEATURE: Reports
│   │   │   └── ReportValidator.ts
│   │   ├── invoices/                    # FEATURE: Invoices
│   │   │   └── InvoiceValidator.ts
│   │   ├── users/                       # FEATURE: Users
│   │   │   └── UserValidator.ts
│   │   └── ai/                          # FEATURE: AI
│   │       └── PromptValidator.ts
│   │
│   ├── presenters/                      # Response formatters
│   │   ├── ReportPresenter.ts
│   │   └── ErrorPresenter.ts
│   │
│   └── routes/                          # Route definitions
│       ├── reports.routes.ts
│       ├── invoices.routes.ts
│       ├── users.routes.ts
│       ├── ai.routes.ts
│       └── index.ts
│
├── infrastructure/                      # Layer 4: Frameworks & Drivers
│   ├── database/
│   │   ├── repositories/
│   │   │   ├── reports/                 # FEATURE: Reports
│   │   │   │   ├── PostgresReportWriteRepository.ts
│   │   │   │   └── PostgresReportReadRepository.ts
│   │   │   ├── invoices/                # FEATURE: Invoices
│   │   │   │   ├── PostgresInvoiceWriteRepository.ts
│   │   │   │   └── PostgresInvoiceReadRepository.ts
│   │   │   ├── users/                   # FEATURE: Users
│   │   │   │   └── PostgresUserRepository.ts
│   │   │   └── ai/                      # FEATURE: AI
│   │   │       ├── PostgresPromptRepository.ts
│   │   │       └── PostgresConversationRepository.ts
│   │   ├── migrations/
│   │   │   ├── 001_create_reports.sql
│   │   │   ├── 002_create_invoices.sql
│   │   │   ├── 003_create_users.sql
│   │   │   └── 004_create_ai_tables.sql
│   │   ├── seeds/
│   │   │   └── dev-data.sql
│   │   ├── connection.ts
│   │   └── unit-of-work.ts
│   │
│   ├── cache/
│   │   ├── RedisCache.ts
│   │   └── MemoryCache.ts
│   │
│   ├── external-services/
│   │   ├── email/
│   │   │   └── SendGridEmailService.ts
│   │   ├── payment/
│   │   │   └── StripePaymentGateway.ts
│   │   ├── storage/
│   │   │   └── S3StorageService.ts
│   │   └── ai/                          # FEATURE: AI
│   │       ├── OpenAIClient.ts
│   │       ├── BedrockClient.ts
│   │       └── AIClientFactory.ts
│   │
│   ├── messaging/
│   │   ├── InMemoryEventBus.ts
│   │   └── RabbitMQEventBus.ts
│   │
│   ├── logging/
│   │   ├── Logger.ts
│   │   └── loggerConfig.ts
│   │
│   ├── monitoring/
│   │   ├── MetricsCollector.ts
│   │   └── HealthChecker.ts
│   │
│   ├── security/
│   │   ├── JWTService.ts
│   │   ├── Encryption.ts
│   │   └── PasswordHasher.ts
│   │
│   └── web/
│       ├── express-app.ts
│       └── server.ts
│
├── shared/                              # Truly cross-cutting utilities
│   ├── utils/
│   │   ├── dateUtils.ts
│   │   ├── stringUtils.ts
│   │   └── validators.ts
│   ├── types/
│   │   ├── common.ts
│   │   └── pagination.ts
│   └── constants/
│       ├── errors.ts
│       └── config.ts
│
├── tests/                               # Test files mirror source structure
│   ├── unit/
│   │   ├── domain/
│   │   │   ├── reports/
│   │   │   ├── invoices/
│   │   │   └── ai/
│   │   └── application/
│   │       ├── reports/
│   │       ├── invoices/
│   │       └── ai/
│   ├── integration/
│   │   ├── database/
│   │   │   ├── reports/
│   │   │   ├── invoices/
│   │   │   └── ai/
│   │   └── api/
│   │       ├── reports.test.ts
│   │       ├── invoices.test.ts
│   │       └── ai.test.ts
│   └── e2e/
│       └── user-flows/
│           ├── generate-report.test.ts
│           └── create-invoice.test.ts
│
└── config/
    ├── database.config.ts
    ├── cache.config.ts
    ├── app.config.ts
    └── environments/
        ├── development.ts
        ├── staging.ts
        └── production.ts
```

---

## Summary: Principles Checklist

When building or reviewing code, ensure these principles are followed:

### Fundamental Principles
- [ ] KISS: Is this the simplest solution?
- [ ] DRY: Am I repeating myself?
- [ ] YAGNI: Do I actually need this feature now?
- [ ] Separation of Concerns: Are concerns properly separated?
- [ ] Modularity: Is code organized into cohesive modules?
- [ ] **Feature-Based Organization: Are files organized by feature, not just type?**

### SOLID Principles
- [ ] SRP: Does each class/module have one responsibility?
- [ ] OCP: Can I extend without modifying?
- [ ] LSP: Are my implementations properly substitutable?
- [ ] ISP: Are interfaces focused and minimal?
- [ ] DIP: Am I depending on abstractions?

### Clean Architecture
- [ ] Is business logic independent of frameworks?
- [ ] Do dependencies point inward?
- [ ] Are layers clearly separated?
- [ ] Can I test without external dependencies?
- [ ] **Are features organized vertically across layers?**

### CQRS
- [ ] Are reads and writes separated?
- [ ] Are query models optimized for reads?
- [ ] Are command models optimized for writes?
- [ ] Is eventual consistency acceptable here?

### Security & Quality
- [ ] Is multi-tenant data isolated?
- [ ] Is all input validated?
- [ ] Are operations idempotent where needed?
- [ ] Are tests comprehensive (unit + integration + e2e)?
- [ ] Is error handling consistent?

### Operations
- [ ] Is logging structured and meaningful?
- [ ] Are health checks implemented?
- [ ] Is performance monitored?
- [ ] Is caching strategy appropriate?

### Code Organization
- [ ] **Can I find all files related to a feature easily?**
- [ ] **Would adding this feature require changes across many folders?**
- [ ] **Is the feature folder structure consistent across layers?**

---

## Conclusion

These principles and patterns are not rigid rules but proven practices that lead to:

- **Maintainable** code that's easy to understand and change
- **Testable** code with clear boundaries
- **Scalable** architecture that grows with your needs
- **Secure** applications with proper isolation
- **Performant** systems with optimized data access
- **Navigable** codebase where related code lives together

Start with the fundamentals (KISS, DRY, YAGNI) and SOLID principles. Add Clean Architecture for structure, CQRS for scalability, and enterprise patterns as complexity demands.

**Key Takeaways:**

1. **Organize by feature, not just by type** - As you add AI, Reports, Invoices, keep all related code together across layers
2. **Dependencies point inward** - Domain knows nothing about infrastructure
3. **Separate reads from writes** (CQRS) - Optimize each independently
4. **Test at all levels** - 70% unit, 20% integration, 10% E2E
5. **Secure multi-tenant data** - Every query must filter by tenant
6. **Keep it simple** - Add complexity only when actually needed

**Remember**: The best architecture is one that solves today's problems while remaining flexible for tomorrow's changes. Don't over-engineer, but build with quality from the start.

**For Replit**: When building new features:
1. Create feature folders across all relevant layers
2. Keep related code together
3. Follow the dependency rule (inward only)
4. Start simple, add complexity when needed
5. Test as you build
