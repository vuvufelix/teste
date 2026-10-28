import { Router } from 'express';
import { ProposalController } from '../controllers/proposal.controller.js';
import { ensureAuthenticated, checkSubscriptionOrTrial } from '../middlewares/auth.middleware.js';
import { aiLimiter, mailLimiter } from '../middlewares/rate-limit.middleware.js';

const proposalRoutes = Router();

proposalRoutes.use(ensureAuthenticated);
proposalRoutes.use(checkSubscriptionOrTrial);

proposalRoutes.post('/', ProposalController.createProposal);
proposalRoutes.get('/', ProposalController.getMyProposals);
proposalRoutes.get('/:id', ProposalController.getProposalById);
proposalRoutes.patch('/:id/status', ProposalController.updateStatus);
proposalRoutes.get('/:id/pdf/html', ProposalController.renderProposalPDF);
proposalRoutes.delete('/:id', ProposalController.deleteProposal);
proposalRoutes.get('/:id/pdf/download', ProposalController.downloadProposalPDF);
proposalRoutes.post('/ai/generate-text', aiLimiter, ProposalController.generateAIProposalText);
proposalRoutes.post('/:id/send-email', mailLimiter, ProposalController.sendProposalEmail);

export { proposalRoutes };