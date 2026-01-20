import type { Request, Response } from "express";
import type { ICommandBus } from "../../application/interfaces/ICommandBus";
import type { IQueryBus } from "../../application/interfaces/IQueryBus";
import { CreateDelayAnalysisProjectCommand } from "../../application/delay-analysis/commands/CreateDelayAnalysisProjectCommand";
import { UpdateDelayAnalysisProjectCommand } from "../../application/delay-analysis/commands/UpdateDelayAnalysisProjectCommand";
import { DeleteDelayAnalysisProjectCommand } from "../../application/delay-analysis/commands/DeleteDelayAnalysisProjectCommand";
import { GetDelayAnalysisProjectQuery } from "../../application/delay-analysis/queries/GetDelayAnalysisProjectQuery";
import { ListDelayAnalysisProjectsQuery } from "../../application/delay-analysis/queries/ListDelayAnalysisProjectsQuery";

export class DelayAnalysisProjectController {
  constructor(
    private readonly commandBus: ICommandBus,
    private readonly queryBus: IQueryBus
  ) {}

  async listProjects(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req as any).tenantId ?? 'default';
      const query = new ListDelayAnalysisProjectsQuery(tenantId);
      const projects = await this.queryBus.execute(query);
      res.json(projects);
    } catch (error) {
      console.error('Error listing delay analysis projects:', error);
      res.status(500).json({ error: 'Failed to list projects' });
    }
  }

  async getProject(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req as any).tenantId ?? 'default';
      const { id } = req.params;
      
      const query = new GetDelayAnalysisProjectQuery(tenantId, id);
      const project = await this.queryBus.execute(query);
      
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      
      res.json(project);
    } catch (error) {
      console.error('Error getting delay analysis project:', error);
      res.status(500).json({ error: 'Failed to get project' });
    }
  }

  async createProject(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req as any).tenantId ?? 'default';
      const { name, description, contractNumber, noticeToProceedDate } = req.body;
      
      if (!name) {
        res.status(400).json({ error: 'Project name is required' });
        return;
      }
      
      const command = new CreateDelayAnalysisProjectCommand(
        tenantId,
        name,
        description,
        contractNumber,
        noticeToProceedDate ? new Date(noticeToProceedDate) : undefined
      );
      
      const project = await this.commandBus.execute(command);
      res.status(201).json(project);
    } catch (error) {
      console.error('Error creating delay analysis project:', error);
      res.status(500).json({ error: 'Failed to create project' });
    }
  }

  async updateProject(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req as any).tenantId ?? 'default';
      const { id } = req.params;
      const { name, description, contractNumber, noticeToProceedDate, status } = req.body;
      
      const command = new UpdateDelayAnalysisProjectCommand(
        tenantId,
        id,
        name,
        description,
        contractNumber,
        noticeToProceedDate ? new Date(noticeToProceedDate) : undefined,
        status
      );
      
      const project = await this.commandBus.execute(command);
      res.json(project);
    } catch (error) {
      console.error('Error updating delay analysis project:', error);
      res.status(500).json({ error: 'Failed to update project' });
    }
  }

  async deleteProject(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req as any).tenantId ?? 'default';
      const { id } = req.params;
      
      const command = new DeleteDelayAnalysisProjectCommand(tenantId, id);
      await this.commandBus.execute(command);
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting delay analysis project:', error);
      res.status(500).json({ error: 'Failed to delete project' });
    }
  }
}
