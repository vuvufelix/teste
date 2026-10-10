import { Router } from 'express';
import { AgencyController } from '../controllers/agency.controller.js';
import { ensureAuthenticated } from '../middlewares/auth.middleware.js';

const agencyRoutes = Router();

agencyRoutes.use(ensureAuthenticated)

// Rotas da Agência
agencyRoutes.post('/invite', AgencyController.inviteCreator);
agencyRoutes.get('/creators', AgencyController.getMyManagedCreators);

// Rotas do Criador (para gerir convites)
agencyRoutes.get('/invites', AgencyController.getMyPendingInvites);
agencyRoutes.patch('/invites/:delegationId', AgencyController.respondToInvite);

export { agencyRoutes };