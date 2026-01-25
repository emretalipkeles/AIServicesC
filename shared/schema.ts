import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
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

export type ProjectDocumentType = 'idr' | 'ncr' | 'field_memo' | 'cpm_schedule' | 'contract_plan' | 'dsc_claim' | 'other';

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
  impactDurationHours: integer("impact_duration_hours"),
  sourceReference: text("source_reference"),
  extractedFromCode: text("extracted_from_code"),
  matchConfidence: integer("match_confidence"),
  matchReasoning: text("match_reasoning"),
  verificationStatus: text("verification_status").notNull().default("pending"),
  verifiedBy: text("verified_by"),
  verifiedAt: timestamp("verified_at"),
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
