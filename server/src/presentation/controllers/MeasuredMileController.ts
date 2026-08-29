import type { Request, Response } from 'express';
import type { ListEligibleMeasuredMileItemsQueryHandler } from '../../application/delay-analysis/queries/handlers/ListEligibleMeasuredMileItemsQueryHandler';
import type { GetMeasuredMileSeriesQueryHandler } from '../../application/delay-analysis/queries/handlers/GetMeasuredMileSeriesQueryHandler';
import type { GetJobWideProductivityQueryHandler } from '../../application/delay-analysis/queries/handlers/GetJobWideProductivityQueryHandler';
import type { GetMeasuredMilePeriodDetailQueryHandler } from '../../application/delay-analysis/queries/handlers/GetMeasuredMilePeriodDetailQueryHandler';
import type { SetAccelerationTagCommandHandler } from '../../application/delay-analysis/commands/handlers/SetAccelerationTagCommandHandler';
import type { ClearAccelerationTagCommandHandler } from '../../application/delay-analysis/commands/handlers/ClearAccelerationTagCommandHandler';
import type { SetMeasuredMileOverrideCommandHandler } from '../../application/delay-analysis/commands/handlers/SetMeasuredMileOverrideCommandHandler';
import type { ClearMeasuredMileOverrideCommandHandler } from '../../application/delay-analysis/commands/handlers/ClearMeasuredMileOverrideCommandHandler';
import type { GetMeasuredMileLocationSeriesQueryHandler } from '../../application/delay-analysis/queries/handlers/GetMeasuredMileLocationSeriesQueryHandler';
import type { GetCorridorLocationsQueryHandler } from '../../application/delay-analysis/queries/handlers/GetCorridorLocationsQueryHandler';
import type { UpdateCorridorLocationCommandHandler } from '../../application/delay-analysis/commands/handlers/UpdateCorridorLocationCommandHandler';
import type { SetLocationOverrideCommandHandler } from '../../application/delay-analysis/commands/handlers/SetLocationOverrideCommandHandler';
import type { ClearLocationOverrideCommandHandler } from '../../application/delay-analysis/commands/handlers/ClearLocationOverrideCommandHandler';
import {
  measuredMileProjectParamsSchema,
  measuredMileItemParamsSchema,
  measuredMileItemPeriodParamsSchema,
  measuredMilePeriodParamsSchema,
  measuredMileSeriesQuerySchema,
  measuredMilePeriodDetailQuerySchema,
  setAccelerationTagBodySchema,
  setMeasuredMileOverrideBodySchema,
  measuredMileLocationParamsSchema,
  updateCorridorLocationBodySchema,
  setLocationOverrideBodySchema,
  clearLocationOverrideBodySchema,
} from '../validators/measuredMileValidators';

const DEFAULT_TENANT_ID = 'default';

export class MeasuredMileController {
  constructor(
    private readonly listEligibleItemsHandler: ListEligibleMeasuredMileItemsQueryHandler,
    private readonly getSeriesHandler: GetMeasuredMileSeriesQueryHandler,
    private readonly getJobWideProductivityHandler: GetJobWideProductivityQueryHandler,
    private readonly getPeriodDetailHandler: GetMeasuredMilePeriodDetailQueryHandler,
    private readonly setAccelerationTagHandler: SetAccelerationTagCommandHandler,
    private readonly clearAccelerationTagHandler: ClearAccelerationTagCommandHandler,
    private readonly setOverrideHandler: SetMeasuredMileOverrideCommandHandler,
    private readonly clearOverrideHandler: ClearMeasuredMileOverrideCommandHandler,
    private readonly getLocationSeriesHandler: GetMeasuredMileLocationSeriesQueryHandler,
    private readonly getCorridorLocationsHandler: GetCorridorLocationsQueryHandler,
    private readonly updateCorridorLocationHandler: UpdateCorridorLocationCommandHandler,
    private readonly setLocationOverrideHandler: SetLocationOverrideCommandHandler,
    private readonly clearLocationOverrideHandler: ClearLocationOverrideCommandHandler
  ) {}

  async listEligibleItems(req: Request, res: Response): Promise<void> {
    try {
      const params = measuredMileProjectParamsSchema.parse(req.params);
      const items = await this.listEligibleItemsHandler.execute({ projectId: params.projectId, tenantId: DEFAULT_TENANT_ID });
      res.json({ success: true, data: items });
    } catch (error) {
      this.handleError(res, error, 'Failed to list eligible bid items');
    }
  }

  async getSeries(req: Request, res: Response): Promise<void> {
    try {
      const params = measuredMileItemParamsSchema.parse(req.params);
      const query = measuredMileSeriesQuerySchema.parse(req.query);
      const result = await this.getSeriesHandler.execute({
        projectId: params.projectId,
        tenantId: DEFAULT_TENANT_ID,
        itemNo: params.itemNo,
        verifiedOnly: query.verifiedOnly ?? false,
        wbsCodes: query.wbsCodes,
        shiftHours: query.shiftHours,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      this.handleError(res, error, 'Failed to compute measured mile series');
    }
  }

  async getJobWideProductivity(req: Request, res: Response): Promise<void> {
    try {
      const params = measuredMileProjectParamsSchema.parse(req.params);
      const result = await this.getJobWideProductivityHandler.execute({ projectId: params.projectId, tenantId: DEFAULT_TENANT_ID });
      res.json({ success: true, data: result });
    } catch (error) {
      this.handleError(res, error, 'Failed to compute job-wide productivity');
    }
  }

  async getPeriodDetail(req: Request, res: Response): Promise<void> {
    try {
      const params = measuredMilePeriodParamsSchema.parse(req.params);
      const query = measuredMilePeriodDetailQuerySchema.parse(req.query);
      const result = await this.getPeriodDetailHandler.execute({
        projectId: params.projectId,
        tenantId: DEFAULT_TENANT_ID,
        peNumber: params.peNumber,
        verifiedOnly: query.verifiedOnly ?? false,
        wbsCodes: query.wbsCodes,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      this.handleError(res, error, 'Failed to load period detail');
    }
  }

  async setAccelerationTag(req: Request, res: Response): Promise<void> {
    try {
      const params = measuredMileItemPeriodParamsSchema.parse(req.params);
      const body = setAccelerationTagBodySchema.parse(req.body ?? {});
      await this.setAccelerationTagHandler.handle({
        type: 'SetAccelerationTagCommand',
        projectId: params.projectId,
        tenantId: DEFAULT_TENANT_ID,
        itemNo: params.itemNo,
        peNumber: params.peNumber,
        createdBy: body.createdBy,
      });
      res.json({ success: true });
    } catch (error) {
      this.handleError(res, error, 'Failed to set acceleration tag');
    }
  }

  async clearAccelerationTag(req: Request, res: Response): Promise<void> {
    try {
      const params = measuredMileItemPeriodParamsSchema.parse(req.params);
      await this.clearAccelerationTagHandler.handle({
        type: 'ClearAccelerationTagCommand',
        projectId: params.projectId,
        tenantId: DEFAULT_TENANT_ID,
        itemNo: params.itemNo,
        peNumber: params.peNumber,
      });
      res.json({ success: true });
    } catch (error) {
      this.handleError(res, error, 'Failed to clear acceleration tag');
    }
  }

  async setMeasuredMileOverride(req: Request, res: Response): Promise<void> {
    try {
      const params = measuredMileItemParamsSchema.parse(req.params);
      const body = setMeasuredMileOverrideBodySchema.parse(req.body ?? {});
      if (body.startPeNumber > body.endPeNumber) {
        res.status(400).json({ success: false, error: 'startPeNumber must be less than or equal to endPeNumber' });
        return;
      }
      await this.setOverrideHandler.handle({
        type: 'SetMeasuredMileOverrideCommand',
        projectId: params.projectId,
        tenantId: DEFAULT_TENANT_ID,
        itemNo: params.itemNo,
        startPeNumber: body.startPeNumber,
        endPeNumber: body.endPeNumber,
        createdBy: body.createdBy,
      });
      res.json({ success: true });
    } catch (error) {
      this.handleError(res, error, 'Failed to set measured mile override');
    }
  }

  async clearMeasuredMileOverride(req: Request, res: Response): Promise<void> {
    try {
      const params = measuredMileItemParamsSchema.parse(req.params);
      await this.clearOverrideHandler.handle({
        type: 'ClearMeasuredMileOverrideCommand',
        projectId: params.projectId,
        tenantId: DEFAULT_TENANT_ID,
        itemNo: params.itemNo,
      });
      res.json({ success: true });
    } catch (error) {
      this.handleError(res, error, 'Failed to clear measured mile override');
    }
  }

  async getLocationSeries(req: Request, res: Response): Promise<void> {
    try {
      const params = measuredMileItemParamsSchema.parse(req.params);
      const query = measuredMileSeriesQuerySchema.parse(req.query);
      const result = await this.getLocationSeriesHandler.execute({
        projectId: params.projectId,
        tenantId: DEFAULT_TENANT_ID,
        itemNo: params.itemNo,
        verifiedOnly: query.verifiedOnly ?? false,
        wbsCodes: query.wbsCodes,
        shiftHours: query.shiftHours,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      this.handleError(res, error, 'Failed to compute measured mile location series');
    }
  }

  async getCorridorLocations(req: Request, res: Response): Promise<void> {
    try {
      const params = measuredMileProjectParamsSchema.parse(req.params);
      const result = await this.getCorridorLocationsHandler.execute({ projectId: params.projectId, tenantId: DEFAULT_TENANT_ID });
      res.json({ success: true, data: result });
    } catch (error) {
      this.handleError(res, error, 'Failed to load corridor locations');
    }
  }

  async updateCorridorLocation(req: Request, res: Response): Promise<void> {
    try {
      const params = measuredMileLocationParamsSchema.parse(req.params);
      const body = updateCorridorLocationBodySchema.parse(req.body ?? {});
      const result = await this.updateCorridorLocationHandler.handle({
        type: 'UpdateCorridorLocationCommand',
        projectId: params.projectId,
        tenantId: DEFAULT_TENANT_ID,
        locationKey: params.locationKey,
        label: body.label,
        stationOrder: body.stationOrder,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      this.handleError(res, error, 'Failed to update corridor location');
    }
  }

  async setLocationOverride(req: Request, res: Response): Promise<void> {
    try {
      const params = measuredMileProjectParamsSchema.parse(req.params);
      const body = setLocationOverrideBodySchema.parse(req.body ?? {});
      await this.setLocationOverrideHandler.handle({
        type: 'SetLocationOverrideCommand',
        projectId: params.projectId,
        tenantId: DEFAULT_TENANT_ID,
        rawText: body.rawText,
        locationKey: body.locationKey,
        createdBy: body.createdBy,
      });
      res.json({ success: true });
    } catch (error) {
      this.handleError(res, error, 'Failed to set location override');
    }
  }

  async clearLocationOverride(req: Request, res: Response): Promise<void> {
    try {
      const params = measuredMileProjectParamsSchema.parse(req.params);
      const body = clearLocationOverrideBodySchema.parse(req.body ?? {});
      await this.clearLocationOverrideHandler.handle({
        type: 'ClearLocationOverrideCommand',
        projectId: params.projectId,
        tenantId: DEFAULT_TENANT_ID,
        rawText: body.rawText,
      });
      res.json({ success: true });
    } catch (error) {
      this.handleError(res, error, 'Failed to clear location override');
    }
  }

  private handleError(res: Response, error: unknown, fallbackMessage: string): void {
    if (error instanceof Error && error.name === 'ZodError') {
      res.status(400).json({ success: false, error: 'Invalid request parameters' });
      return;
    }
    console.error(fallbackMessage, error);
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : fallbackMessage });
  }
}
