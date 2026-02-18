# Construction Delay Interpreter

## Overview

Construction Delay Interpreter is an AI-powered platform designed to analyze and interpret contractor-caused delays in construction projects. It features a split-screen interface with an AI chat panel and a tabbed content area. The platform processes project documents (IDRs, NCRs, Field Memos), extracts delay events, and matches them to CPM schedule activities using LLM-based interpretation with real-time SSE streaming. The project aims to provide clarity and insights into complex construction delays, enhancing project management and dispute resolution capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.
**CRITICAL: Always use GPT-5.2 as the AI model everywhere. Never use GPT-4.1 or any older model. This applies to all AI features: agent loop, extraction, chat, and any new AI functionality.**

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
- **AI Chat Assistant (ReAct Agent Loop)**: Autonomous AI agent for construction delay inquiries using a ReAct (Reason + Act) loop pattern. The agent loop is the PRIMARY and ONLY AI chat endpoint — all old single-call handlers, orchestrator, and streaming chat services have been removed. The agent iteratively calls tools and reasons about results until it has a complete, evidence-based answer (max 15 iterations). Features 5 tools: search_documents_by_filename, get_document_content, get_delay_events_by_document, get_schedule_activity_details, list_delay_events (query all delay events with optional month/year/category filters). Tools implement `ITool` interface with `ToolExecutionContext` (tenantId, projectId). Uses `ReactAgentLoop` (infrastructure) with `OpenAIToolUseClient` for streaming tool-use calls. System prompt includes full Contractor Delay Training Guide knowledge base (~7,440 tokens, 12 sections) and 4-step analytical methodology (locate source → read evidence → cross-reference guide → verdict). Single SSE endpoint at `/api/ai/agent-loop/stream` emits typed events (thinking, tool_invocation, tool_result, content, done). Frontend routes ALL chat messages through the agent loop endpoint. Bootstrap creates agent loop via `createAgentLoop()` factory, stored in `container.agentLoop` section. **Token usage tracking**: Each chat interaction captures cumulative token usage across all ReAct iterations (input/output/total tokens, API call count) via OpenAI `stream_options.include_usage`. Saved to `ai_token_usage` table with operation type `agent_chat`, including metadata (iteration count, API calls, tools used). Cost calculated using gpt-4.1 pricing ($2.00/M input, $8.00/M output).
- **Document Extraction Strategy**: Utilizes a strategy pattern (`IDocumentExtractionStrategy`) for document-type-specific processing (IDR, NCR, Field Memo, Default) to optimize delay event extraction, including IDR work activity fast-match optimization.
- **Tool-Based Extraction**: Advanced extraction mode (enabled by default) using OpenAI function calling to query the schedule database during document processing for on-demand activity lookup, enabling single-pass extraction and matching. Prioritizes detecting "Contractor's Work Activity" tables in IDRs with activity IDs like "2-W-0471".
- **Activity Matching Priority**: STRICT IDR-FIRST RULE — (1) When CPM activity IDs exist in the IDR document, the matcher MUST pick from those IDs only. It will NEVER fall back to the full CPM schedule list. Even if the event description doesn't perfectly match any IDR activity, the closest IDR activity is selected (with appropriate low confidence). A dedicated `parseIDRForceMatchResponse` validates AI picks against the IDR activity list (not just schedule DB entries), handling cases where IDR activities aren't in the schedule. If AI parsing fails entirely, a deterministic fallback picks the first IDR activity. (2) Only when zero activity IDs are found in the document does the system fall back to matching against the date-filtered full schedule (excludes activities starting after report date). Report date extracted from IDR "Day/Date" header field. **IDR Match Confidence**: All IDR document matches use 90-100% confidence because the activity ID comes directly from the document. The 90-100 range reflects description alignment quality: 99-100% = exact description+location match, 95-98% = strong alignment, 90-94% = weak description alignment but valid document-sourced match.
- **Match Date Validation**: Post-match validation ensures the activity has started by the report date (uses actual start date if available, otherwise planned start date). Activities that haven't started yet are rejected. Completed activities are valid matches since delays could have occurred during that work.
- **Activity ID Mapping**: The AI returns human-readable activity codes (e.g., "2-W-0471"), which are mapped to UUID primary keys before saving to `matchedActivityId` (FK). The activity code is preserved in `cpmActivityId` for display purposes.
- **Activity ID Normalization**: Lookups handle leading zero variations (e.g., "02-RW-0569" matches "2-RW-0569") by generating and trying multiple variants during database queries.
- **Diary Section Analysis**: AI extraction now explicitly analyzes IDR "Diary" sections with timestamped narratives. Recognizes multiple time formats (0700, 7am, 7:00 AM, 07:00) and calculates delay duration from timestamp gaps (e.g., "0700-crew stopped, 0830-resumed" = 1.5h delay). Source references include timestamps like "Diary, 1415: [description]".
- **Delay Event Confidence**: Separate from match confidence, this measures how confident the AI is that an extracted event is truly a delay (vs. routine observation). Now powered by the comprehensive Contractor Delay Training Guide knowledge base (see below). Displayed as "Event Conf." in analysis results table and as "Event:" badge in delay events tab. Included in Excel export as "Delay Event Confidence" column. Existing match confidence renamed to "Match Conf." / "Match Reasoning Confidence" for clarity.
- **Contractor Delay Training Guide Knowledge Base**: A comprehensive 22-page training guide integrated into all AI extraction prompts. Lives in domain layer as `IDelayKnowledgeBase` interface + `ContractorDelayTrainingGuide` value object (`server/src/domain/delay-analysis/config/ContractorDelayTrainingGuide.ts`). Contains: delay definition with contract basis (Section 1-08.4, 1-08.8), 5 delay categories with 22+ specific indicators, exclusions list (DSCs, owner-directed suspensions, etc.), 8-entry decision framework (if-yes/if-no logic), 17 worked examples (delays, non-delays, gray areas), 5 gray area scenarios, 8 common pitfalls, and a quick-reference cheat sheet. The `DelayKnowledgePromptBuilder` in infrastructure layer formats this into document-type-specific AI prompts (IDRs get full guide including worked examples; NCRs get core sections only). Injected into all 4 extraction strategies and the tool-based extractor system prompt via constructor injection (DIP). Supersedes the old `DelayDefinitionConfig.ts` (deprecated, retained for backward compatibility).
- **Two Confidence Indicators**: (1) "Delay Event Confidence" — AI's confidence the event is a real delay based on delay definition criteria (0-100%); (2) "Match Reasoning Confidence" — AI's confidence the delay was correctly matched to a CPM schedule activity (0-100%). Both displayed side-by-side in UI and Excel export.

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