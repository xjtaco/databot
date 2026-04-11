import { Router } from 'express';
import {
  createSessionHandler,
  listSessionsHandler,
  getSessionHandler,
  getSessionMessagesHandler,
  updateSessionTitleHandler,
  deleteSessionHandler,
} from './chatSession.controller';

const router = Router();

router.post('/', createSessionHandler);
router.get('/', listSessionsHandler);
router.get('/:id', getSessionHandler);
router.get('/:id/messages', getSessionMessagesHandler);
router.put('/:id', updateSessionTitleHandler);
router.delete('/:id', deleteSessionHandler);

export default router;
