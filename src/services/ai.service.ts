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
        ? `uma agência de gestão de talentos chamada ${data.creatorName}${data.talentName ? ` (representando o criador ${data.talentName})` : ''}`
        : `um criador de conteúdos chamado ${data.creatorName}`;

      const prompt = `
        Escreve uma mensagem comercial profissional, prudente, elegante e persuasiva em tom B2B para enviar por e-mail a uma marca.
        Contexto:
        - Remetente: ${senderDescription}
        - Nicho de Atuação: ${data.niche}
        - Destinatário (Marca): ${data.brandName}
        - Assunto da Proposta: ${data.proposalTitle}

        Diretrizes Estritas de Credibilidade:
        - NUNCA uses superlatives absolutos não verificados (como "estou entre as maiores taxas de engajamento do nicho" ou "o público consome cegamente").
        - Foca a mensagem na sinergia alinhada entre os objetivos de comunicação da marca e o valor de uma comunidade segmentada e ativa.
        - Sê conciso (máximo de 3 parágrafos curtos), direto ao ponto e focado no valor profissional oferecido.
        - Termina convidando a equipa a analisar os dados verificáveis e entregáveis apresentados no documento PDF em anexo.
        - Não incluas formatação markdown com asteriscos pesados, usa texto limpo e direto.
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