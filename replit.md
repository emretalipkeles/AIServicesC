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
- **UI/UX Design**: Primary color Professional Blue (#3B82F6), Inter typography, JetBrains Mono for code. Split-screen layout (340px fixed AI chat, flexible content), tabbed navigation, responsive design.
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
- **Delay Interpretation**: AI-powered interpretation of construction delays from project documents (IDRs, NCRs, Field Memos) with document-type-specific extraction strategies and real-time SSE progress reporting. Tracks AI token usage and displays per-run cost.
- **Document Processing**: Upload and parse construction documents (PDF) to extract delay information, including SHA-256 for duplicate detection and delay event deduplication. Supports automatic date extraction from various formats.
- **Date-Filtered Analysis**: Allows filtering AI analysis by month/year for cost reduction and focused results. Re-running analysis for a period deletes existing events from successfully re-processed documents before saving new ones. FMs and NCRs bypass the analysis date filter (always analyzed). The Results tab and Delay Events tab share the same month/year filter: IDR events are filtered by date, while FM/NCR events always appear.
- **Schedule Integration**: Upload CPM schedules (CSV/Excel/PDF) and link delay events to specific activities. Features PDF schedule parsing for actual ('A') markers, critical path, and total float.
- **AI Chat Assistant (ReAct Agent Loop)**: Autonomous AI agent for construction delay inquiries using a ReAct (Reason + Act) loop pattern. Features 5 tools (search documents, get content, get delay events, get schedule details, list all delay events) and uses a Contractor Delay Training Guide knowledge base for reasoning. Emits typed events via an SSE endpoint.
- **Field Memo Context Injection**: Automatically fetches and summarizes Field Memos to inject as background context into IDR extraction prompts, improving delay identification.
- **Source Document Type Visibility**: Results tab and Excel export include a "Source Type" column showing whether each delay event was extracted from an IDR, NCR, or Field Memo, with color-coded badges (blue/red/amber).
- **Smart No-Delay Filter**: Automatically detects and excludes AI-generated "no delay" events (descriptions starting with "No contractor-caused delay events...") from Results tab and Excel export using regex pattern matching.
- **Document Extraction Strategy**: Utilizes a strategy pattern (`IDocumentExtractionStrategy`) for document-type-specific processing, including IDR work activity fast-match optimization.
- **Tool-Based Extraction**: Advanced extraction mode using OpenAI function calling to query the schedule database during document processing for on-demand activity lookup, enabling single-pass extraction and matching. Uses per-document-type system prompts via the `IToolExtractionSystemPromptStrategy` interface (Strategy pattern + Factory), with dedicated IDR, Field Memo, NCR, and Default implementations in `server/src/infrastructure/delay-analysis/tool-extraction-prompts/`.
- **Activity Matching Priority**: Enforces a strict IDR-first rule for activity matching. If CPM activity IDs are in the IDR document, matching is restricted to those IDs. Only if no activity IDs are found in the document does it fall back to matching against the date-filtered full schedule. Includes IDR Match Confidence levels and a domain-layer enforcement policy.
- **Match Date Validation**: Post-match validation ensures activities have started by the report date.
- **Activity ID Mapping and Normalization**: Maps human-readable activity codes to UUIDs for storage and handles leading zero variations during lookups.
- **Diary Section Analysis**: AI extracts delay duration from timestamped narratives within IDR "Diary" sections.
- **Delay Event Confidence**: Measures the AI's confidence that an extracted event is a true delay, powered by the Contractor Delay Training Guide knowledge base.
- **Two Confidence Indicators**: "Delay Event Confidence" (AI's confidence in the event being a delay) and "Match Reasoning Confidence" (AI's confidence in the activity match).
- **Single-Document Analysis**: Allows running AI analysis on individual documents from the Documents tab, deleting existing events for that document before re-extraction.
- **Analysis Progress Persistence**: Analysis run status persists across page refreshes, using an in-memory tracker to manage the run lifecycle.

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