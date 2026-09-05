import { Router } from 'express';
import { ProposalController } from '../controllers/proposal.controller.js';
import { ensureAuthenticated, checkSubscriptionOrTrial } from '../middlewares/auth.middleware.js';

const proposalRoutes = Router();

proposalRoutes.use(ensureAuthenticated);
proposalRoutes.use(checkSubscriptionOrTrial);

proposalRoutes.post('/', ProposalController.createProposal);
proposalRoutes.get('/', ProposalController.getMyProposals);
proposalRoutes.get('/:id', ProposalController.getProposalById);
proposalRoutes.patch('/:id/status', ProposalController.updateStatus);
proposalRoutes.get('/:id/pdf', ProposalController.renderProposalPDF);
proposalRoutes.delete('/:id', ProposalController.deleteProposal);

export { proposalRoutes };