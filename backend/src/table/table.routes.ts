import { Router } from 'express';
import {
  listTablesHandler,
  listDatasourcesHandler,
  getTableHandler,
  getDictionaryHandler,
  updateTableHandler,
  deleteTableHandler,
  getTablePreviewHandler,
} from './table.controller';

const router = Router();

router.get('/', listTablesHandler);
router.get('/datasources', listDatasourcesHandler);
router.get('/:id', getTableHandler);
router.get('/:id/dictionary', getDictionaryHandler);
router.get('/:id/preview', getTablePreviewHandler);
router.put('/:id', updateTableHandler);
router.delete('/:id', deleteTableHandler);

export default router;
