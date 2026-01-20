# Data First V3 - Intelligent Orchestrator for FP&A Plus Implementation

## Overview

Data First V3 (formerly AI Assistant) is an intelligent orchestrator platform for Prophix implementation teams working with FP&A Plus. The application features a split-screen interface with an AI chat panel on the left and a tabbed content area on the right.

The platform dynamically discovers agents from the database, uses LLM-based planning for execution strategies, and synthesizes unified responses with real-time SSE streaming.

## User Preferences

Preferred communication style: Simple, everyday language.

**UI/Design Preferences:**
- All buttons and interactive elements must use **Professional Blue** (primary color #3B82F6 / HSL 217 91% 60%)
- Maintain consistent branding throughout the application
- Use gradient variants `from-primary to-primary/80` for emphasis buttons

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens and CSS variables
- **Theme System**: Dark mode default with light/dark toggle, using CSS custom properties

### Layout Structure
- Split-screen design: 340px fixed-width AI chat panel (left) + flexible content area (right)
- Tabbed navigation in the main content area
- Responsive with mobile breakpoint at 768px

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ES modules
- **API Style**: RESTful JSON API under `/api` prefix
- **Build Tool**: Custom build script using esbuild for server, Vite for client

### Backend Architecture Patterns (MANDATORY)

**All new backend features MUST follow the patterns in `docs/SOFTWARE_ENGINEERING_PRINCIPLES_ENHANCED.md`**

- **Clean Architecture**: 4-layer structure (domain → application → presentation → infrastructure)
- **CQRS**: Separate Commands (writes) from Queries (reads) with dedicated handlers
- **Repository Pattern**: Abstract data access behind interfaces in domain layer
- **Dependency Injection**: Centralized via composition root in `server/src/infrastructure/bootstrap.ts`
- **Domain Events**: Use in-memory event bus for side effects and loose coupling

**Composition Root Pattern:**
```typescript
// server/src/infrastructure/bootstrap.ts
export interface AppContainer {
  commandBus: ICommandBus;
  queryBus: IQueryBus;
  repositories: { ... };
  handlers: { ... };
  services: { ... };
}

// Routes receive container, never instantiate infrastructure directly
export function registerFeatureRoutes(app: Express, container: AppContainer): void {
  const controller = new FeatureController(container.commandBus, container.queryBus);
  app.get("/api/feature", (req, res) => controller.handle(req, res));
}
```

**Folder Structure for New Features:**
```
server/src/
├── domain/           # Layer 1: Entities, value objects, repository interfaces, events
├── application/      # Layer 2: Commands, queries, handlers, DTOs, services
├── presentation/     # Layer 3: Controllers, middleware, validators
└── infrastructure/   # Layer 4: Repository implementations, external services, bootstrap.ts
```

**Key Rules:**
1. Dependencies only point inward (infrastructure → presentation → application → domain)
2. Domain layer has NO external dependencies
3. Always include tenantId in multi-tenant queries (enforced in all repository methods)
4. Validate input at boundaries using Zod schemas in `presentation/validators/`
5. Routes receive AppContainer from composition root - never instantiate infrastructure directly
6. Use structured logging with context

### Feature-Based Routing Pattern (MANDATORY)

**All API routes MUST follow feature-based file organization:**

```
server/src/presentation/routes/
├── index.ts              # Main route composer - imports and registers all feature routes
├── client.routes.ts      # Client management routes
├── journey.routes.ts     # Journey tracking routes
├── chat.routes.ts        # Chat message routes
├── stats.routes.ts       # Statistics and analytics routes
├── ai.routes.ts          # AI/LLM integration routes
└── agent.routes.ts       # RAG Agent management routes
```

**Route File Structure:**
```typescript
import type { Express } from "express";
import type { AppContainer } from "../../infrastructure/bootstrap";
import { FeatureController } from "../controllers/FeatureController";

export function registerFeatureRoutes(app: Express, container: AppContainer): void {
  const controller = new FeatureController(container.commandBus, container.queryBus);
  app.get("/api/feature", (req, res) => controller.handle(req, res));
  app.post("/api/feature", (req, res) => controller.create(req, res));
}
```

**Validators Structure:**
```
server/src/presentation/validators/
├── agentValidators.ts       # Agent CRUD validation schemas
├── aiValidators.ts          # AI chat request validation
├── journeyValidators.ts     # Journey progress validation
└── orchestratorValidators.ts # Orchestration request validation
```

**Key Rules:**
1. Each feature has its own route file in `server/src/presentation/routes/`
2. Main `routes/index.ts` only imports and registers feature routes
3. Keep routes close to their controllers (same feature folder)
4. Each feature route file handles its own routes, middleware, and controller wiring
5. Never add new routes directly to `server/routes.ts` - always create a feature route file
6. Share command/query buses between routes that need them via function parameters

**Benefits:**
- Prevents merge conflicts in large teams
- Makes codebase navigable by feature
- Easy to locate and modify related routes
- Clear separation of concerns

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` (shared between client and server)
- **Validation**: Zod schemas generated from Drizzle schemas via drizzle-zod
- **Storage**: Currently uses in-memory storage (`MemStorage` class) with interface for future database implementation

### Database Schema
Core entities:
- `users`: Authentication with username/password
- `clients`: Customer records with company and contact info
- `journeys`: Customer journey tracking with status and progress
- `chatMessages`: AI conversation history

### Build & Development
- **Development**: `npm run dev` runs tsx with hot reload
- **Production Build**: Vite builds client to `dist/public`, esbuild bundles server to `dist/index.cjs`
- **Database Migrations**: Drizzle Kit with `npm run db:push`

### Design System
- **Primary Brand Color**: Professional Blue (#3B82F6 / HSL 217 91% 60%)
- **Typography**: Inter for UI text, JetBrains Mono for code
- **Spacing**: Tailwind default units (2, 4, 6, 8)
- **Components**: Full shadcn/ui component library with custom theme integration

## External Dependencies

### Database
- **PostgreSQL**: Required for production (connection via `DATABASE_URL` environment variable)
- **connect-pg-simple**: Session storage for Express sessions

### UI Libraries
- **Radix UI**: Complete primitive component set (dialog, dropdown, tabs, etc.)
- **Lucide React**: Icon library
- **Embla Carousel**: Carousel component
- **React Day Picker**: Calendar/date picker
- **Recharts**: Charting library
- **Vaul**: Drawer component
- **CMDK**: Command palette component

### Form & Validation
- **React Hook Form**: Form state management
- **Zod**: Schema validation
- **@hookform/resolvers**: Zod integration with React Hook Form

### Build & Development Tools
- **Vite**: Frontend build tool with React plugin
- **esbuild**: Server bundling
- **Drizzle Kit**: Database migration tooling
- **tsx**: TypeScript execution for development

### Replit-Specific
- **@replit/vite-plugin-runtime-error-modal**: Error overlay in development
- **@replit/vite-plugin-cartographer**: Development tooling
- **@replit/vite-plugin-dev-banner**: Development banner

### PRET Package Management
- **Package Upload**: Upload PRET package ZIP files via `/api/pret/packages/upload`
- **Validation**: Packages must contain `package.yaml` at root level and `templates/` folder
- **Storage**: S3-based storage with tenant-scoped paths (`pret-packages/{tenantId}/{packageId}/`)
- **AI-Generated Responses**: Upload success/error messages are AI-generated via `IUploadNarrator` interface for conversational UX
- **Required Environment Variables**:
  - `S3_AUTH_KEY`: AWS access key for S3
  - `S3_AUTH_SECRET`: AWS secret key for S3
  - `S3_BUCKET_NAME`: S3 bucket name for package storage
  - `S3_REGION`: AWS S3 region (defaults to `AWS_BEDROCK_REGION` if not set, then `us-east-1`)
- **Frontend Route**: `/pret/:packageId` - Package Editor page
- **CreateOtherDimension Feature**:
  - **REST Endpoint**: `POST /api/pret/packages/:packageId/dimensions` - Creates new OtherDimension in package
  - **AI Access**: Available via PRET Agent chat using natural language ("create a dimension called X for model Y")
  - **Workflow**: List models → validate selection → generate YAML → validate against schema → save to dimensions/ → update model dependsOn and spec.dimensions.other → re-analyze package
  - **Schemas**: Validates against `Dimensions/other-dimension.schema.yaml` and `Model/cube.schema.yaml`
- **Key Files**:
  - `server/src/domain/pret/entities/PretPackageSession.ts`: Package session entity
  - `server/src/infrastructure/pret/storage/S3PretPackageStorage.ts`: S3 storage implementation
  - `server/src/application/pret/handlers/ImportPretPackageHandler.ts`: Import orchestration
  - `server/src/application/pret/handlers/pret-command-handlers/CreateOtherDimensionCommandHandler.ts`: Dimension creation handler
  - `server/src/domain/orchestration/interfaces/IUploadNarrator.ts`: AI narrator interface for upload feedback
  - `server/src/infrastructure/orchestration/narrators/AIUploadNarrator.ts`: AI narrator implementation
  - `server/src/presentation/validators/dimensionValidators.ts`: Zod validation for dimension creation API

### AI Infrastructure
- **Multi-Provider Support**: AIClientFactory routes to AWS Bedrock or OpenAI based on model provider
- **Supported Models**:
  - `claude-sonnet-4-5`: AWS Bedrock Claude Sonnet
  - `claude-opus-4-5`: AWS Bedrock Claude Opus
  - `gpt-5.2`: OpenAI Responses API with medium reasoning effort (default for orchestration)
  - `gpt-5.2-high`: OpenAI Responses API with high reasoning effort
- **Model Selection**: Agents specify their model in the database; AgentExecutor dynamically selects the appropriate AI client
- **Default Configuration**: Main orchestrator uses OpenAI (gpt-5.2) via `OPEN_AI_KEY` environment variable
- **Key Files**:
  - `server/src/domain/value-objects/ModelId.ts`: Value object with provider detection and reasoning effort mapping
  - `server/src/infrastructure/ai/AIClientFactory.ts`: Factory routing to Bedrock or OpenAI
  - `server/src/infrastructure/ai/OpenAIResponsesClient.ts`: OpenAI SDK integration with streaming support
  - `server/src/infrastructure/ai/BedrockConverseClient.ts`: AWS Bedrock integration

### Delay Analysis Feature
- **Purpose**: AI-powered construction delay analysis for identifying contractor-caused delays from project documentation
- **Use Case**: Analyze Inspector Daily Reports (IDRs with CODE_CIE tags), NCRs, and Field Memos to extract delay events and match them to CPM schedule activities
- **Database Tables**:
  - `delay_analysis_projects`: Project container with name, contract number, notice to proceed date
  - `project_documents`: Uploaded documents (IDRs, NCRs, Field Memos, CPM schedules) with parsing status
  - `schedule_activities`: Extracted CPM schedule activities with Activity ID, WBS, descriptions, dates
  - `contractor_delay_events`: Extracted delay events with matched Activity ID, confidence scores, source references
- **API Endpoints**: 
  - `GET/POST /api/delay-analysis/projects` - List and create projects
  - `GET/PUT/DELETE /api/delay-analysis/projects/:id` - Project CRUD operations
  - `GET /api/delay-analysis/projects/:id/analyze/stream` - SSE endpoint for real-time analysis progress
- **SSE Progress Reporting**: Real-time streaming of analysis progress using Server-Sent Events
  - Progress stages: `loading_documents`, `extracting_events`, `loading_activities`, `matching_events`, `saving_events`, `complete`, `error`
  - Domain interface: `IProgressReporter` with `report()`, `complete()`, `error()` methods
  - Infrastructure: `SSEProgressReporter` implements Express SSE streaming
  - Client: `runAnalysisWithProgress()` in `analysis-api.ts` using EventSource
- **Architecture**: Full Clean Architecture + CQRS implementation
- **Key Files**:
  - `server/src/domain/delay-analysis/entities/` - Domain entities with validation
  - `server/src/domain/delay-analysis/repositories/` - Repository interfaces
  - `server/src/application/delay-analysis/commands/` - CQRS command handlers
  - `server/src/application/delay-analysis/queries/` - CQRS query handlers
  - `server/src/infrastructure/database/repositories/delay-analysis/` - Drizzle ORM implementations
  - `server/src/presentation/routes/delay-analysis-project.routes.ts` - API routes
  - `server/src/presentation/controllers/DelayAnalysisProjectController.ts` - Controller