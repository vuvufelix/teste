interface ProposalItemData {
  deliverable: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface ProposalPDFData {
  id: string;
  title: string;
  brandName: string;
  brandEmail?: string | null;
  description?: string | null;
  currency: string;
  totalAmount: number;
  validUntil: Date;
  createdAt: Date;
  creatorName: string;
  creatorEmail: string;
  items: ProposalItemData[];
}

export class PDFService {
  static generateProposalHTML(proposal: ProposalPDFData): string {
    const formattedValidUntil = new Date(proposal.validUntil).toLocaleDateString('pt-PT');
    const formattedCreatedAt = new Date(proposal.createdAt).toLocaleDateString('pt-PT');

    const itemsRows = proposal.items
      .map(
        (item) => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.deliverable}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${item.unitPrice.toFixed(2)} ${proposal.currency}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: bold;">${item.totalPrice.toFixed(2)} ${proposal.currency}</td>
        </tr>
      `
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html lang="pt">
      <head>
        <meta charset="UTF-8">
        <title>Proposta Comercial - ${proposal.title}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #111827; margin: 0; padding: 40px; background-color: #ffffff; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #4f46e5; padding-bottom: 20px; margin-bottom: 30px; }
          .title { font-size: 24px; font-weight: bold; color: #4f46e5; margin: 0; }
          .subtitle { font-size: 14px; color: #6b7280; margin-top: 4px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
          .info-box { background: #f9fafb; padding: 16px; border-radius: 8px; border: 1px solid #f3f4f6; }
          .info-box h3 { margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; }
          .info-box p { margin: 2px 0; font-size: 14px; font-weight: 500; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background: #f3f4f6; padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #374151; border-bottom: 2px solid #e5e7eb; }
          .total-box { text-align: right; margin-top: 20px; background: #eeef2; padding: 20px; border-radius: 8px; }
          .total-title { font-size: 14px; color: #4b5563; }
          .total-amount { font-size: 28px; font-weight: bold; color: #4f46e5; }
          .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">PROPOSTA COMERCIAL</h1>
            <div class="subtitle">${proposal.title}</div>
          </div>
          <div style="text-align: right;">
            <p style="margin:0; font-size: 12px; color: #6b7280;">Emissão: ${formattedCreatedAt}</p>
            <p style="margin:0; font-size: 12px; color: #ef4444; font-weight: bold;">Validade: ${formattedValidUntil}</p>
          </div>
        </div>

        <div class="info-grid">
          <div class="info-box">
            <h3>DE (Criador / Agência)</h3>
            <p><strong>${proposal.creatorName}</strong></p>
            <p>${proposal.creatorEmail}</p>
          </div>
          <div class="info-box">
            <h3>PARA (Cliente / Marca)</h3>
            <p><strong>${proposal.brandName}</strong></p>
            <p>${proposal.brandEmail || 'Não informado'}</p>
          </div>
        </div>

        ${proposal.description ? `<div style="margin-bottom: 24px; padding: 12px; background: #fffbe0; border-left: 4px solid #f59e0b; font-size: 13px;">${proposal.description}</div>` : ''}

        <table>
          <thead>
            <tr>
              <th>Entregável / Descrição</th>
              <th style="text-align: center;">Qtd</th>
              <th style="text-align: right;">Valor Unit.</th>
              <th style="text-align: right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        <div class="total-box">
          <div class="total-title">VALOR TOTAL DA PROPOSTA</div>
          <div class="total-amount">${proposal.totalAmount.toFixed(2)} ${proposal.currency}</div>
        </div>

        <div class="footer">
          Proposta comercial gerada via Mídia Kit SaaS • Documento oficial
        </div>
      </body>
      </html>
    `;
  }
}