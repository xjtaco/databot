import { Router } from 'express';
import {
  createSessionHandler,
  listSessionsHandler,
  getSessionHandler,
  getSessionMessagesHandler,
  updateSessionTitleHandler,
  deleteSessionHandler,
  updateMessageMetadataHandler,
} from './chatSession.controller';

const router = Router();

router.post('/', createSessionHandler);
router.get('/', listSessionsHandler);
router.get('/:id', getSessionHandler);
router.get('/:id/messages', getSessionMessagesHandler);
router.put('/:id', updateSessionTitleHandler);
router.delete('/:id', deleteSessionHandler);
router.put('/:id/messages/:messageId/metadata', updateMessageMetadataHandler);

export default router;
