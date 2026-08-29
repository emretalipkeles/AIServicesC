import type { Express } from 'express';
import type { AppContainer } from '../../infrastructure/bootstrap';
import { MeasuredMileController } from '../controllers/MeasuredMileController';
import { ListEligibleMeasuredMileItemsQueryHandler } from '../../application/delay-analysis/queries/handlers/ListEligibleMeasuredMileItemsQueryHandler';
import { GetMeasuredMileSeriesQueryHandler } from '../../application/delay-analysis/queries/handlers/GetMeasuredMileSeriesQueryHandler';
import { GetJobWideProductivityQueryHandler } from '../../application/delay-analysis/queries/handlers/GetJobWideProductivityQueryHandler';
import { GetMeasuredMilePeriodDetailQueryHandler } from '../../application/delay-analysis/queries/handlers/GetMeasuredMilePeriodDetailQueryHandler';
import { SetAccelerationTagCommandHandler } from '../../application/delay-analysis/commands/handlers/SetAccelerationTagCommandHandler';
import { ClearAccelerationTagCommandHandler } from '../../application/delay-analysis/commands/handlers/ClearAccelerationTagCommandHandler';
import { SetMeasuredMileOverrideCommandHandler } from '../../application/delay-analysis/commands/handlers/SetMeasuredMileOverrideCommandHandler';
import { ClearMeasuredMileOverrideCommandHandler } from '../../application/delay-analysis/commands/handlers/ClearMeasuredMileOverrideCommandHandler';

export function registerMeasuredMileRoutes(app: Express, container: AppContainer): void {
  const repo = container.repositories.measuredMile;

  const controller = new MeasuredMileController(
    new ListEligibleMeasuredMileItemsQueryHandler(repo),
    new GetMeasuredMileSeriesQueryHandler(repo),
    new GetJobWideProductivityQueryHandler(repo),
    new GetMeasuredMilePeriodDetailQueryHandler(repo),
    new SetAccelerationTagCommandHandler(repo),
    new ClearAccelerationTagCommandHandler(repo),
    new SetMeasuredMileOverrideCommandHandler(repo),
    new ClearMeasuredMileOverrideCommandHandler(repo)
  );

  const base = '/api/delay-analysis/projects/:projectId/measured-mile';

  app.get(`${base}/items`, (req, res) => controller.listEligibleItems(req, res));
  app.get(`${base}/job-wide-productivity`, (req, res) => controller.getJobWideProductivity(req, res));
  app.get(`${base}/periods/:peNumber/detail`, (req, res) => controller.getPeriodDetail(req, res));
  app.get(`${base}/items/:itemNo/series`, (req, res) => controller.getSeries(req, res));
  app.post(`${base}/items/:itemNo/acceleration/:peNumber`, (req, res) => controller.setAccelerationTag(req, res));
  app.delete(`${base}/items/:itemNo/acceleration/:peNumber`, (req, res) => controller.clearAccelerationTag(req, res));
  app.put(`${base}/items/:itemNo/window-override`, (req, res) => controller.setMeasuredMileOverride(req, res));
  app.delete(`${base}/items/:itemNo/window-override`, (req, res) => controller.clearMeasuredMileOverride(req, res));
}
