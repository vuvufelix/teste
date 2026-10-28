import { Router } from 'express';
import { ContractController } from '../controllers/contract.controller.js';
import { ensureAuthenticated } from '../middlewares/auth.middleware.js';

const contractRoutes = Router();

// Todas as rotas de contratos exigem autenticação prévia
contractRoutes.use(ensureAuthenticated);

//  Listar e Criar Contratos
contractRoutes.get('/', ContractController.getMyContracts);
contractRoutes.post('/', ContractController.createContract);

//  Obter, Atualizar e Eliminar Contrato Específico
contractRoutes.get('/:id', ContractController.getContractById);
contractRoutes.patch('/:id/status', ContractController.updateStatus);
contractRoutes.delete('/:id', ContractController.deleteContract);

//  Visualização, Download e Envio por E-mail do Contrato (PDF)
contractRoutes.get('/:id/pdf', ContractController.renderContractPDF);
contractRoutes.get('/:id/download', ContractController.downloadContractPDF);
contractRoutes.post('/:id/send-email', ContractController.sendContractEmail);

export { contractRoutes };