import rateLimit from 'express-rate-limit';

// 🔒 Limiter rigoroso para Autenticação (Login / Registo / Recuperação de Senha)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // Máximo de 10 tentativas por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas a partir deste IP. Tente novamente após 15 minutos.' },
});

// 🤖 Limiter para Geração de Conteúdo com IA (Evita custos excessivos de API)
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 5, // Máximo de 5 gerações por minuto por utilizador/IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de requisições de Inteligência Artificial excedido. Aguarde um momento.' },
});

// ✉️ Limiter para Envio de E-mails e Propostas
export const mailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 20, // Máximo de 20 e-mails/propostas enviadas por hora
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de envio de documentos por e-mail atingido para esta hora.' },
});

// 💳 Limiter para Transações de Pagamento
export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas tentativas de transação. Por segurança, tente mais tarde.' },
});