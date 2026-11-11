import { Router } from 'express';
import authRoutes from './auth.routes';
import healthRoutes from './health.routes';
import stockRoutes from './stock.routes';
import demandRoutes from './demand.routes';
import planningRoutes from './planning.routes';
import mosRoutes from './mos.routes';
import procurementRoutes from './procurement.routes';
import salesRoutes from './sales.routes';
import transfersRoutes from './transfers.routes';
import logisticsRoutes from './logistics.routes';
import mastersRoutes from './masters.routes';
import reportsRoutes from './reports.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/health', healthRoutes);
router.use('/stock', stockRoutes);
router.use('/demand', demandRoutes);
router.use('/planning', planningRoutes);
router.use('/mos', mosRoutes);
router.use('/transfers', transfersRoutes);

// Multi-resource routers
router.use('/', procurementRoutes);
router.use('/', salesRoutes);
router.use('/', logisticsRoutes);
router.use('/', mastersRoutes);
router.use('/', reportsRoutes);

export default router;

