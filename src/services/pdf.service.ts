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
  agencyName?: string | null;
  paymentTerms?: string | null;
  deliveryDeadline?: string | null;
  revisionPolicy?: string | null;
  cancellationTerms?: string | null;
  metricsSnapshot?: {
    totalFollowers?: number | string;
    avgReach?: number | string;
    avgViews?: number | string;
    engagementRate?: string;
    networksCount?: number;
    isVerified?: boolean;
    analysisPeriod?: string;
    // 🚀 Atualizado para suportar transparência de origem (Fase 10)
    networksList?: Array<{ 
      platform: string; 
      handle?: string; 
      followers: number; 
      source?: string; 
      status?: string 
    }>;
  } | null;
  items: Array<{ deliverable: string; quantity: number; unitPrice: number; totalPrice: number }>;
}

export interface ContractPDFData {
  id: string;
  title: string;
  contractType: string;
  brandName: string;
  brandEmail?: string | null;
  totalAmount: number;
  currency: string;
  status: string;
  servicesDescription?: string | null;
  paymentTerms?: string | null;
  deliveryDeadline?: string | null;
  revisionCount?: number;
  cancellationTerms?: string | null;
  contentUsageRights?: string | null;
  usageDuration?: string | null;
  isExclusive: boolean;
  exclusivityTerms?: string | null;
  validUntil?: Date | null;
  signedAt?: Date | null;
  createdAt: Date;
  creatorName: string;
  creatorEmail: string;
  agencyName?: string | null;
}

export interface PdfCustomizationOptions {
  logoUrl?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  templateStyle?: string; 
  customHeader?: string | null;
  customFooter?: string | null;
  hideWatermark?: boolean; 
}

export class PDFService {
  private static sanitizeHexColor(color?: string, defaultColor: string = '#6366F1'): string {
    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    return color && hexRegex.test(color) ? color : defaultColor;
  }

  private static sanitizeText(text?: string | null): string {
    if (!text) return '';
    return text.replace(/<[^>]*>?/gm, ''); 
  }

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

  private static cleanMarkdown(text?: string | null): string {
    if (!text) return '';
    return text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/#{1,6}\s?/g, '');
  }

  static generateProposalHTML(proposal: ProposalPDFData, options?: PdfCustomizationOptions): string {
    const primaryColor = this.sanitizeHexColor(options?.primaryColor, '#6366F1');
    const secondaryColor = this.sanitizeHexColor(options?.secondaryColor, '#8B5CF6');
    const logoUrl = options?.logoUrl ? this.sanitizeText(options.logoUrl) : null;
    const customFooter = options?.customFooter ? this.sanitizeText(options.customFooter) : null;

    const formattedValidUntil = new Date(proposal.validUntil).toLocaleDateString('pt-PT', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
    const formattedCreatedAt = new Date(proposal.createdAt).toLocaleDateString('pt-PT', {
      day: '2-digit', month: 'long', year: 'numeric',
    });

    const cleanDescription = this.cleanMarkdown(proposal.description);

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

    const isVerified = proposal.metricsSnapshot?.isVerified ?? false;
    const periodText = proposal.metricsSnapshot?.analysisPeriod || 'Dados Atuais';

    // 🚀 Renderização transparente das métricas com distinção de origem (Fase 10.4)
    const networksListHtml = proposal.metricsSnapshot?.networksList && proposal.metricsSnapshot.networksList.length > 0
      ? `
        <div class="networks-breakdown" style="display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap;">
          ${proposal.metricsSnapshot.networksList.map((net: any) => {
            const isAutomated = net.source === 'AUTOMATED';
            const badgeBg = isAutomated ? '#EEF2FF' : '#F8FAFC';
            const badgeColor = isAutomated ? primaryColor : '#64748B';
            const sourceLabel = isAutomated ? 'Automático' : 'Manual';

            return `
              <div class="network-badge" style="flex: 1; min-width: 110px; background: ${badgeBg}; border: 1px solid #E2E8F0; border-radius: 4px; padding: 6px 8px; text-align: center;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                  <span style="font-size: 8px; font-weight: 700; color: ${primaryColor}; text-transform: uppercase;">${net.platform}</span>
                  <span style="font-size: 7px; font-weight: 600; color: ${badgeColor}; background: #FFFFFF; padding: 1px 3px; border-radius: 3px; border: 1px solid #CBD5E1;">${sourceLabel}</span>
                </div>
                <div style="font-size: 11px; font-weight: 800; color: #0F172A;">${Number(net.followers || 0).toLocaleString('pt-PT')} <span style="font-size: 8px; font-weight: normal; color: #64748B;">seguidores</span></div>
                ${net.handle ? `<div style="font-size: 7.5px; color: #64748B; margin-top: 1px;">${net.handle}</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
      `
      : '';

    const metricsHtml = proposal.metricsSnapshot ? `
      <div class="section-title">📊 Desempenho das Redes Sociais (${isVerified ? 'Métricas Sincronizadas' : 'Métricas Declaradas / Mistas'})</div>
      <div class="metrics-grid">
        ${proposal.metricsSnapshot.totalFollowers ? `
          <div class="metric-card">
            <div class="metric-value">${proposal.metricsSnapshot.totalFollowers}</div>
            <div class="metric-label">Seguidores Acumulados ${proposal.metricsSnapshot.networksCount ? `(${proposal.metricsSnapshot.networksCount} redes)` : ''}</div>
          </div>
        ` : ''}
        ${proposal.metricsSnapshot.avgViews ? `
          <div class="metric-card">
            <div class="metric-value">${proposal.metricsSnapshot.avgViews}</div>
            <div class="metric-label">Visualizações Mensais Totais</div>
          </div>
        ` : ''}
        ${proposal.metricsSnapshot.engagementRate ? `
          <div class="metric-card">
            <div class="metric-value">${proposal.metricsSnapshot.engagementRate}</div>
            <div class="metric-label">Taxa Média de Envolvimento</div>
          </div>
        ` : ''}
      </div>
      ${networksListHtml}
      <div class="metrics-footnote">
        * Origem dos dados: ${periodText}. Métricas agregadas por plataforma ativa (Facebook, Instagram, YouTube e TikTok).
      </div>
    ` : '';

    return `
      <!DOCTYPE html>
      <html lang="pt">
      <head>
        <meta charset="UTF-8">
        <title>Proposta Comercial - ${proposal.title}</title>
        <style>
          @page { size: A4; margin: 10mm 12mm; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #0F172A; margin: 0; padding: 0; background-color: #FFFFFF; font-size: 11px; line-height: 1.4;
          }
          .header-bar { height: 4px; background: linear-gradient(90deg, ${primaryColor} 0%, ${secondaryColor} 100%); border-radius: 4px; margin-bottom: 12px; }
          .brand-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #E2E8F0; padding-bottom: 10px; margin-bottom: 12px; page-break-inside: avoid; }
          .creator-profile { display: flex; align-items: center; gap: 10px; }
          .creator-avatar, .custom-logo { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 2px solid ${primaryColor}; }
          .creator-info h2 { margin: 0; font-size: 14px; font-weight: 800; color: #0F172A; }
          .creator-info p { margin: 1px 0 0; font-size: 10px; color: #64748B; }
          .proposal-meta { text-align: right; }
          .proposal-badge { display: inline-block; background: #EEF2FF; color: ${primaryColor}; font-size: 9px; font-weight: 700; padding: 2px 8px; border-radius: 12px; margin-bottom: 3px; letter-spacing: 0.5px; }
          .meta-date { font-size: 9.5px; color: #64748B; margin: 1px 0; }
          .valid-until { color: #E11D48; font-weight: 600; }
          .doc-title { font-size: 16px; font-weight: 800; color: #0F172A; margin: 0 0 10px 0; letter-spacing: -0.3px; page-break-inside: avoid; }
          
          .description-box { background: #F8FAFC; border-left: 3px solid ${primaryColor}; padding: 8px 10px; border-radius: 0 5px 5px 0; margin-bottom: 12px; font-size: 10.5px; color: #334155; line-height: 1.45; white-space: pre-line; page-break-inside: avoid; }
          
          .section-title { font-size: 10.5px; font-weight: 700; text-transform: uppercase; color: ${primaryColor}; letter-spacing: 0.6px; margin: 12px 0 6px; page-break-after: avoid; }
          .metrics-grid { display: flex; gap: 6px; margin-bottom: 4px; page-break-inside: avoid; }
          .metric-card { flex: 1; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 5px; padding: 6px 8px; text-align: center; }
          .metric-value { font-size: 13px; font-weight: 800; color: #0F172A; }
          .metric-label { font-size: 9px; color: #64748B; font-weight: 500; margin-top: 1px; }
          .metrics-footnote { font-size: 8.5px; color: #94A3B8; margin-top: 4px; margin-bottom: 12px; font-style: italic; }

          .party-grid { display: table; width: 100%; margin-bottom: 12px; page-break-inside: avoid; }
          .party-col { display: table-cell; width: 50%; vertical-align: top; }
          .party-col:first-child { padding-right: 6px; }
          .party-col:last-child { padding-left: 6px; }
          .party-card { background: #F8FAFC; border-radius: 5px; padding: 8px 10px; border: 1px solid #E2E8F0; }
          .party-label { font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: ${primaryColor}; letter-spacing: 0.8px; margin-bottom: 2px; }
          .party-name { font-size: 11px; font-weight: 700; color: #0F172A; margin: 0 0 1px 0; }
          .party-detail { font-size: 9.5px; color: #475569; margin: 1px 0; }

          table.items-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; page-break-inside: auto; }
          table.items-table tr { page-break-inside: avoid; }
          table.items-table th { background: #F8FAFC; color: #475569; font-size: 9.5px; font-weight: 700; text-transform: uppercase; padding: 5px 8px; border-bottom: 2px solid #E2E8F0; text-align: left; }
          table.items-table td { padding: 6px 8px; border-bottom: 1px solid #F1F5F9; color: #334155; font-size: 10px; }
          .deliverable-cell { width: 50%; }
          .item-title { font-weight: 600; color: #0F172A; }
          .center-cell { text-align: center; }
          .right-cell { text-align: right; }
          .bold-cell { font-weight: 700; color: #0F172A; }

          .bottom-flex { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 14px; page-break-inside: avoid; }
          .conditions-box { flex: 1; background: #F1F5F9; border-radius: 5px; padding: 8px 10px; font-size: 9.5px; border: 1px solid #E2E8F0; }
          .condition-item { margin-bottom: 2px; }
          .condition-item strong { color: #0F172A; }

          .summary-card { width: 220px; background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); border-radius: 6px; padding: 10px 14px; color: #FFFFFF; }
          .summary-label { font-size: 8.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: #94A3B8; margin-bottom: 2px; }
          .summary-amount { font-size: 16px; font-weight: 800; background: linear-gradient(90deg, #A5B4FC 0%, #F472B6 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }

          .signatures-grid { display: flex; justify-content: space-between; gap: 24px; margin-top: 16px; page-break-inside: avoid; }
          .signature-line { flex: 1; border-top: 1px solid #94A3B8; text-align: center; padding-top: 4px; font-size: 9.5px; color: #475569; }
          .sig-date { font-size: 8.5px; color: #94A3B8; margin-top: 2px; }

          .footer { padding-top: 8px; border-top: 1px solid #E2E8F0; text-align: center; font-size: 8.5px; color: #94A3B8; margin-top: 10px; page-break-inside: avoid; }
        </style>
      </head>
      <body>
        <div class="header-bar"></div>
        <div class="brand-header">
          <div class="creator-profile">
            ${logoUrl ? `<img src="${logoUrl}" class="custom-logo" />` : (proposal.creatorAvatar ? `<img src="${proposal.creatorAvatar}" class="creator-avatar" />` : '')}
            <div class="creator-info">
              <h2>${proposal.creatorName}</h2>
              <p>${proposal.agencyName ? `Representado por ${proposal.agencyName}` : 'Proposta Comercial de Conteúdo & Parceria'}</p>
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
              ${proposal.agencyName ? `<div class="party-detail">🏢 Agência: ${proposal.agencyName}</div>` : ''}
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

        ${cleanDescription ? `
          <div class="section-title">💡 Visão Estratégica & Enquadramento</div>
          <div class="description-box">${cleanDescription}</div>
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

        <div class="bottom-flex">
          <div class="conditions-box">
            <div class="condition-item"><strong>Condições de Pagamento:</strong> ${proposal.paymentTerms || '50% na aprovação e 50% após entrega final.'}</div>
            ${proposal.deliveryDeadline ? `<div class="condition-item"><strong>Prazo de Entrega:</strong> ${proposal.deliveryDeadline}</div>` : ''}
            <div class="condition-item"><strong>Política de Revisões:</strong> ${proposal.revisionPolicy || 'Até 2 rodadas de revisões gratuitas incluídas.'}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Valor Total da Parceria</div>
            <div class="summary-amount">${this.formatCurrency(proposal.totalAmount, proposal.currency)}</div>
          </div>
        </div>

        <div class="signatures-grid">
          <div class="signature-line">
            <strong>${proposal.creatorName}</strong><br />${proposal.agencyName ? `Representado por ${proposal.agencyName}` : 'Representante do Criador'}
            <div class="sig-date">Data: ____/____/2026</div>
          </div>
          <div class="signature-line">
            <strong>${proposal.brandName}</strong><br />Aceitação do Cliente / Marca
            <div class="sig-date">Data: ____/____/2026</div>
          </div>
        </div>

        <div class="footer">
          ${customFooter || `Documento gerado por <strong>Influkit</strong> • Plataforma de Gestão para Criadores e Agências`}
        </div>
      </body>
      </html>
    `;
  }

  static async generateProposalPDFBuffer(proposal: ProposalPDFData, options?: PdfCustomizationOptions): Promise<Buffer> {
    const html = this.generateProposalHTML(proposal, options);
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

  static generateContractHTML(contract: ContractPDFData, options?: PdfCustomizationOptions): string {
    const primaryColor = this.sanitizeHexColor(options?.primaryColor, '#6366F1');
    const customFooter = options?.customFooter ? this.sanitizeText(options.customFooter) : null;

    const formattedCreatedAt = new Date(contract.createdAt).toLocaleDateString('pt-PT', {
      day: '2-digit', month: 'long', year: 'numeric',
    });

    return `
      <!DOCTYPE html>
      <html lang="pt">
      <head>
        <meta charset="UTF-8">
        <title>Contrato - ${contract.title}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: 'Inter', sans-serif; color: #0F172A; font-size: 11px; line-height: 1.5; }
          .header { border-bottom: 2px solid ${primaryColor}; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; }
          .title { font-size: 18px; font-weight: 800; color: #1E293B; margin: 0; }
          .section { margin-bottom: 15px; }
          .section-title { font-size: 12px; font-weight: 700; color: ${primaryColor}; text-transform: uppercase; margin-bottom: 5px; }
          .box { background: #F8FAFC; border: 1px solid #E2E8F0; padding: 10px; border-radius: 6px; }
          .footer { padding-top: 8px; border-top: 1px solid #E2E8F0; text-align: center; font-size: 8.5px; color: #94A3B8; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">${contract.title}</h1>
            <p>Tipo: ${contract.contractType} | Emitido em: ${formattedCreatedAt}</p>
          </div>
          <div><strong>Estado:</strong> ${contract.status}</div>
        </div>

        <div class="section">
          <div class="section-title">1. Partes Envolvidas</div>
          <div class="box">
            <p><strong>Criador / Representado:</strong> ${contract.creatorName} (${contract.creatorEmail})</p>
            ${contract.agencyName ? `<p><strong>Agência Gestora:</strong> ${contract.agencyName}</p>` : ''}
            <p><strong>Contratante (Marca):</strong> ${contract.brandName} (${contract.brandEmail || 'Não especificado'})</p>
          </div>
        </div>

        <div class="section">
          <div class="section-title">2. Descrição dos Serviços</div>
          <div class="box">${contract.servicesDescription || 'N/A'}</div>
        </div>

        <div class="section">
          <div class="section-title">3. Condições Comerciais e Valores</div>
          <div class="box">
            <p><strong>Valor Total:</strong> ${contract.totalAmount} ${contract.currency}</p>
            <p><strong>Condições de Pagamento:</strong> ${contract.paymentTerms || 'N/A'}</p>
            <p><strong>Prazos de Entrega:</strong> ${contract.deliveryDeadline || 'N/A'}</p>
            <p><strong>Revisões Incluídas:</strong> ${contract.revisionCount}</p>
          </div>
        </div>

        <div class="section">
          <div class="section-title">4. Direitos e Exclusividade</div>
          <div class="box">
            <p><strong>Direitos de Utilização:</strong> ${contract.contentUsageRights || 'N/A'} (${contract.usageDuration || 'N/A'})</p>
            <p><strong>Exclusividade:</strong> ${contract.isExclusive ? 'Sim' : 'Não'} ${contract.exclusivityTerms ? `- ${contract.exclusivityTerms}` : ''}</p>
          </div>
        </div>

        <div class="footer">
          ${customFooter || `Documento gerado por <strong>Influkit</strong> • Plataforma de Gestão para Criadores e Agências`}
        </div>
      </body>
      </html>
    `;
  }

  static async generateContractPDFBuffer(contract: ContractPDFData, options?: PdfCustomizationOptions): Promise<Buffer> {
    const html = this.generateContractHTML(contract, options);
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }
}