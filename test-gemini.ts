import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

// Carrega as variáveis do ficheiro .env
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error('❌ ERRO: A variável GEMINI_API_KEY não está definida no ficheiro .env');
  process.exit(1);
}

// Inicializa o cliente do Gemini
const ai = new GoogleGenAI({ apiKey });

async function testGeminiConnection() {
  console.log('🔄 A testar a ligação à API do Gemini...');
  
  try {
    const startTime = Date.now();

    // Usando o modelo flash atual recomendado
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: 'Escreve apenas uma frase curta a confirmar que a ligação ao Influkit funcionou com sucesso.',
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n✅ Sucesso! Resposta recebida da API do Gemini:');
    console.log('--------------------------------------------------');
    console.log(response.text);
    console.log('--------------------------------------------------');
    console.log(`⏱️ Tempo de resposta: ${duration} segundos.`);
  } catch (error) {
    console.error('\n❌ Falha na comunicação com o Gemini:');
    console.error(error);
  }
}

testGeminiConnection();