import { Router } from 'express';
import { AgencyController } from '../controllers/agency.controller.js';
import { ensureAuthenticated } from '../middlewares/auth.middleware.js';

const agencyRoutes = Router();

agencyRoutes.use(ensureAuthenticated);

// --- Rotas de Convites & Delegações ---
agencyRoutes.post('/invite', AgencyController.inviteCreator); // Agência envia convite
agencyRoutes.get('/invites/sent', AgencyController.getAgencySentInvites); // Agência vê todos os convites enviados
agencyRoutes.delete('/invites/:delegationId', AgencyController.cancelInvite); // Agência cancela um convite enviado

// --- Rotas do Criador ---
agencyRoutes.get('/invites', AgencyController.getMyPendingInvites); // Influenciador vê convites pendentes recebidos
agencyRoutes.patch('/invites/:delegationId', AgencyController.respondToInvite); // Influenciador aceita ou recusa o convite
agencyRoutes.get('/my-agency', AgencyController.getMyAgencyDetails); // Influenciador vê os dados/foto da agência associada
agencyRoutes.delete('/leave', AgencyController.leaveAgency); // Influenciador desassocia-se da agência

// --- Rotas de Gestão de Criadores da Agência ---
agencyRoutes.get('/creators', AgencyController.getMyManagedCreators); // Agência lista criadores ativos com foto
agencyRoutes.delete('/creators/:creatorId', AgencyController.removeCreator); // Agência desassocia um criador específico

export { agencyRoutes };