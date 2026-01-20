import { 
  type User, type InsertUser,
  type Client, type InsertClient,
  type Journey, type InsertJourney,
  type ChatMessage, type InsertChatMessage
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getClients(): Promise<Client[]>;
  getClient(id: string): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  
  getJourneys(): Promise<Journey[]>;
  getJourney(id: string): Promise<Journey | undefined>;
  getJourneysByClientId(clientId: string): Promise<Journey[]>;
  createJourney(journey: InsertJourney): Promise<Journey>;
  updateJourneyProgress(id: string, progress: number, status?: string): Promise<Journey | undefined>;
  
  getChatMessages(): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private clients: Map<string, Client>;
  private journeys: Map<string, Journey>;
  private chatMessages: Map<string, ChatMessage>;

  constructor() {
    this.users = new Map();
    this.clients = new Map();
    this.journeys = new Map();
    this.chatMessages = new Map();
    
    this.seedData();
  }

  private seedData() {
    const clients: Client[] = [
      {
        id: "c1",
        name: "John Smith",
        company: "Acme Corp",
        email: "john@acme.com",
        industry: "Technology",
        createdAt: new Date(),
      },
      {
        id: "c2", 
        name: "Sarah Johnson",
        company: "TechStart Inc",
        email: "sarah@techstart.com",
        industry: "Software",
        createdAt: new Date(),
      },
      {
        id: "c3",
        name: "Michael Chen",
        company: "GlobalTech",
        email: "michael@globaltech.com",
        industry: "Finance",
        createdAt: new Date(),
      },
    ];
    
    clients.forEach(client => this.clients.set(client.id, client));
    
    const journeys: Journey[] = [
      {
        id: "j1",
        name: "Enterprise Onboarding",
        clientId: "c1",
        status: "in_progress",
        progress: 65,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "j2",
        name: "SMB Sales Flow",
        clientId: "c2",
        status: "completed",
        progress: 100,
        createdAt: new Date(Date.now() - 86400000),
        updatedAt: new Date(),
      },
      {
        id: "j3",
        name: "Renewal Campaign",
        clientId: "c3",
        status: "paused",
        progress: 40,
        createdAt: new Date(Date.now() - 172800000),
        updatedAt: new Date(),
      },
    ];
    
    journeys.forEach(journey => this.journeys.set(journey.id, journey));
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getClients(): Promise<Client[]> {
    return Array.from(this.clients.values());
  }

  async getClient(id: string): Promise<Client | undefined> {
    return this.clients.get(id);
  }

  async createClient(insertClient: InsertClient): Promise<Client> {
    const id = randomUUID();
    const client: Client = { 
      ...insertClient, 
      id, 
      createdAt: new Date() 
    };
    this.clients.set(id, client);
    return client;
  }

  async getJourneys(): Promise<Journey[]> {
    return Array.from(this.journeys.values());
  }

  async getJourney(id: string): Promise<Journey | undefined> {
    return this.journeys.get(id);
  }

  async getJourneysByClientId(clientId: string): Promise<Journey[]> {
    return Array.from(this.journeys.values()).filter(
      (journey) => journey.clientId === clientId
    );
  }

  async createJourney(insertJourney: InsertJourney): Promise<Journey> {
    const id = randomUUID();
    const journey: Journey = {
      ...insertJourney,
      id,
      status: insertJourney.status || "in_progress",
      progress: insertJourney.progress || 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.journeys.set(id, journey);
    return journey;
  }

  async updateJourneyProgress(id: string, progress: number, status?: string): Promise<Journey | undefined> {
    const journey = this.journeys.get(id);
    if (!journey) return undefined;
    
    journey.progress = progress;
    if (status) journey.status = status;
    journey.updatedAt = new Date();
    
    this.journeys.set(id, journey);
    return journey;
  }

  async getChatMessages(): Promise<ChatMessage[]> {
    return Array.from(this.chatMessages.values());
  }

  async createChatMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    const id = randomUUID();
    const message: ChatMessage = {
      ...insertMessage,
      id,
      timestamp: new Date(),
    };
    this.chatMessages.set(id, message);
    return message;
  }
}

export const storage = new MemStorage();
