import { Router } from 'express';
import {
  createScheduleHandler,
  listSchedulesHandler,
  getScheduleHandler,
  updateScheduleHandler,
  deleteScheduleHandler,
} from './schedule.controller';

const router = Router();

router.post('/', createScheduleHandler);
router.get('/', listSchedulesHandler);
router.get('/:id', getScheduleHandler);
router.put('/:id', updateScheduleHandler);
router.delete('/:id', deleteScheduleHandler);

export default router;
