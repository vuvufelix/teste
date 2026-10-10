import puppeteer from 'puppeteer';

export interface ProposalItemData {
  deliverable: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

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
  items: ProposalItemData[];
}

export class PDFService {
  /**
   * Formata valores monetários respeitando a moeda e padrão do sistema
   */
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

  /**
   * Gera o HTML elegante e responsivo para conversão em PDF
   */
  static generateProposalHTML(proposal: ProposalPDFData): string {
    const formattedValidUntil = new Date(proposal.validUntil).toLocaleDateString('pt-PT', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    const formattedCreatedAt = new Date(proposal.createdAt).toLocaleDateString('pt-PT', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    const itemsRows = proposal.items
      .map(
        (item) => `
        <tr>
          <td class="deliverable-cell">
            <span class="item-title">${item.deliverable}</span>
          </td>
          <td class="center-cell">${item.quantity}</td>
          <td class="right-cell">${this.formatCurrency(item.unitPrice, proposal.currency)}</td>
          <td class="right-cell bold-cell">${this.formatCurrency(item.totalPrice, proposal.currency)}</td>
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
          @page {
            size: A4;
            margin: 0;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #0F172A;
            margin: 0;
            padding: 0;
            background-color: #FFFFFF;
            font-size: 13px;
            line-height: 1.5;
          }

          /* TOPO / HEADER DA MARCA */
          .header-bar {
            height: 8px;
            background: linear-gradient(90deg, #6366F1 0%, #8B5CF6 50%, #EC4899 100%);
            width: 100%;
          }

          .container {
            padding: 40px 50px;
          }

          /* BANNER DO INFLUKIT E NÚMERO DA PROPOSTA */
          .brand-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #E2E8F0;
            padding-bottom: 24px;
            margin-bottom: 32px;
          }

          .brand-logo {
            font-size: 28px;
            font-weight: 800;
            letter-spacing: -1px;
          }
          .brand-logo .influ { color: #0F172A; }
          .brand-logo .kit {
            background: linear-gradient(135deg, #6366F1 0%, #EC4899 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          .brand-tagline {
            font-size: 10px;
            font-weight: 600;
            color: #64748B;
            letter-spacing: 2px;
            margin-top: 2px;
            text-transform: uppercase;
          }

          .proposal-meta {
            text-align: right;
          }
          .proposal-badge {
            display: inline-block;
            background: #F1F5F9;
            color: #475569;
            font-size: 11px;
            font-weight: 700;
            padding: 4px 12px;
            border-radius: 20px;
            margin-bottom: 6px;
            letter-spacing: 0.5px;
          }
          .meta-date {
            font-size: 12px;
            color: #64748B;
            margin: 2px 0;
          }
          .valid-until {
            color: #E11D48;
            font-weight: 600;
          }

          /* TÍTULO DA PROPOSTA */
          .doc-title {
            font-size: 22px;
            font-weight: 800;
            color: #0F172A;
            margin: 0 0 24px 0;
            letter-spacing: -0.5px;
          }

          /* GRID DE INFORMAÇÕES DE CONTATO */
          .party-grid {
            display: table;
            width: 100%;
            margin-bottom: 32px;
          }
          .party-col {
            display: table-cell;
            width: 50%;
            vertical-align: top;
          }
          .party-col:first-child {
            padding-right: 16px;
          }
          .party-col:last-child {
            padding-left: 16px;
          }

          .party-card {
            background: #F8FAFC;
            border-radius: 12px;
            padding: 18px 20px;
            border: 1px solid #E2E8F0;
            height: 100%;
          }
          .party-label {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            color: #6366F1;
            letter-spacing: 1px;
            margin-bottom: 8px;
          }
          .party-name {
            font-size: 15px;
            font-weight: 700;
            color: #0F172A;
            margin: 0 0 4px 0;
          }
          .party-detail {
            font-size: 13px;
            color: #475569;
            margin: 2px 0;
          }

          /* NOTA / DESCRIÇÃO */
          .description-box {
            background: #F0FDF4;
            border-left: 4px solid #10B981;
            border-radius: 0 8px 8px 0;
            padding: 14px 18px;
            margin-bottom: 32px;
            font-size: 13px;
            color: #166534;
          }
          .description-title {
            font-weight: 700;
            margin-bottom: 4px;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          /* TABELA DE ENTREGÁVEIS */
          table.items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 32px;
            page-break-inside: avoid;
          }
          table.items-table th {
            background: #F8FAFC;
            color: #475569;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            padding: 12px 16px;
            border-bottom: 2px solid #E2E8F0;
            text-align: left;
          }
          table.items-table td {
            padding: 14px 16px;
            border-bottom: 1px solid #F1F5F9;
            color: #334155;
          }
          .deliverable-cell {
            width: 45%;
          }
          .item-title {
            font-weight: 600;
            color: #0F172A;
          }
          .center-cell { text-align: center; }
          .right-cell { text-align: right; }
          .bold-cell { font-weight: 700; color: #0F172A; }

          /* CAIXA DE TOTALIZAÇÃO */
          .summary-wrapper {
            display: flex;
            justify-content: flex-end;
            margin-bottom: 40px;
            page-break-inside: avoid;
          }
          .summary-card {
            width: 280px;
            background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
            border-radius: 12px;
            padding: 20px;
            color: #FFFFFF;
            box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.2);
          }
          .summary-label {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #94A3B8;
            margin-bottom: 6px;
          }
          .summary-amount {
            font-size: 24px;
            font-weight: 800;
            background: linear-gradient(90deg, #A5B4FC 0%, #F472B6 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }

          /* RODAPÉ */
          .footer {
            margin-top: auto;
            padding-top: 24px;
            border-top: 1px solid #E2E8F0;
            text-align: center;
            font-size: 11px;
            color: #94A3B8;
          }
          .footer-brand {
            font-weight: 700;
            color: #6366F1;
          }
        </style>
      </head>
      <body>
        <div class="header-bar"></div>

        <div class="container">
          <!-- CABEÇALHO -->
          <div class="brand-header">
            <div>
              <div class="brand-logo">
                <span class="influ">Influ</span><span class="kit">kit</span>
              </div>
              <div class="brand-tagline">Media Kits & Propostas Comerciais</div>
            </div>
            <div class="proposal-meta">
              <div class="proposal-badge">PROPOSTA COMERCIAL</div>
              <div class="meta-date">Emissão: ${formattedCreatedAt}</div>
              <div class="meta-date valid-until">Válido até: ${formattedValidUntil}</div>
            </div>
          </div>

          <h1 class="doc-title">${proposal.title}</h1>

          <!-- ENVOLVIDOS (DE / PARA) -->
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

          <!-- NOTA/DESCRIÇÃO SE EXISTIR -->
          ${
            proposal.description
              ? `
            <div class="description-box">
              <div class="description-title">Observações do Projeto</div>
              <div>${proposal.description}</div>
            </div>
          `
              : ''
          }

          <!-- TABELA DE ITENS -->
          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 45%;">Entregável / Serviço</th>
                <th style="text-align: center; width: 15%;">Qtd</th>
                <th style="text-align: right; width: 20%;">Valor Unit.</th>
                <th style="text-align: right; width: 20%;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <!-- TOTAL -->
          <div class="summary-wrapper">
            <div class="summary-card">
              <div class="summary-label">Valor Total do Acordo</div>
              <div class="summary-amount">${this.formatCurrency(proposal.totalAmount, proposal.currency)}</div>
            </div>
          </div>

          <!-- RODAPÉ -->
          <div class="footer">
            Proposta gerada automaticamente via <span class="footer-brand">Influkit</span> • Documento digital de negociação comercial.
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Converte o HTML gerado em um Buffer PDF binário pronto para download/envio
   */
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
        margin: {
          top: '0px',
          bottom: '0px',
          left: '0px',
          right: '0px',
        },
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }
}