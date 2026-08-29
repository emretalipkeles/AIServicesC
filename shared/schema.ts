import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, real, numeric, jsonb, boolean, index, customType } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  password: text("password").notNull(),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  name: true,
  password: true,
  role: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  company: text("company").notNull(),
  email: text("email"),
  industry: text("industry"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
});

export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

export const journeys = pgTable("journeys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  clientId: varchar("client_id").references(() => clients.id),
  status: text("status").notNull().default("in_progress"),
  progress: integer("progress").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertJourneySchema = createInsertSchema(journeys).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertJourney = z.infer<typeof insertJourneySchema>;
export type Journey = typeof journeys.$inferSelect;

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  role: text("role").notNull(),
  content: text("content").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  timestamp: true,
});

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

export const agents = pgTable("agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().default("default"),
  name: text("name").notNull(),
  description: text("description"),
  systemPrompt: text("system_prompt").notNull(),
  model: text("model").notNull().default("claude-sonnet-4-5"),
  agentType: text("agent_type").notNull().default("standard"),
  allowedTables: text("allowed_tables").array().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAgentSchema = createInsertSchema(agents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agents.$inferSelect;

export const agentDocuments = pgTable("agent_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: varchar("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().default("default"),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  rawContent: text("raw_content"),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAgentDocumentSchema = createInsertSchema(agentDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAgentDocument = z.infer<typeof insertAgentDocumentSchema>;
export type AgentDocument = typeof agentDocuments.$inferSelect;

export const agentChunks = pgTable("agent_chunks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => agentDocuments.id, { onDelete: "cascade" }),
  agentId: varchar("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().default("default"),
  content: text("content").notNull(),
  metadata: text("metadata"),
  chunkIndex: integer("chunk_index").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAgentChunkSchema = createInsertSchema(agentChunks).omit({
  id: true,
  createdAt: true,
});

export type InsertAgentChunk = z.infer<typeof insertAgentChunkSchema>;
export type AgentChunk = typeof agentChunks.$inferSelect;

export const documentProcessingSessions = pgTable("document_processing_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => agentDocuments.id, { onDelete: "cascade" }),
  agentId: varchar("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().default("default"),
  stage: text("stage").notNull().default("extracting"),
  rawContent: text("raw_content"),
  totalChunks: integer("total_chunks").notNull().default(0),
  processedChunks: integer("processed_chunks").notNull().default(0),
  aiSummary: text("ai_summary"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertDocumentProcessingSessionSchema = createInsertSchema(documentProcessingSessions).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export type InsertDocumentProcessingSession = z.infer<typeof insertDocumentProcessingSessionSchema>;
export type DocumentProcessingSession = typeof documentProcessingSessions.$inferSelect;

export const processingMessages = pgTable("processing_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => documentProcessingSessions.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  chunkIndex: integer("chunk_index"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProcessingMessageSchema = createInsertSchema(processingMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertProcessingMessage = z.infer<typeof insertProcessingMessageSchema>;
export type ProcessingMessage = typeof processingMessages.$inferSelect;

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().default("default"),
  title: text("title"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

export const conversationMessages = pgTable("conversation_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertConversationMessageSchema = createInsertSchema(conversationMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertConversationMessage = z.infer<typeof insertConversationMessageSchema>;
export type ConversationMessage = typeof conversationMessages.$inferSelect;

export type ConversationMessageRole = 'user' | 'assistant' | 'agent_interaction' | 'summary';

export interface ConversationMessageMetadata {
  agentId?: string;
  agentName?: string;
  success?: boolean;
  executionTimeMs?: number;
  originalMessageCount?: number;
}

export const feedback = pgTable("feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userEmail: text("user_email").notNull(),
  userName: text("user_name"),
  category: text("category").notNull(),
  sentiment: text("sentiment"),
  summary: text("summary").notNull(),
  conversation: jsonb("conversation"),
  currentPage: text("current_page"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFeedbackSchema = createInsertSchema(feedback).omit({
  id: true,
  createdAt: true,
});

export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Feedback = typeof feedback.$inferSelect;

export const delayAnalysisProjects = pgTable("delay_analysis_projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().default("default"),
  name: text("name").notNull(),
  description: text("description"),
  contractNumber: text("contract_number"),
  noticeToProceedDate: timestamp("notice_to_proceed_date"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDelayAnalysisProjectSchema = createInsertSchema(delayAnalysisProjects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDelayAnalysisProject = z.infer<typeof insertDelayAnalysisProjectSchema>;
export type DelayAnalysisProject = typeof delayAnalysisProjects.$inferSelect;

const xerBytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const xerUploads = pgTable("xer_uploads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => delayAnalysisProjects.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().default("default"),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  detectedVersion: text("detected_version"),
  fileData: xerBytea("file_data").notNull(),
  parseError: text("parse_error"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const xerRuns = pgTable("xer_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  uploadId: varchar("upload_id").notNull().references(() => xerUploads.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => delayAnalysisProjects.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().default("default"),
  outcome: text("outcome").notNull(),
  detectedVersion: text("detected_version"),
  diffReport: jsonb("diff_report"),
  outputData: xerBytea("output_data"),
  errorMessage: text("error_message"),
  originalSha256: text("original_sha256"),
  outputSha256: text("output_sha256"),
  structuralSummary: jsonb("structural_summary"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type XerUploadRow = typeof xerUploads.$inferSelect;
export type XerRunRow = typeof xerRuns.$inferSelect;

export const projectDocuments = pgTable("project_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => delayAnalysisProjects.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().default("default"),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  documentType: text("document_type").notNull(),
  contentHash: varchar("content_hash", { length: 64 }),
  rawContent: text("raw_content"),
  reportDate: timestamp("report_date"),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  // Tracks the *separate* document-type-specific structured extraction step (e.g. POD ->
  // pod_reports) that runs after raw parsing completes. Null means no structured extraction
  // applies to this document type or it has not run yet; 'completed'/'failed' let failures
  // surface instead of being silently swallowed while `status` stays 'completed' for the raw parse.
  structuredExtractionStatus: text("structured_extraction_status"),
  structuredExtractionError: text("structured_extraction_error"),
  // Human-readable outcome summary for a document-type-specific structured extraction step
  // (e.g. "Split into 27 dated entries, 2021-09-23 to 2021-10-30" for a Foreman Diary upload).
  // Null when the document type has no such summary or extraction has not run yet.
  structuredExtractionSummary: text("structured_extraction_summary"),
  // Original uploaded bytes, kept only while status is 'pending'/'processing' so a server
  // restart mid-upload can resume/retry without asking the user to re-upload. Cleared once
  // processing reaches a terminal state (completed, or failed after exhausting retries) to
  // avoid unbounded row bloat - see StartupReconciliationService.
  fileData: customType<{ data: Buffer; driverData: Buffer }>({
    dataType() {
      return "bytea";
    },
  })("file_data"),
  // Counts reconciliation retry attempts after an interrupted (pending/processing) restart is
  // detected. Bounds retries so a document whose processing itself crashes the server can't
  // wedge the app in a permanent restart loop - see StartupReconciliationService.
  processingAttempts: integer("processing_attempts").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProjectDocumentSchema = createInsertSchema(projectDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProjectDocument = z.infer<typeof insertProjectDocumentSchema>;
export type ProjectDocument = typeof projectDocuments.$inferSelect;

export type ProjectDocumentType = 'idr' | 'ncr' | 'field_memo' | 'cpm_schedule' | 'contract_plan' | 'dsc_claim' | 'pod' | 'daily_report' | 'other';

// Play of the Day (POD) — daily construction assignment sheets made of repeating,
// loosely-structured blocks (e.g. "CIVIL #1", "SUBCONTRACTORS", "UPO"). The tables below
// normalize the repeating container structure (report -> sections -> crew/equipment/task
// lines) while keeping genuinely variable leaf content as plain text.
//
// Deliberate modeling decisions (do not "fix"):
// - trucking/traffic/notes are single-valued columns on pod_sections, not child tables.
// - podSections.category has no enum/check constraint so unseen block labels never fail an insert.
// - There are no hours or status columns anywhere; real PODs carry no such data.
export const podReports = pgTable("pod_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceDocumentId: varchar("source_document_id").notNull().references(() => projectDocuments.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => delayAnalysisProjects.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().default("default"),
  reportDate: timestamp("report_date"),
  title: text("title"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  sourceDocumentIdx: index("pod_reports_source_document_idx").on(table.sourceDocumentId),
  reportDateIdx: index("pod_reports_report_date_idx").on(table.reportDate),
}));

export type PodReportRow = typeof podReports.$inferSelect;
export type InsertPodReportRow = typeof podReports.$inferInsert;

export const podSections = pgTable("pod_sections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: varchar("report_id").notNull().references(() => podReports.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  crewNumber: text("crew_number"),
  label: text("label").notNull(),
  category: text("category"),
  trucking: text("trucking"),
  traffic: text("traffic"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  reportIdx: index("pod_sections_report_idx").on(table.reportId),
}));

export type PodSectionRow = typeof podSections.$inferSelect;
export type InsertPodSectionRow = typeof podSections.$inferInsert;

export const podCrewMembers = pgTable("pod_crew_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sectionId: varchar("section_id").notNull().references(() => podSections.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  name: text("name").notNull(),
  workerId: varchar("worker_id"),
}, (table) => ({
  sectionIdx: index("pod_crew_members_section_idx").on(table.sectionId),
}));

export type PodCrewMemberRow = typeof podCrewMembers.$inferSelect;
export type InsertPodCrewMemberRow = typeof podCrewMembers.$inferInsert;

export const podEquipment = pgTable("pod_equipment", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sectionId: varchar("section_id").notNull().references(() => podSections.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  name: text("name").notNull(),
  isRental: boolean("is_rental").notNull().default(false),
}, (table) => ({
  sectionIdx: index("pod_equipment_section_idx").on(table.sectionId),
}));

export type PodEquipmentRow = typeof podEquipment.$inferSelect;
export type InsertPodEquipmentRow = typeof podEquipment.$inferInsert;

export const podTaskLines = pgTable("pod_task_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sectionId: varchar("section_id").notNull().references(() => podSections.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  description: text("description").notNull(),
  costCode: text("cost_code"),
}, (table) => ({
  sectionIdx: index("pod_task_lines_section_idx").on(table.sectionId),
}));

export type PodTaskLineRow = typeof podTaskLines.$inferSelect;
export type InsertPodTaskLineRow = typeof podTaskLines.$inferInsert;

// Foreman Diary daily reports (Jansen's internal HeavyJob diary exports) — supporting/field-
// context documents, mirroring the POD tree's conventions. A single uploaded PDF covers a
// whole date range, so it is split into one diary_reports row per calendar date found, each
// with one or more author-scoped diary_entries note blocks.
//
// Deliberate modeling decisions (do not "fix"):
// - Like POD, diaries never produce delay events; they are read-only reference context.
// - Saving re-parsed results for a source document replaces only that document's own rows
//   (see DrizzleDiaryReportRepository), so overlapping uploads for the same date coexist.
export const diaryReports = pgTable("diary_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceDocumentId: varchar("source_document_id").notNull().references(() => projectDocuments.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => delayAnalysisProjects.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().default("default"),
  reportDate: timestamp("report_date").notNull(),
  // Sequence preserves this source document's own day-record ordering (document order), since
  // multiple diary_reports rows for the same date can come from different source documents.
  sequence: integer("sequence").notNull(),
  // Records which segmentation path produced this day's entries, so a run can be audited.
  extractionMethod: text("extraction_method").notNull().default("deterministic"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  sourceDocumentIdx: index("diary_reports_source_document_idx").on(table.sourceDocumentId),
  reportDateIdx: index("diary_reports_report_date_idx").on(table.reportDate),
}));

export type DiaryReportRow = typeof diaryReports.$inferSelect;
export type InsertDiaryReportRow = typeof diaryReports.$inferInsert;

export const diaryEntries = pgTable("diary_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: varchar("report_id").notNull().references(() => diaryReports.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  authorName: text("author_name").notNull(),
  weather: text("weather"),
  // Empty string (never the literal "No notes found" placeholder text) when the source PDF's
  // Note block for this author was blank that day.
  noteText: text("note_text").notNull().default(""),
  // 1-based PDF page(s) this entry's Diary block was read from, so Results-tab evidence can
  // reference a page for the user. Null for AI-fallback entries (no page-by-page PDF walk).
  pageNumber: integer("page_number"),
  pageRangeEnd: integer("page_range_end"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  reportIdx: index("diary_entries_report_idx").on(table.reportId),
}));

export type DiaryEntryRow = typeof diaryEntries.$inferSelect;
export type InsertDiaryEntryRow = typeof diaryEntries.$inferInsert;

export const scheduleActivities = pgTable("schedule_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => delayAnalysisProjects.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().default("default"),
  sourceDocumentId: varchar("source_document_id").references(() => projectDocuments.id, { onDelete: "set null" }),
  activityId: text("activity_id").notNull(),
  wbs: text("wbs"),
  activityDescription: text("activity_description").notNull(),
  plannedStartDate: timestamp("planned_start_date"),
  plannedFinishDate: timestamp("planned_finish_date"),
  actualStartDate: timestamp("actual_start_date"),
  actualFinishDate: timestamp("actual_finish_date"),
  scheduleUpdateMonth: text("schedule_update_month"),
  isCriticalPath: text("is_critical_path").default("unknown"),
  totalFloat: integer("total_float"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertScheduleActivitySchema = createInsertSchema(scheduleActivities).omit({
  id: true,
  createdAt: true,
});

export type InsertScheduleActivity = z.infer<typeof insertScheduleActivitySchema>;
export type ScheduleActivity = typeof scheduleActivities.$inferSelect;

export const contractorDelayEvents = pgTable("contractor_delay_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => delayAnalysisProjects.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().default("default"),
  sourceDocumentId: varchar("source_document_id").references(() => projectDocuments.id, { onDelete: "set null" }),
  matchedActivityId: varchar("matched_activity_id").references(() => scheduleActivities.id, { onDelete: "set null" }),
  wbs: text("wbs"),
  cpmActivityId: text("cpm_activity_id"),
  cpmActivityDescription: text("cpm_activity_description"),
  eventDescription: text("event_description").notNull(),
  eventCategory: text("event_category"),
  eventStartDate: timestamp("event_start_date"),
  eventFinishDate: timestamp("event_finish_date"),
  impactDurationHours: real("impact_duration_hours"),
  sourceReference: text("source_reference"),
  extractedFromCode: text("extracted_from_code"),
  matchConfidence: integer("match_confidence"),
  delayEventConfidence: integer("delay_event_confidence"),
  matchReasoning: text("match_reasoning"),
  verificationStatus: text("verification_status").notNull().default("pending"),
  verifiedBy: text("verified_by"),
  verifiedAt: timestamp("verified_at"),
  // Duration provenance: the impacted window's clock times when the source narrative supports
  // them (e.g. "08:00"/"09:30"), and how impactDurationHours was actually derived. Stored as
  // dedicated columns (not metadata) because they are first-class, typed extraction output —
  // see PROVENANCE note in ContractorDelayEvent.ts. Both null for events analyzed before this
  // field existed; never backfilled.
  impactedWindowStart: text("impacted_window_start"),
  impactedWindowEnd: text("impacted_window_end"),
  durationBasis: text("duration_basis"),
  // POD provenance lives in `metadata` (jsonb) alongside the existing podEvidenceAvailable/
  // podReportCount/podCorroborated audit fields — see ContractorDelayEvent.withActivityMatch's
  // merge-only metadata patch convention. Not dedicated columns so unrelated metadata keys are
  // never at risk of being clobbered by a schema change here.
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertContractorDelayEventSchema = createInsertSchema(contractorDelayEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertContractorDelayEvent = z.infer<typeof insertContractorDelayEventSchema>;
export type ContractorDelayEvent = typeof contractorDelayEvents.$inferSelect;

export type DelayEventCategory = 
  | 'planning_mobilization'
  | 'labor_related'
  | 'materials_equipment'
  | 'subcontractor_coordination'
  | 'quality_rework'
  | 'site_management_safety'
  | 'utility_infrastructure'
  | 'other';

export type VerificationStatus = 'pending' | 'verified' | 'rejected' | 'needs_review';

export const aiTokenUsage = pgTable("ai_token_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => delayAnalysisProjects.id, { onDelete: "cascade" }),
  runId: varchar("run_id").notNull(),
  operation: text("operation").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  totalTokens: integer("total_tokens").notNull(),
  estimatedCostUsd: text("estimated_cost_usd").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAITokenUsageSchema = createInsertSchema(aiTokenUsage).omit({
  id: true,
  createdAt: true,
});

export type InsertAITokenUsage = z.infer<typeof insertAITokenUsageSchema>;
export type AITokenUsageRecord = typeof aiTokenUsage.$inferSelect;

// Measured Mile feasibility staging: two contractor-provided bid estimate workbooks, staged
// read-only for cross-referencing against POD/corridor/pay-estimate data (see migrations/0007).
//
// bid_item_labor_estimates.itemNo matches the external Azure progress_estimate_item.item_no
// key, not that table's bid_code column (which is inconsistent across pay-estimate revisions).
export const bidItemLaborEstimates = pgTable("bid_item_labor_estimates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => delayAnalysisProjects.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().default("default"),
  itemNo: integer("item_no").notNull(),
  description: text("description"),
  quantity: numeric("quantity"),
  estimatedManHours: numeric("estimated_man_hours"),
  sourceFile: text("source_file").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  projectIdx: index("bid_item_labor_estimates_project_idx").on(table.projectId),
  itemNoIdx: index("bid_item_labor_estimates_item_no_idx").on(table.itemNo),
}));

export type BidItemLaborEstimateRow = typeof bidItemLaborEstimates.$inferSelect;
export type InsertBidItemLaborEstimateRow = typeof bidItemLaborEstimates.$inferInsert;

// Flattened rows from the contractor's original HeavyBid "Direct Cost Report" (HCSS) estimate.
// subActivityCode (e.g. "14.01") uses the same decimal cost-code scheme already seen in
// podTaskLines.costCode -- verified against real data -- and is the crosswalk key connecting POD
// crew/location/date rows to bid items.
//
// Parsed from the PDF export of this report (scripts/stage-bid-cost-data-pdf.ts), not the xlsx
// export: the xlsx's merged-cell layout scrambles column boundaries row-to-row (only ~58% of the
// report's own grand total was recoverable from it), while the PDF carries real per-character x/y
// coordinates that let each numeric token be assigned to its true column via nearest-anchor
// matching against the report's fixed header positions. This recovers the full labor/material/
// matl-exp/equipment/subcontract cost breakdown, validated against the report's own printed
// "Report Totals" line. rawText preserves the full reconstructed row for any future re-parse.
export const bidItemCostEstimateLines = pgTable("bid_item_cost_estimate_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => delayAnalysisProjects.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().default("default"),
  bidItemNo: integer("bid_item_no"),
  bidItemDescription: text("bid_item_description"),
  subActivityCode: text("sub_activity_code"),
  subActivityDescription: text("sub_activity_description"),
  subActivityQuantity: numeric("sub_activity_quantity"),
  subActivityUnit: text("sub_activity_unit"),
  resourceCode: text("resource_code"),
  resourceDescription: text("resource_description"),
  pieces: numeric("pieces"),
  quantity: numeric("quantity"),
  unit: text("unit"),
  unitCost: numeric("unit_cost"),
  laborCost: numeric("labor_cost"),
  materialCost: numeric("material_cost"),
  matlExpCost: numeric("matl_exp_cost"),
  equipmentCost: numeric("equipment_cost"),
  subcontractCost: numeric("subcontract_cost"),
  lineTotal: numeric("line_total"),
  lineKind: varchar("line_kind").notNull(),
  rowIndex: integer("row_index").notNull(),
  rawText: text("raw_text").notNull(),
  sourceFile: text("source_file").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  projectIdx: index("bid_item_cost_estimate_lines_project_idx").on(table.projectId),
  bidItemIdx: index("bid_item_cost_estimate_lines_bid_item_idx").on(table.bidItemNo),
  subActivityIdx: index("bid_item_cost_estimate_lines_sub_activity_idx").on(table.subActivityCode),
}));

export type BidItemCostEstimateLineRow = typeof bidItemCostEstimateLines.$inferSelect;
export type InsertBidItemCostEstimateLineRow = typeof bidItemCostEstimateLines.$inferInsert;

// Progress Estimate (pay estimate) line items: one row per (pay-estimate period, bid item),
// parsed from the 57 SDOT "Progress Estimate Detail" documents (Template C-20D). Unlike
// bidItemCostEstimateLines/bidItemLaborEstimates (single point-in-time bid estimates), this
// carries a real, approved, dated time series of actual installed quantity and actual $ paid
// per bid item -- the "actual production over time" axis for Measured Mile.
//
// itemNo uses the same crosswalk key as bidItemLaborEstimates.itemNo /
// bidItemCostEstimateLines.bidItemNo (verified to match across sample item numbers).
//
// previousAmount/quantityThisEstimate/amountDueThisEstimate are nullable: the PDF-format
// estimates (56 of 57) carry them directly, but the one xlsx-format estimate (PE47) only
// exposes quantityToDate/totalAmountToDate -- period deltas for that row can be derived later
// from the surrounding PEs' cumulative values.
export const bidItemProgressEstimates = pgTable("bid_item_progress_estimates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => delayAnalysisProjects.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().default("default"),
  peNumber: integer("pe_number").notNull(),
  cutoffDate: text("cutoff_date"),
  periodStart: text("period_start"),
  periodEnd: text("period_end"),
  itemNo: integer("item_no"),
  bidCode: text("bid_code"),
  description: text("description"),
  units: text("units"),
  unitPrice: numeric("unit_price"),
  contractQuantity: numeric("contract_quantity"),
  quantityToDate: numeric("quantity_to_date"),
  percentComplete: numeric("percent_complete"),
  totalAmountToDate: numeric("total_amount_to_date"),
  previousAmount: numeric("previous_amount"),
  quantityThisEstimate: numeric("quantity_this_estimate"),
  amountDueThisEstimate: numeric("amount_due_this_estimate"),
  sourceFile: text("source_file").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  projectIdx: index("bid_item_progress_estimates_project_idx").on(table.projectId),
  itemNoIdx: index("bid_item_progress_estimates_item_no_idx").on(table.itemNo),
  peNumberIdx: index("bid_item_progress_estimates_pe_number_idx").on(table.peNumber),
}));

export type BidItemProgressEstimateRow = typeof bidItemProgressEstimates.$inferSelect;
export type InsertBidItemProgressEstimateRow = typeof bidItemProgressEstimates.$inferInsert;

// One row per pay-estimate period (1-57), including periods whose item detail could not be
// recovered at all. This is the data-quality record for the Measured Mile analysis to surface
// to users: which periods are fully trustworthy, which have a small known discrepancy against
// the document's own printed cover total, and which are missing outright (and why).
export const payEstimatePeriods = pgTable("pay_estimate_periods", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => delayAnalysisProjects.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().default("default"),
  peNumber: integer("pe_number").notNull(),
  sourceFile: text("source_file").notNull(),
  cutoffDate: text("cutoff_date"),
  periodStart: text("period_start"),
  periodEnd: text("period_end"),
  itemCount: integer("item_count").notNull().default(0),
  printedToDateTotal: numeric("printed_to_date_total"),
  summedToDateTotal: numeric("summed_to_date_total"),
  toDateDelta: numeric("to_date_delta"),
  toDateDeltaPct: numeric("to_date_delta_pct"),
  status: text("status").notNull(), // 'exact' | 'minor_discrepancy' | 'significant_discrepancy' | 'unvalidated' | 'unrecoverable'
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  projectIdx: index("pay_estimate_periods_project_idx").on(table.projectId),
  peNumberIdx: index("pay_estimate_periods_pe_number_idx").on(table.peNumber),
}));

export type PayEstimatePeriodRow = typeof payEstimatePeriods.$inferSelect;
export type InsertPayEstimatePeriodRow = typeof payEstimatePeriods.$inferInsert;

// Measured labor hours staged from the separate Azure claims-investigation database (see
// scripts/stage-labor-hours.ts), which holds real force-account cost detail and owner-inspector
// daily reports for this same job -- data that does not exist anywhere in this app's own schema.
// Staged (not queried live) so the app keeps one data source, matching the pay-estimate pattern.
//
// Every row here is force-account (changed/extra work), never base-contract production: it is
// the wrong denominator for a productivity factor but the right numerator for measuring
// disruption intensity (how many hours got diverted into extra work in a period).
//
// txnId is the source system's own transaction id, already deduplicated across every source
// document copy that carried it (see the source's own extraction_basis note) -- do not
// multiply by any copy count. Unique per project so re-running the staging script is idempotent.
export const forceAccountTransactions = pgTable("force_account_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => delayAnalysisProjects.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().default("default"),
  txnId: text("txn_id").notNull(),
  txnType: text("txn_type").notNull(), // e.g. FORCE_ACCOUNT_LABOR, FORCE_ACCOUNT_PRIME_EQUIPMENT, FORCE_ACCOUNT_EQUIPMENT
  txnDateRaw: text("txn_date_raw").notNull(),
  // Normalized ISO date, null when the source's free-text date could not be parsed at all.
  txnDate: text("txn_date"),
  resource: text("resource"), // pseudonymized PERSON-xxxx for labor, equipment unit/name for equipment
  classification: text("classification"), // raw source string, e.g. "JW | STRAIGHT_TIME"
  craft: text("craft"), // parsed portion before "|"; null when classification has no craft segment
  timeBasis: text("time_basis"), // STRAIGHT_TIME | OVERTIME | DOUBLE_TIME, parsed from classification
  quantity: numeric("quantity"), // hours
  unit: text("unit"),
  rate: numeric("rate"),
  amount: numeric("amount"),
  costCode: text("cost_code"),
  faNo: text("fa_no"),
  workDescription: text("work_description"),
  vendorOrSub: text("vendor_or_sub"),
  sourceDocId: text("source_doc_id"),
  locator: text("locator"),
  verbatimLine: text("verbatim_line"),
  // True when txnDateRaw failed to parse, or parsed outside this job's plausible date range
  // (2020-2027) -- e.g. 3 known source rows land in 2002/2014. Kept and flagged rather than
  // dropped, matching the per-record data-quality pattern used for pay-estimate periods.
  quarantined: boolean("quarantined").notNull().default(false),
  quarantineReason: text("quarantine_reason"),
  sourceSystem: text("source_system").notNull().default("azure_claims_db:cost_transaction"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  projectIdx: index("force_account_transactions_project_idx").on(table.projectId),
  txnDateIdx: index("force_account_transactions_txn_date_idx").on(table.txnDate),
  txnTypeIdx: index("force_account_transactions_txn_type_idx").on(table.txnType),
  projectTxnIdx: index("force_account_transactions_project_txn_idx").on(table.projectId, table.txnId),
}));

export type ForceAccountTransactionRow = typeof forceAccountTransactions.$inferSelect;
export type InsertForceAccountTransactionRow = typeof forceAccountTransactions.$inferInsert;

// Owner-inspector daily reports staged from the Azure claims database, independent of the
// contractor's own POD records (podReports/podSections/etc.). crewCount is the one directly
// comparable figure to POD's crew-member-count proxy, recorded here by the other side of the
// job -- agreement between the two is what makes the crew-count productivity proxy defensible.
export const inspectorDailyReports = pgTable("inspector_daily_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => delayAnalysisProjects.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().default("default"),
  azureDrId: text("azure_dr_id").notNull(), // source dr_id, for idempotent re-staging
  reportDate: text("report_date"),
  // Source's own confidence label for reportDate (e.g. "FORM AND RUNNING HEADER AGREE" vs
  // "DATE_WITNESSES_DISAGREE") -- surface this rather than treating every date as equally solid.
  dateAgreement: text("date_agreement"),
  contractor: text("contractor"),
  location: text("location_"),
  inspector: text("inspector"),
  // Plain integer headcount parsed from the source's free-text crew_roster field; null when
  // that field was absent/empty/non-numeric for this report.
  crewCount: integer("crew_count"),
  contractWorkPerformed: text("contract_work_performed"),
  delaysAndReason: text("delays_and_reason"),
  extraWorkForceAccount: text("extra_work_force_account"),
  equipmentTable: text("equipment_table"),
  sourceFile: text("source_file"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  projectIdx: index("inspector_daily_reports_project_idx").on(table.projectId),
  reportDateIdx: index("inspector_daily_reports_report_date_idx").on(table.reportDate),
  projectDrIdx: index("inspector_daily_reports_project_dr_idx").on(table.projectId, table.azureDrId),
}));

export type InspectorDailyReportRow = typeof inspectorDailyReports.$inferSelect;
export type InsertInspectorDailyReportRow = typeof inspectorDailyReports.$inferInsert;

// One row per line-item in the "Employee Job Detail Report by Earn Code & Pay Date" (677-page
// payroll PDF, staged via scripts/stage-payroll-job-hours.ts). This is the actual man-hours
// charged to job 211 -- the missing term for a measured (not crew-count-proxy) productivity
// factor: base-contract hours = total job hours - force-account hours (forceAccountTransactions).
//
// The source only prints a PAY date, never a work date (title: "...by Earn Code & Pay Date").
// Certified weekly payroll typically lags the work it pays for by up to about two weeks, so each
// row also carries an estimated work-date window computed from that assumption -- this offset is
// data (estimatedWorkDateStart/End, assumedOffsetMinDays/MaxDays), not just a code comment, per
// the task's explicit requirement not to silently treat pay date as work date.
export const payrollJobLaborEntries = pgTable("payroll_job_labor_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => delayAnalysisProjects.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().default("default"),
  employeeNumber: text("employee_number").notNull(), // e.g. "1017" -- the report's own employee code
  employeeRaw: text("employee_raw").notNull(), // pseudonymized, verbatim (may include stray continuation fragments the report itself wraps onto a second line)
  earnCode: text("earn_code").notNull(), // REG, OT, DT, HOL, VAC, PSST, ADJ, FRNG, PRSNL, KOS, LUNCH, REIMB, RETRO, WAPFM, KOSHW, PRO, BRVMT
  tradeRaw: text("trade_raw").notNull(),
  tradeCode: text("trade_code"), // parsed prefix before " - " when it looks like a clean code; null when pseudonymization mangled it
  tradeLabel: text("trade_label"), // parsed suffix after " - "
  tradeCategory: text("trade_category"), // 'direct' | 'indirect', null when unresolved (see tradeResolved)
  tradeResolved: boolean("trade_resolved").notNull().default(false), // false = raw trade text matched no known craft/indirect keyword; flagged, not guessed
  marker: text("marker"), // '*' = non-hourly quantity, '#' = premium time (per the report's own legend); null for ordinary rows
  amount: numeric("amount").notNull(),
  hours: numeric("hours"), // null for non-hourly rows (ADJ, some REIMB/FRNG) -- excluded from hour totals, never coerced to 0
  payDateRaw: text("pay_date_raw").notNull(), // as printed, MM/DD/YYYY
  payDate: text("pay_date"), // normalized ISO; null if unparseable
  // Estimated actual work-date window, derived from payDate under a documented 1-14 day certified
  // weekly-payroll lag assumption -- not a measured value. See assumedOffset*Days.
  estimatedWorkDateStart: text("estimated_work_date_start"),
  estimatedWorkDateEnd: text("estimated_work_date_end"),
  assumedOffsetMinDays: integer("assumed_offset_min_days").notNull().default(1),
  assumedOffsetMaxDays: integer("assumed_offset_max_days").notNull().default(14),
  pageNo: integer("page_no").notNull(), // provenance: page of the source PDF this row was read from
  quarantined: boolean("quarantined").notNull().default(false),
  quarantineReason: text("quarantine_reason"),
  sourceFile: text("source_file").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  projectIdx: index("payroll_job_labor_entries_project_idx").on(table.projectId),
  payDateIdx: index("payroll_job_labor_entries_pay_date_idx").on(table.payDate),
  employeeIdx: index("payroll_job_labor_entries_employee_idx").on(table.employeeNumber),
  tradeCategoryIdx: index("payroll_job_labor_entries_trade_category_idx").on(table.tradeCategory),
}));

export type PayrollJobLaborEntryRow = typeof payrollJobLaborEntries.$inferSelect;
export type InsertPayrollJobLaborEntryRow = typeof payrollJobLaborEntries.$inferInsert;

// Reconciliation of parsed detail rows against the report's own printed subtotals -- the
// pay-estimate precedent applied here. One row per employee (the only sub-total granularity the
// source actually prints; there is no printed monthly subtotal, so month-level rollups are
// computed on the fly from payrollJobLaborEntries and are not separately reconciled here), plus
// one synthetic row with employeeNumber = '__REPORT_TOTAL__' for the document's single grand
// total ("Job 211 Subtotal:" / "Report Totals:").
export const payrollReconciliation = pgTable("payroll_reconciliation", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => delayAnalysisProjects.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().default("default"),
  employeeNumber: text("employee_number").notNull(),
  printedAmountSubtotal: numeric("printed_amount_subtotal"),
  printedHoursSubtotal: numeric("printed_hours_subtotal"),
  computedAmountSubtotal: numeric("computed_amount_subtotal").notNull(),
  computedHoursSubtotal: numeric("computed_hours_subtotal").notNull(),
  amountDelta: numeric("amount_delta"),
  hoursDelta: numeric("hours_delta"),
  hoursDeltaPct: numeric("hours_delta_pct"),
  status: text("status").notNull(), // 'exact' | 'minor_discrepancy' | 'significant_discrepancy' | 'unvalidated' | 'unparseable'
  notes: text("notes"),
  pageNo: integer("page_no"), // page the printed subtotal appeared on
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  projectIdx: index("payroll_reconciliation_project_idx").on(table.projectId),
  employeeIdx: index("payroll_reconciliation_employee_idx").on(table.employeeNumber),
  statusIdx: index("payroll_reconciliation_status_idx").on(table.status),
}));

export type PayrollReconciliationRow = typeof payrollReconciliation.$inferSelect;
export type InsertPayrollReconciliationRow = typeof payrollReconciliation.$inferInsert;

// Measured Mile page: pure UI state layered on top of the deterministic calculator (see
// server/src/domain/measured-mile/MeasuredMileCalculator.ts). Neither table stores a computed
// figure -- they only tell the calculator which periods the user has manually flagged.
export const measuredMilePeriodTags = pgTable("measured_mile_period_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => delayAnalysisProjects.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().default("default"),
  itemNo: integer("item_no").notNull(),
  peNumber: integer("pe_number").notNull(),
  tag: text("tag").notNull().default("acceleration"), // only 'acceleration' for now
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  projectItemIdx: index("measured_mile_period_tags_project_item_idx").on(table.projectId, table.itemNo),
}));

export type MeasuredMilePeriodTagRow = typeof measuredMilePeriodTags.$inferSelect;
export type InsertMeasuredMilePeriodTagRow = typeof measuredMilePeriodTags.$inferInsert;

export const measuredMileWindowOverrides = pgTable("measured_mile_window_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => delayAnalysisProjects.id, { onDelete: "cascade" }),
  tenantId: varchar("tenant_id").notNull().default("default"),
  itemNo: integer("item_no").notNull(),
  startPeNumber: integer("start_pe_number").notNull(),
  endPeNumber: integer("end_pe_number").notNull(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type MeasuredMileWindowOverrideRow = typeof measuredMileWindowOverrides.$inferSelect;
export type InsertMeasuredMileWindowOverrideRow = typeof measuredMileWindowOverrides.$inferInsert;
