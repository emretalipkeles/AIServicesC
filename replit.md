# Construction Delay Interpreter

## Overview

Construction Delay Interpreter is an AI-powered platform designed to analyze and interpret contractor-caused delays in construction projects. It features a split-screen interface with an AI chat panel and a tabbed content area. The platform processes project documents (IDRs, NCRs, Field Memos), extracts delay events, and matches them to CPM schedule activities using LLM-based interpretation with real-time SSE streaming. The project aims to provide clarity and insights into complex construction delays, enhancing project management and dispute resolution capabilities.

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
- **UI/UX Design**: Primary color Professional Blue (#3B82F6), Inter typography, JetBrains Mono for code. Split-screen layout (340px fixed AI chat, flexible content), tabbed navigation, responsive design. AI chat panel uses a three-region flex layout for responsiveness.
- **Reusable UI Components**: SmartPopover, DetailDrawer, TruncatedTextWithTooltip.

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

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema**: `shared/schema.ts`
- **Validation**: Zod schemas generated from Drizzle
- **Storage**: PostgreSQL database

### Feature Specifications
- **Delay Interpretation**: AI-powered interpretation of construction delays from project documents (IDRs, NCRs, Field Memos). Uses document-type-specific extraction strategies and real-time SSE progress reporting. Tracks AI token usage and displays per-run cost.
- **Document Processing**: Upload and parse construction documents (PDF) to extract delay information. Includes SHA-256 content hash for duplicate detection and delay event deduplication based on reference numbers (NCR, IDR, FM, DSC, RFI, COR patterns with date scoping). Automatic date extraction from document content (supports numeric formats like "8/5/25" and textual formats like "August 5, 2025").
- **Date-Filtered Analysis**: AI analysis can be filtered by month/year to process only documents from a specific period, reducing costs and focusing analysis on relevant timeframes. Filters are in the Delay Events tab UI.
- **Schedule Integration**: Upload CPM schedules (CSV/Excel/PDF) and link delay events to specific activities. Features PDF schedule parsing for all activities with 'A' (actual) markers, capturing critical path (is_critical_path) and total float (total_float).
- **AI Chat Assistant**: Guardrailed AI assistant for construction delay inquiries. Explains delay duration methodology, accesses document content, links to source documents, and provides streaming chat with thinking steps for AI reasoning stages.
- **Document Extraction Strategy**: Utilizes a strategy pattern (`IDocumentExtractionStrategy`) for document-type-specific processing (IDR, NCR, Field Memo, Default) to optimize delay event extraction, including IDR work activity fast-match optimization.
- **Tool-Based Extraction**: Advanced extraction mode (enabled by default) using OpenAI function calling to query the schedule database during document processing for on-demand activity lookup, enabling single-pass extraction and matching. Prioritizes detecting "Contractor's Work Activity" tables in IDRs with activity IDs like "2-W-0471".
- **Activity Matching Priority**: (1) Force match to IDR-listed activities first (confidence reflects description alignment: 85-100% high, 70-84% good, 50-69% weak, 40-49% forced); (2) If no IDR activities, match to date-filtered schedule (excludes activities starting after report date). Report date extracted from IDR "Day/Date" header field.
- **Match Date Validation**: Post-match validation ensures the activity has started by the report date (uses actual start date if available, otherwise planned start date). Activities that haven't started yet are rejected. Completed activities are valid matches since delays could have occurred during that work.
- **Activity ID Mapping**: The AI returns human-readable activity codes (e.g., "2-W-0471"), which are mapped to UUID primary keys before saving to `matchedActivityId` (FK). The activity code is preserved in `cpmActivityId` for display purposes.
- **Activity ID Normalization**: Lookups handle leading zero variations (e.g., "02-RW-0569" matches "2-RW-0569") by generating and trying multiple variants during database queries.

## External Dependencies

### Database
- **PostgreSQL**: Production database
- **connect-pg-simple**: Express session storage

### UI Libraries
- **Radix UI**: Primitive components
- **Lucide React**: Icons
- **Framer Motion**: Animations
- **Recharts**: Charting
- **Vaul**: Drawer

### Form & Validation
- **React Hook Form**: Form state
- **Zod**: Schema validation
- **@hookform/resolvers**: Zod integration

### Cloud Services
- **AWS Bedrock**: AI client provider
- **OpenAI**: AI client provider