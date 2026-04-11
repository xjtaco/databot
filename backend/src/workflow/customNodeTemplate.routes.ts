import { Router } from 'express';
import {
  createTemplateHandler,
  listTemplatesHandler,
  getTemplateHandler,
  updateTemplateHandler,
  deleteTemplateHandler,
} from './customNodeTemplate.controller';

const router = Router();

router.post('/', createTemplateHandler);
router.get('/', listTemplatesHandler);
router.get('/:id', getTemplateHandler);
router.put('/:id', updateTemplateHandler);
router.delete('/:id', deleteTemplateHandler);

export default router;
