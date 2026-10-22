import puppeteer from 'puppeteer';

export interface ProposalPDFData {
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
  creatorPhone?: string | null;
  creatorAvatar?: string | null;
  paymentTerms?: string | null;
  deliveryDeadline?: string | null;
  revisionPolicy?: string | null;
  cancellationTerms?: string | null;
  metricsSnapshot?: {
    totalFollowers?: number | string;
    avgReach?: number | string;
    avgViews?: number | string;
    engagementRate?: string;
    networks?: Array<{ name: string; handle: string; followers: number }>;
  } | null;
  items: Array<{ deliverable: string; quantity: number; unitPrice: number; totalPrice: number }>;
}

export class PDFService {
  private static formatCurrency(amount: number, currency: string): string {
    const localeMap: Record<string, string> = {
      AOA: 'pt-AO',
      BRL: 'pt-BR',
      USD: 'en-US',
      EUR: 'de-DE',
    };
    const locale = localeMap[currency] || 'pt-PT';
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  }

  static generateProposalHTML(proposal: ProposalPDFData): string {
    const formattedValidUntil = new Date(proposal.validUntil).toLocaleDateString('pt-PT', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
    const formattedCreatedAt = new Date(proposal.createdAt).toLocaleDateString('pt-PT', {
      day: '2-digit', month: 'long', year: 'numeric',
    });

    const itemsRows = proposal.items.map(item => `
      <tr>
        <td class="deliverable-cell">
          <span class="item-title">${item.deliverable}</span>
        </td>
        <td class="center-cell">${item.quantity}</td>
        <td class="right-cell">${this.formatCurrency(item.unitPrice, proposal.currency)}</td>
        <td class="right-cell bold-cell">${this.formatCurrency(item.totalPrice, proposal.currency)}</td>
      </tr>
    `).join('');

    const metricsHtml = proposal.metricsSnapshot ? `
      <div class="section-title">📊 Porquê Trabalhar Connosco? (Métricas e Alcance)</div>
      <div class="metrics-grid">
        ${proposal.metricsSnapshot.totalFollowers ? `
          <div class="metric-card">
            <div class="metric-value">${proposal.metricsSnapshot.totalFollowers}</div>
            <div class="metric-label">Seguidores Totais</div>
          </div>
        ` : ''}
        ${proposal.metricsSnapshot.avgReach ? `
          <div class="metric-card">
            <div class="metric-value">${proposal.metricsSnapshot.avgReach}</div>
            <div class="metric-label">Alcance Médio / Post</div>
          </div>
        ` : ''}
        ${proposal.metricsSnapshot.avgViews ? `
          <div class="metric-card">
            <div class="metric-value">${proposal.metricsSnapshot.avgViews}</div>
            <div class="metric-label">Visualizações Médias</div>
          </div>
        ` : ''}
        ${proposal.metricsSnapshot.engagementRate ? `
          <div class="metric-card">
            <div class="metric-value">${proposal.metricsSnapshot.engagementRate}</div>
            <div class="metric-label">Taxa de Envolvimento</div>
          </div>
        ` : ''}
      </div>
    ` : '';

    return `
      <!DOCTYPE html>
      <html lang="pt">
      <head>
        <meta charset="UTF-8">
        <title>Proposta Comercial - ${proposal.title}</title>
        <style>
          @page { size: A4; margin: 0; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #0F172A; margin: 0; padding: 0; background-color: #FFFFFF; font-size: 13px; line-height: 1.5;
          }
          .header-bar { height: 8px; background: linear-gradient(90deg, #6366F1 0%, #8B5CF6 50%, #EC4899 100%); }
          .container { padding: 32px 48px; }
          .brand-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #E2E8F0; padding-bottom: 16px; margin-bottom: 20px; page-break-inside: avoid; break-inside: avoid; }
          .creator-profile { display: flex; align-items: center; gap: 14px; }
          .creator-avatar { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 2px solid #6366F1; }
          .creator-info h2 { margin: 0; font-size: 16px; font-weight: 800; color: #0F172A; }
          .creator-info p { margin: 2px 0 0; font-size: 11px; color: #64748B; }
          .proposal-meta { text-align: right; }
          .proposal-badge { display: inline-block; background: #EEF2FF; color: #4F46E5; font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 20px; margin-bottom: 4px; letter-spacing: 0.5px; }
          .meta-date { font-size: 11px; color: #64748B; margin: 2px 0; }
          .valid-until { color: #E11D48; font-weight: 600; }
          .doc-title { font-size: 20px; font-weight: 800; color: #0F172A; margin: 0 0 14px 0; letter-spacing: -0.5px; page-break-inside: avoid; break-inside: avoid; }
          
          /* DESCRIÇÃO / VISÃO ESTRATÉGICA */
          .description-box { background: #F8FAFC; border-left: 4px solid #6366F1; padding: 12px 14px; border-radius: 0 8px 8px 0; margin-bottom: 20px; font-size: 11.5px; color: #334155; line-height: 1.55; white-space: pre-line; page-break-inside: avoid; break-inside: avoid; }
          
          /* METRICS GRID */
          .section-title { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #4F46E5; letter-spacing: 0.8px; margin: 20px 0 10px; page-break-after: avoid; break-after: avoid; }
          .metrics-grid { display: flex; gap: 10px; margin-bottom: 20px; page-break-inside: avoid; break-inside: avoid; }
          .metric-card { flex: 1; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 12px; text-align: center; }
          .metric-value { font-size: 16px; font-weight: 800; color: #0F172A; }
          .metric-label { font-size: 10px; color: #64748B; font-weight: 500; margin-top: 2px; }

          /* CARDS CLIENTE / CRIADOR */
          .party-grid { display: table; width: 100%; margin-bottom: 20px; page-break-inside: avoid; break-inside: avoid; }
          .party-col { display: table-cell; width: 50%; vertical-align: top; }
          .party-col:first-child { padding-right: 10px; }
          .party-col:last-child { padding-left: 10px; }
          .party-card { background: #F8FAFC; border-radius: 8px; padding: 14px; border: 1px solid #E2E8F0; }
          .party-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #6366F1; letter-spacing: 1px; margin-bottom: 4px; }
          .party-name { font-size: 13px; font-weight: 700; color: #0F172A; margin: 0 0 2px 0; }
          .party-detail { font-size: 11px; color: #475569; margin: 2px 0; }

          /* TABELA */
          table.items-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; page-break-inside: auto; }
          table.items-table tr { page-break-inside: avoid; break-inside: avoid; }
          table.items-table th { background: #F8FAFC; color: #475569; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 8px 12px; border-bottom: 2px solid #E2E8F0; text-align: left; }
          table.items-table td { padding: 10px 12px; border-bottom: 1px solid #F1F5F9; color: #334155; }
          .deliverable-cell { width: 45%; }
          .item-title { font-weight: 600; color: #0F172A; }
          .center-cell { text-align: center; }
          .right-cell { text-align: right; }
          .bold-cell { font-weight: 700; color: #0F172A; }

          /* CONDIÇÕES COMERCIAIS */
          .conditions-box { background: #F1F5F9; border-radius: 8px; padding: 14px; margin-bottom: 20px; font-size: 11.5px; border: 1px solid #E2E8F0; page-break-inside: avoid; break-inside: avoid; }
          .condition-item { margin-bottom: 4px; }
          .condition-item strong { color: #0F172A; }

          /* TOTAL */
          .summary-wrapper { display: flex; justify-content: flex-end; margin-bottom: 24px; page-break-inside: avoid; break-inside: avoid; }
          .summary-card { width: 260px; background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); border-radius: 10px; padding: 16px 20px; color: #FFFFFF; }
          .summary-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #94A3B8; margin-bottom: 4px; }
          .summary-amount { font-size: 20px; font-weight: 800; background: linear-gradient(90deg, #A5B4FC 0%, #F472B6 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }

          /* ASSINATURAS */
          .signatures-grid { display: flex; justify-content: space-between; gap: 40px; margin-top: 30px; page-break-inside: avoid; break-inside: avoid; }
          .signature-line { flex: 1; border-top: 1px solid #94A3B8; text-align: center; padding-top: 6px; font-size: 11px; color: #475569; }

          .footer { padding-top: 16px; border-top: 1px solid #E2E8F0; text-align: center; font-size: 10px; color: #94A3B8; margin-top: 16px; page-break-inside: avoid; break-inside: avoid; }
        </style>
      </head>
      <body>
        <div class="header-bar"></div>
        <div class="container">
          <div class="brand-header">
            <div class="creator-profile">
              ${proposal.creatorAvatar ? `<img src="${proposal.creatorAvatar}" class="creator-avatar" />` : ''}
              <div class="creator-info">
                <h2>${proposal.creatorName}</h2>
                <p>Proposta Comercial de Conteúdo & Parceria</p>
              </div>
            </div>
            <div class="proposal-meta">
              <div class="proposal-badge">PROPOSTA COMERCIAL</div>
              <div class="meta-date">Emissão: ${formattedCreatedAt}</div>
              <div class="meta-date valid-until">Válida até: ${formattedValidUntil}</div>
            </div>
          </div>

          <h1 class="doc-title">${proposal.title}</h1>

          <div class="party-grid">
            <div class="party-col">
              <div class="party-card">
                <div class="party-label">De (Criador / Agência)</div>
                <div class="party-name">${proposal.creatorName}</div>
                <div class="party-detail">✉ ${proposal.creatorEmail}</div>
                ${proposal.creatorPhone ? `<div class="party-detail">📞 ${proposal.creatorPhone}</div>` : ''}
              </div>
            </div>
            <div class="party-col">
              <div class="party-card">
                <div class="party-label">Para (Cliente / Marca)</div>
                <div class="party-name">${proposal.brandName}</div>
                <div class="party-detail">✉ ${proposal.brandEmail || 'Não informado'}</div>
              </div>
            </div>
          </div>

          ${proposal.description ? `
            <div class="section-title">💡 Visão Estratégica & Proposta</div>
            <div class="description-box">${proposal.description}</div>
          ` : ''}

          ${metricsHtml}

          <div class="section-title">📋 Entregáveis & Investimento</div>
          <table class="items-table">
            <thead>
              <tr>
                <th>Serviço / Entregável</th>
                <th style="text-align: center;">Qtd</th>
                <th style="text-align: right;">Preço Unit.</th>
                <th style="text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>${itemsRows}</tbody>
          </table>

          <div class="summary-wrapper">
            <div class="summary-card">
              <div class="summary-label">Valor Total da Parceria</div>
              <div class="summary-amount">${this.formatCurrency(proposal.totalAmount, proposal.currency)}</div>
            </div>
          </div>

          <div class="section-title">📝 Condições Comerciais</div>
          <div class="conditions-box">
            ${proposal.paymentTerms ? `<div class="condition-item"><strong>Pagamento:</strong> ${proposal.paymentTerms}</div>` : '<div class="condition-item"><strong>Pagamento:</strong> 50% na aprovação e 50% após entrega final.</div>'}
            ${proposal.deliveryDeadline ? `<div class="condition-item"><strong>Prazo de Entrega:</strong> ${proposal.deliveryDeadline}</div>` : ''}
            ${proposal.revisionPolicy ? `<div class="condition-item"><strong>Revisões:</strong> ${proposal.revisionPolicy}</div>` : '<div class="condition-item"><strong>Revisões:</strong> Inclui até 2 rodadas de revisões antes da publicação.</div>'}
          </div>

          <div class="signatures-grid">
            <div class="signature-line">
              <strong>${proposal.creatorName}</strong><br />Criador / Representante
            </div>
            <div class="signature-line">
              <strong>${proposal.brandName}</strong><br />Aceitação do Cliente / Marca
            </div>
          </div>

          <div class="footer">
            Documento gerado por <strong>Influkit</strong> • Plataforma de Gestão para Criadores e Agências
          </div>
        </div>
      </body>
      </html>
    `;
  }

  static async generateProposalPDFBuffer(proposal: ProposalPDFData): Promise<Buffer> {
    const html = this.generateProposalHTML(proposal);
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0px', bottom: '0px', left: '0px', right: '0px' },
      });
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }
}