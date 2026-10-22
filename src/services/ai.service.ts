import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export class AIService {
  static async generateProposalMessage(data: {
    creatorName: string;
    brandName: string;
    niche: string;
    proposalTitle: string;
    isAgency?: boolean;
    talentName?: string;
  }): Promise<string> {
    try {
      const senderDescription = data.isAgency
        ? `da agência ${data.creatorName}${data.talentName ? ` (representando o criador ${data.talentName})` : ''}`
        : `o criador de conteúdos ${data.creatorName}`;

      const prompt = `
        Escreve uma mensagem de e-mail comercial extremamente direta, profissional, personalizada e elegante para apresentar uma proposta a uma marca.

        Contexto:
        - Remetente: ${senderDescription}
        - Nicho: ${data.niche}
        - Destinatário (Marca): ${data.brandName}
        - Objetivo/Título: ${data.proposalTitle}

        Instruções de Estrutura (Siga este padrão curto):
        1. Cumprimento direto à equipa de marketing da ${data.brandName}.
        2. Apresentação breve de quem fala e do nicho de atuação.
        3. Exposição clara do valor: como o conteúdo vai destacar a marca de forma prática e alinhada aos seus objetivos.
        4. Chamada para ação simples: aviso de que a proposta comercial com métricas e valores está em anexo e convite para uma breve conversa.
        5. Despedida profissional com contacto e link de perfil.

        Regras Estritas:
        - NUNCA use marcadores de texto Markdown com asteriscos (como **texto**). Devolva texto simples.
        - Não use superlativos nem invente dados não comprovados.
        - Mantenha o texto ultra objetivo e curto (menos de 150 palavras).
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      return response.text || 'Não foi possível gerar a mensagem.';
    } catch (error) {
      console.error('❌ Erro ao comunicar com a Gemini API:', error);
      throw new Error('Falha ao gerar texto com Inteligência Artificial.');
    }
  }
}