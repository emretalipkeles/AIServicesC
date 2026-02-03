# Construction Delay Interpreter

## Overview

Construction Delay Interpreter is an AI-powered platform for interpreting contractor-caused delays in construction projects. It provides a split-screen interface featuring an AI chat panel and a tabbed content area. The platform processes project documents (IDRs, NCRs, Field Memos) to extract delay events and matches them to CPM schedule activities. It uses LLM-based interpretation with real-time SSE streaming to help users understand and interpret construction delays.

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

### Backend Folder Structure
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
- **Storage**: PostgreSQL database for production

### Database Schema
Key entities include `delay_analysis_projects`, `delay_analysis_documents`, `schedule_activities`, `delay_events`, and `agents`.

### UI/UX Design
- **Primary Brand Color**: Professional Blue (#3B82F6)
- **Typography**: Inter (UI), JetBrains Mono (code)
- **Layout**: Split-screen (340px fixed AI chat, flexible content), tabbed navigation, responsive design.
- **Component Library**: shadcn/ui with custom theme.

### AI Chat Panel Architecture
The AI chat panel uses a three-region flex layout (like ChatGPT/Replit) for full responsiveness:

**CSS Utility Classes** (client/src/index.css):
- `.chat-container`: Root flex column with min-w-0/min-h-0 constraints
- `.chat-header`: Fixed header region
- `.chat-messages`: Scrollable messages region (flex: 1)
- `.chat-input`: Fixed input region at bottom
- `.chat-message-row`, `.chat-message-content`, `.chat-bubble`: Message structure
- `.chat-prose`, `.chat-table-wrapper`, `.chat-code-wrapper`, `.chat-blockquote`, `.chat-list`: Rich content containers

**Key Principles**:
- Width containment at every nested level (min-w-0, max-w-full)
- Tables/code blocks scroll independently within their containers
- Message bubbles constrained to `max-width: min(75ch, 100%)`
- Responsive breakpoints for padding, layout, and mobile adaptation

### Document Extraction Strategy Pattern
The AI analysis uses document-type-specific extraction strategies to optimize delay event extraction:

**Strategy Architecture** (server/src/infrastructure/delay-analysis/extraction-strategies/):
- **IDocumentExtractionStrategy**: Domain interface defining prompt generation and confidence metadata
- **DocumentExtractionStrategyFactory**: Factory selecting appropriate strategy by document type

**Document-Specific Strategies**:
| Document Type | Strategy | Base Confidence | Delay Certainty | Key Focus |
|---------------|----------|-----------------|-----------------|-----------|
| IDR | IDRExtractionStrategy | 0.6 (moderate) | Uncertain | CODE_CIE tags, narrative verification, duration estimation |
| NCR | NCRExtractionStrategy | 0.85 (high) | Certain | Rework scope, quality failures, corrective actions (duration only if explicitly stated) |
| Field Memo | FieldMemoExtractionStrategy | 0.5 (low) | Uncertain | General delay indicators |
| Other | DefaultExtractionStrategy | 0.5 (low) | Uncertain | Generic extraction |

**Key Differences**:
- **IDRs**: Daily observations requiring interpretation; not all CODE_CIE entries are real delays. Duration is estimated from narrative. Also extracts "Contractor's Work Activity" table for fast-path activity matching.
- **NCRs**: Formal quality failures; NCR = rework required = definite delay. Duration is only captured if explicitly stated in the document (never estimated).

### IDR Work Activity Fast-Match Optimization
When processing IDR documents, the system extracts the "Contractor's Work Activity" table that lists the schedule activities being worked on that day (Schedule Activity #, Description, Comments). This enables a two-tier activity matching approach:

1. **Fast-Path Matching** (IDR activities): When an IDR contains work activities, delay events from that document are first matched against those specific activities. Since the inspector recorded exactly which activities were being worked on, matches are high-confidence (>=85%). This is much faster than searching the full schedule.

2. **Full Schedule Matching** (fallback): If fast-path matching fails or the IDR has no work activities, the system falls back to matching against the full CPM schedule (existing behavior).

**Key Files**:
- `server/src/infrastructure/delay-analysis/extraction-strategies/IDRExtractionStrategy.ts`: Prompt extracts both `workActivities` and `delayEvents`
- `server/src/infrastructure/delay-analysis/AIActivityMatcher.ts`: `tryFastMatch()` method for IDR activity matching
- `server/src/domain/delay-analysis/interfaces/IDocumentExtractionStrategy.ts`: `IDRWorkActivity` interface

**Note**: Fast-match only works when extraction and matching run in the same analysis command. Work activities are not persisted separately.

### Tool-Based Extraction with On-Demand Activity Lookup
An advanced extraction mode uses OpenAI function calling to enable the AI to query the schedule database during document processing:

**Workflow**:
1. AI reads document and detects explicit activity IDs (e.g., "Activity 1234", "WBS 05.02.01")
2. AI calls `get_schedule_activities` tool to look up those activities from the database
3. AI receives activity details (description, dates, critical path status)
4. AI outputs delay events with matched activity information in a single pass

**Enabling Tool-Based Extraction**:
- Pass `enableToolBasedMatching: true` in `RunAnalysisOptions`
- The handler automatically provides `tenantId` and `projectId` to the extractor
- If `AIDelayEventExtractorWithTools` is injected, it uses tool-based extraction; otherwise falls back to standard extraction

**Benefits**:
- Single AI call per document (vs 1 extraction + N matching calls)
- AI has full context when matching (document + activity details together)
- Only fetches relevant activities from DB (not entire schedule)
- Pre-matched events skip the separate matching phase (confidence >= 85%)
- Pre-matched events include WBS code and activity description

**Key Files**:
- `server/src/domain/delay-analysis/interfaces/IExtractionToolExecutor.ts`: Domain interface for extraction tools (returns DTOs)
- `server/src/domain/delay-analysis/interfaces/IDelayEventExtractor.ts`: Extended ExtractionOptions with tenantId/projectId/enableToolBasedMatching
- `server/src/infrastructure/delay-analysis/tools/GetScheduleActivitiesTool.ts`: Tool implementation
- `server/src/infrastructure/delay-analysis/AIDelayEventExtractorWithTools.ts`: Extractor with tool support
- `server/src/application/delay-analysis/queries/GetActivitiesByIdsQuery.ts`: CQRS query for activity lookup
- `server/src/application/delay-analysis/commands/handlers/RunAnalysisCommandHandler.ts`: Passes context to extractor

**Confidence Normalization**: All confidence values are normalized to 0-1 range internally and stored as 0-100 integers in the database.

**Fallback**: Events without pre-matched activities use the existing AIActivityMatcher for full schedule matching.

### Feature Specifications
- **Delay Interpretation**: AI-powered construction delay interpretation. Processes project documents (IDRs, NCRs, Field Memos) to extract delay events and match them to CPM schedule activities. Uses document-type-specific extraction strategies for optimized analysis. Includes project management APIs, real-time SSE progress reporting, run-based AI token usage tracking, and per-run cost display in USD shown in the UI after each operation completes.
- **Document Processing**: Upload and parse construction documents (PDF) to extract delay-related information including dates, causes, responsible parties, and impacts. Features:
  - **Duplicate Document Detection**: SHA-256 content hash prevents uploading the same document twice
  - **Delay Event Deduplication**: Consolidates duplicate events across documents by matching reference numbers (NCR-001, etc.) and similar descriptions
- **Schedule Integration**: Upload CPM schedules (CSV/Excel) with activity IDs, WBS codes, descriptions, and dates. Link delay events to specific schedule activities. Extracts:
  - **LP (Critical Path)**: Checkbox column indicating if activity is on critical path (stored as is_critical_path: yes/no/unknown)
  - **TF (Total Float)**: Numeric column representing total float days (stored as total_float integer)
- **AI Chat Assistant**: Guardrailed AI assistant that only answers questions about construction delays, schedule activities, and project timeline analysis. Enhanced with:
  - **Duration Interpretation Methodology**: Explains how delay durations were estimated from source documents (IDR narrative interpretation vs NCR rework scope calculation)
  - **Document Content Access**: Can reference original document content to explain how delays were extracted
  - **Source Document Linking**: Links delay events to their source documents for contextual explanations
  - **Streaming Chat with Thinking Steps**: SSE streaming endpoint (`/api/delay-analysis/projects/:projectId/chat/stream`) with real-time progress events showing AI reasoning stages (analyzing, searching events, fetching documents, generating response). Uses hybrid document access strategy with 800-char excerpts upfront and tool-based full document retrieval on demand.

### Streaming Chat Architecture
The streaming delay events chat uses a hybrid document access strategy:

**Domain Interfaces** (server/src/domain/delay-analysis/interfaces/):
- **IChatToolExecutor**: Interface for AI function calling tools with `getAvailableTools()` and `execute()` methods
- **IStreamingDelayEventsChatService**: Interface for streaming chat with progress events (content, done, progress, error)

**Application Layer** (CQRS Pattern):
- **GetDocumentContentQuery/Handler**: Query for fetching full document content with tenant/project authorization

**Infrastructure Layer**:
- **GetDocumentContentTool**: Wraps query handler for OpenAI function calling, providing `get_document_content` tool
- **StreamingOpenAIDelayEventsChatService**: Implements streaming with document excerpts and tool calling

**Progress Event Types**:
| Event Type | Stage | Description |
|------------|-------|-------------|
| progress | analyzing | Initial question analysis |
| progress | searching_events | Searching through delay events |
| progress | fetching_document | Retrieving full document via tool |
| progress | generating_response | Generating final response |
| content | - | Streaming text chunk |
| done | - | Stream complete |
| error | - | Error occurred |

**Frontend Components**:
- **ThinkingSteps** (client/src/components/delay-analysis/chat/): Displays AI reasoning steps with icons and completion status
- **AIChatPanel**: Updated to render thinking steps before message content
- **Upload State Tracking**: Uses UploadStateContext for persistent state that survives tab switches - tracks schedule uploads (purple indicator), document uploads (blue indicator), and analysis runs (amber indicator) with compact circular progress indicators.
- **Reusable UI Components** (client/src/components/delay-analysis/ui/premium-components.tsx):
  - **SmartPopover**: Viewport-aware tooltip with auto-positioning
  - **DetailDrawer**: Right-side panel for long-form content
  - **TruncatedTextWithTooltip**: Hover preview with expandable detail drawer

## External Dependencies

### Database
- **PostgreSQL**: Production database, accessed via `AWS_DATABASE_URL`
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
- **@hookform/resolvers**: Zod integration for React Hook Form

### Build & Development Tools
- **Vite**: Frontend build tool
- **esbuild**: Server bundling
- **Drizzle Kit**: Database migration
- **tsx**: TypeScript execution for development

### Cloud Services
- **AWS Bedrock**: AI client provider
- **OpenAI**: AI client provider (`OPEN_AI_KEY`)
