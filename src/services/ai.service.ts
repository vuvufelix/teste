import { GoogleGenAI } from '@google/genai';

// Inicializa o cliente do Gemini usando a chave do ambiente
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export class AIService {
  /**
   * Gera uma mensagem de proposta comercial personalizada para a marca
   */
  static async generateProposalMessage(data: {
    creatorName: string;
    brandName: string;
    niche: string;
    proposalTitle: string;
  }): Promise<string> {
    try {
      const prompt = `
        Escreve uma mensagem comercial profissional, persuasiva e elegante em tom B2B.
        Contexto:
        - Remetente (Criador de Conteúdo): ${data.creatorName}
        - Nicho: ${data.niche}
        - Destinatário (Marca): ${data.brandName}
        - Assunto da Proposta: ${data.proposalTitle}

        A mensagem deve convidar a equipa de marketing da marca a analisar a proposta em anexo, destacando o valor de uma parceria com o criador. Mantém o texto conciso (máximo de 3 parágrafos) e pronto a ser enviado por e-mail.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash', // Modelo rápido, eficiente e gratuito
        contents: prompt,
      });

      return response.text || 'Não foi possível gerar a mensagem.';
    } catch (error) {
      console.error('❌ Erro ao comunicar com a Gemini API:', error);
      throw new Error('Falha ao gerar texto com Inteligência Artificial.');
    }
  }
}