# Data First V3 - Intelligent Orchestrator

## Overview

Data First V3 is an intelligent orchestrator platform designed to assist Prophix implementation teams working with FP&A Plus. It provides a split-screen interface featuring an AI chat panel and a tabbed content area. The platform dynamically discovers agents, uses LLM-based planning for execution strategies, and synthesizes unified responses with real-time SSE streaming. The project aims to streamline complex financial planning and analysis processes by leveraging AI to enhance efficiency and accuracy in Prophix implementations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **UI Components**: shadcn/ui (built on Radix UI)
- **Styling**: Tailwind CSS
- **Theme System**: Dark mode default with light/dark toggle

### Backend
- **Runtime**: Node.js with Express
- **Language**: TypeScript with ES modules
- **API Style**: RESTful JSON API (`/api` prefix)
- **Build Tools**: esbuild (server), Vite (client)

### Architectural Patterns
- **Clean Architecture**: 4-layer structure (domain, application, presentation, infrastructure)
- **CQRS**: Separate Commands and Queries
- **Repository Pattern**: Abstracted data access
- **Dependency Injection**: Centralized via composition root
- **Domain Events**: In-memory event bus
- **Multi-tenancy**: All repository methods enforce `tenantId`
- **Input Validation**: Zod schemas at API boundaries

### Backend Folder Structure (New Features)
- `server/src/domain/`: Entities, value objects, repository interfaces, events
- `server/src/application/`: Commands, queries, handlers, DTOs, services
- `server/src/presentation/`: Controllers, middleware, validators
- `server/src/infrastructure/`: Repository implementations, external services, bootstrap

### Feature-Based Routing
API routes are organized by feature in `server/src/presentation/routes/`, with each file responsible for its feature's routes, controllers, and middleware.

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema**: `shared/schema.ts` (shared)
- **Validation**: Zod schemas generated from Drizzle
- **Storage**: In-memory storage with interface for future database integration

### Database Schema
Key entities include `users`, `clients`, `journeys`, and `chatMessages`.

### UI/UX Design
- **Primary Brand Color**: Professional Blue (#3B82F6)
- **Typography**: Inter (UI), JetBrains Mono (code)
- **Layout**: Split-screen (340px fixed AI chat, flexible content), tabbed navigation, responsive design.
- **Component Library**: shadcn/ui with custom theme.

### Feature Specifications
- **PRET Package Management**: Upload, validate, and store PRET packages (ZIP files with `package.yaml`). Supports AI-generated feedback. Includes a Package Editor page and an API to create OtherDimensions in packages via AI.
- **AI Infrastructure**: Multi-provider support (AWS Bedrock, OpenAI) with dynamic model selection. Default orchestrator uses OpenAI (gpt-5.2).
- **Delay Analysis Feature**: AI-powered construction delay analysis. Processes project documents (IDRs, NCRs, Field Memos) to extract delay events and match them to CPM schedule activities. Includes project management APIs, real-time SSE progress reporting, run-based AI token usage tracking, and per-run cost display in USD shown in the UI after each operation completes (both for schedule uploads and delay analysis runs). Uses UploadStateContext (client/src/contexts/upload-state-context.tsx) for persistent state that survives tab switches - tracks schedule uploads (purple indicator), document uploads (blue indicator), and analysis runs (amber indicator) with compact circular progress indicators displayed in the tabs bar.

## External Dependencies

### Database
- **PostgreSQL**: Production database, accessed via `AWS_DATABASE_URL`
- **connect-pg-simple**: Express session storage

### UI Libraries
- **Radix UI**: Primitive components
- **Lucide React**: Icons
- **Embla Carousel**: Carousel
- **React Day Picker**: Date picker
- **Recharts**: Charting
- **Vaul**: Drawer
- **CMDK**: Command palette

### Form & Validation
- **React Hook Form**: Form state
- **Zod**: Schema validation
- **@hookform/resolvers**: Zod integration for React Hook Form

### Build & Development Tools
- **Vite**: Frontend build tool
- **esbuild**: Server bundling
- **Drizzle Kit**: Database migration
- **tsx**: TypeScript execution for development

### Replit-Specific Tools
- **@replit/vite-plugin-runtime-error-modal**
- **@replit/vite-plugin-cartographer**
- **@replit/vite-plugin-dev-banner**

### Cloud Services
- **AWS S3**: For PRET package storage (`S3_AUTH_KEY`, `S3_AUTH_SECRET`, `S3_BUCKET_NAME`, `S3_REGION`)
- **AWS Bedrock**: AI client provider
- **OpenAI**: AI client provider (`OPEN_AI_KEY`)