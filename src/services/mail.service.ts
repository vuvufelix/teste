import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, // TLS via STARTTLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export class MailService {
  /**
   * Envia o e-mail de redefinição de senha com a marca Influkit
   */
  static async sendPasswordResetEmail(email: string, resetToken: string) {
    const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
    const influkitLogoUrl = 'https://raw.githubusercontent.com/uizard-assets/public/main/influkit-logo.png';

    const mailOptions = {
      from: `"Influkit" <${process.env.SMTP_USER}>`,
      to: email,
      subject: '🔑 Redefinição de Senha - Influkit',
      html: `
        <!DOCTYPE html>
        <html lang="pt">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Redefinição de Senha - Influkit</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; padding: 40px 10px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E2E8F0; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05); overflow: hidden;">
                  <tr>
                    <td style="padding: 32px 40px 24px 40px; text-align: center; border-bottom: 1px solid #F1F5F9;">
                      <img src="${influkitLogoUrl}" alt="Influkit" width="180" style="max-width: 180px; height: auto; display: inline-block; border: 0; outline: none; text-decoration: none;" />
                      <div style="margin-top: 8px;">
                        <span style="font-size: 28px; font-weight: 800; letter-spacing: -1px; font-family: sans-serif;">
                          <span style="color: #0F172A;">Influ</span><span style="color: #8B5CF6;">kit</span>
                        </span>
                        <p style="margin: 4px 0 0 0; color: #64748B; font-size: 11px; font-weight: 600; letter-spacing: 2px;">MEDIA KITS PARA CRIADORES</p>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 32px 40px 40px 40px;">
                      <h2 style="margin: 0 0 16px 0; color: #0F172A; font-size: 22px; font-weight: 700; text-align: center;">
                        Redefinição de Senha
                      </h2>
                      <p style="margin: 0 0 20px 0; color: #475569; font-size: 15px; line-height: 1.6; text-align: center;">
                        Recebemos uma solicitação para redefinir a senha da sua conta no <strong>Influkit</strong>.
                      </p>
                      <p style="margin: 0 0 28px 0; color: #475569; font-size: 15px; line-height: 1.6; text-align: center;">
                        Clique no botão abaixo para criar uma nova senha. Este link é válido por <strong>1 hora</strong>:
                      </p>
                      <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto 32px auto;">
                        <tr>
                          <td align="center" style="border-radius: 12px; background-color: #8B5CF6;">
                            <a href="${resetUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #FFFFFF; text-decoration: none; border-radius: 12px;">
                              Redefinir Minha Senha
                            </a>
                          </td>
                        </tr>
                      </table>
                      <div style="background-color: #F8FAFC; border-left: 4px solid #8B5CF6; padding: 16px; border-radius: 6px; margin-bottom: 24px;">
                        <p style="margin: 0; color: #64748B; font-size: 13px; line-height: 1.5;">
                          🔒 <strong>Atenção:</strong> Se você não solicitou a redefinição de senha, nenhuma ação é necessária. Sua senha atual continuará segura e inalterada.
                        </p>
                      </div>
                      <hr style="border: none; border-top: 1px solid #F1F5F9; margin: 24px 0;" />
                      <p style="margin: 0; color: #94A3B8; font-size: 12px; line-height: 1.5; word-break: break-all; text-align: center;">
                        Se o botão não funcionar, copie e cole este link no navegador:<br />
                        <a href="${resetUrl}" style="color: #6366F1; text-decoration: underline;">${resetUrl}</a>
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #F8FAFC; padding: 20px 40px; text-align: center; border-top: 1px solid #F1F5F9;">
                      <p style="margin: 0; color: #94A3B8; font-size: 12px; font-weight: 500;">
                        © ${new Date().getFullYear()} Influkit. Todos os direitos reservados.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    };

    return await transporter.sendMail(mailOptions);
  }

  /**
   * Envia e-mail de boas-vindas ao criador após o registo
   */
  static async sendWelcomeEmail(email: string, name: string) {
    const dashboardUrl = `${env.FRONTEND_URL}/dashboard`;
    const influkitLogoUrl = 'https://raw.githubusercontent.com/uizard-assets/public/main/influkit-logo.png';

    const mailOptions = {
      from: `"Influkit" <${process.env.SMTP_USER}>`,
      to: email,
      subject: '🚀 Bem-vindo ao Influkit! O seu Mídia Kit está pronto',
      html: `
        <!DOCTYPE html>
        <html lang="pt">
        <head><meta charset="utf-8"><title>Bem-vindo ao Influkit</title></head>
        <body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: sans-serif;">
          <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="padding: 40px 10px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E2E8F0; overflow: hidden;">
                  <tr>
                    <td style="padding: 32px 40px 24px 40px; text-align: center; border-bottom: 1px solid #F1F5F9;">
                      <img src="${influkitLogoUrl}" alt="Influkit" width="180" style="max-width: 180px; height: auto; display: inline-block; border: 0; outline: none; text-decoration: none;" />
                      <div style="margin-top: 8px;">
                        <span style="font-size: 28px; font-weight: 800; letter-spacing: -1px; font-family: sans-serif;">
                          <span style="color: #0F172A;">Influ</span><span style="color: #8B5CF6;">kit</span>
                        </span>
                        <p style="margin: 4px 0 0 0; color: #64748B; font-size: 11px; font-weight: 600; letter-spacing: 2px;">MEDIA KITS PARA CRIADORES</p>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 32px 40px; text-align: center;">
                      <h2 style="color: #0F172A;">Olá, ${name}!</h2>
                      <p style="color: #475569; font-size: 15px; line-height: 1.6;">Obrigado por se registar no <strong>Influkit</strong>. Comece agora a adicionar as suas redes sociais e a fechar parcerias comerciais.</p>
                      <a href="${dashboardUrl}" style="display: inline-block; margin-top: 20px; padding: 12px 28px; background-color: #8B5CF6; color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600;">Aceder ao Painel</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    };

    return await transporter.sendMail(mailOptions);
  }

  /**
   * Envia a proposta comercial personalizada para a marca com o PDF em anexo
   */
  static async sendCustomProposalEmail(data: {
    brandEmail: string;
    brandName: string;
    proposalTitle: string;
    creatorName: string;
    creatorEmail: string;
    customMessage: string;
    pdfBuffer: Buffer;
  }) {
    const influkitLogoUrl = 'https://raw.githubusercontent.com/uizard-assets/public/main/influkit-logo.png';

    const mailOptions = {
      from: `"${data.creatorName} via Influkit" <${process.env.SMTP_USER}>`,
      to: data.brandEmail,
      replyTo: `"${data.creatorName}" <${data.creatorEmail}>`,
      subject: `Proposta Comercial: ${data.proposalTitle}`,
      html: `
        <!DOCTYPE html>
        <html lang="pt">
        <head><meta charset="utf-8"><title>Proposta Comercial</title></head>
        <body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: sans-serif;">
          <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="padding: 40px 10px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #FFFFFF; border-radius: 16px; border: 1px solid #E2E8F0; overflow: hidden;">
                  <tr>
                    <td style="padding: 24px 40px; text-align: center; border-bottom: 1px solid #F1F5F9;">
                      <img src="${influkitLogoUrl}" alt="Influkit" width="140" style="max-width: 140px; height: auto;" />
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 32px 40px;">
                      <h2 style="color: #0F172A; font-size: 20px; margin-bottom: 20px;">Olá, equipa da ${data.brandName}!</h2>
                      
                      <!-- Mensagem personalizada (gerada pela IA ou escrita pelo criador) -->
                      <div style="color: #475569; font-size: 15px; line-height: 1.6; white-space: pre-line; margin-bottom: 24px;">
                        ${data.customMessage}
                      </div>

                      <div style="background-color: #F8FAFC; padding: 16px; border-radius: 8px; border: 1px solid #E2E8F0; text-align: center;">
                        <p style="margin: 0; color: #64748B; font-size: 14px;">📎 Encontra-se em anexo o documento PDF detalhado com a proposta comercial e tabela de valores.</p>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="background-color: #F8FAFC; padding: 16px 40px; text-align: center; border-top: 1px solid #F1F5F9;">
                      <p style="margin: 0; color: #94A3B8; font-size: 12px;">Enviado por ${data.creatorName} através da plataforma Influkit.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      attachments: [
        {
          filename: `Proposta_${data.proposalTitle.replace(/\s+/g, '_')}.pdf`,
          content: data.pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    };

    return await transporter.sendMail(mailOptions);
  }

  /**
   * Envia o e-mail da proposta utilizando as credenciais SMTP próprias do criador
   */
  static async sendProposalAsCreator(
    creatorData: { email: string; pass: string },
    proposalData: {
      creatorName: string;
      brandEmail: string;
      proposalTitle: string;
      htmlMessage: string;
      attachments: Array<{ filename: string; content: Buffer; contentType: string }>;
    }
  ) {
    const customTransporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: creatorData.email, // E-mail do próprio criador
        pass: creatorData.pass,  // App Password gerada na conta Google dele
      },
    });

    return await customTransporter.sendMail({
      from: `"${proposalData.creatorName}" <${creatorData.email}>`,
      to: proposalData.brandEmail,
      subject: `Proposta Comercial: ${proposalData.proposalTitle}`,
      html: proposalData.htmlMessage,
      attachments: proposalData.attachments,
    });
  }
}