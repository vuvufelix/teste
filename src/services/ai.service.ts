import { GoogleGenAI } from '@google/genai';

// Inicializa o cliente do Gemini usando a chave do ambiente
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export class AIService {
  /**
   * Gera uma mensagem de proposta comercial personalizada para a marca (Suporta Criador ou Agência)
   */
  static async generateProposalMessage(data: {
    creatorName: string;      // Nome do criador ou da agência remetente
    brandName: string;
    niche: string;
    proposalTitle: string;
    isAgency?: boolean;       // 👈 Flag para diferenciar Agência vs Criador
    talentName?: string;      // 👈 Nome do influenciador gerido (opcional, se a agência estiver a promover um talento específico)
  }): Promise<string> {
    try {
      const senderDescription = data.isAgency
        ? `uma agência de gestão de talentos de prestígio chamada ${data.creatorName}${data.talentName ? ` (representando o criador ${data.talentName})` : ''}`
        : `um criador de conteúdos de destaque chamado ${data.creatorName}`;

      const prompt = `
        Escreve uma mensagem comercial profissional, persuasiva e elegante em tom B2B.
        Contexto:
        - Remetente: ${senderDescription}
        - Nicho de Atuação: ${data.niche}
        - Destinatário (Marca): ${data.brandName}
        - Assunto da Proposta: ${data.proposalTitle}

        Diretrizes:
        ${data.isAgency 
          ? 'Foca a mensagem na força do portfólio da agência, na capacidade de gerir campanhas de marketing de influência em escala, estratégias corporativas e no retorno de investimento (ROI) garantido para a marca.' 
          : 'Foca a mensagem na autenticidade do criador, na conexão genuína com a comunidade e na alta taxa de engajamento do público-alvo.'
        }

        A mensagem deve convidar a equipa de marketing da marca a analisar a proposta em anexo. Mantém o texto conciso (máximo de 3 parágrafos) e pronto a ser enviado por e-mail.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash', // Modelo eficiente para tarefas de texto
        contents: prompt,
      });

      return response.text || 'Não foi possível gerar a mensagem.';
    } catch (error) {
      console.error('❌ Erro ao comunicar com a Gemini API:', error);
      throw new Error('Falha ao gerar texto com Inteligência Artificial.');
    }
  }
}