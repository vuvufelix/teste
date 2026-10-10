import axios from 'axios';

export interface FetchedSocialStats {
  followersCount: number;
  engagementRate: number;
  monthlyViews?: number;
  handle: string;
}

export class SocialStatsService {
  /**
   * Limpa e extrai handles de URLs diversas
   */
  private static extractHandle(urlOrHandle: string, platformDomain: string): string {
    let clean = urlOrHandle.trim();
    if (clean.includes(platformDomain)) {
      const parts = clean.split(`${platformDomain}/`)[1]?.split('/')[0]?.split('?')[0];
      clean = parts || clean;
    }
    return clean.replace('@', '');
  }

  /**
   * 1. YOUTUBE (API Oficial da Google)
   */
  static async fetchYouTubeStats(profileUrlOrHandle: string): Promise<FetchedSocialStats> {
    const handle = this.extractHandle(profileUrlOrHandle, 'youtube.com');
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
      return { followersCount: 0, engagementRate: 0, monthlyViews: 0, handle: `@${handle}` };
    }

    try {
      const response = await axios.get(
        `https://www.googleapis.com/youtube/v3/channels?part=statistics&forHandle=${handle}&key=${apiKey}`
      );

      const channel = response.data.items?.[0];
      if (!channel) return { followersCount: 0, engagementRate: 0, monthlyViews: 0, handle: `@${handle}` };

      const stats = channel.statistics;
      const followersCount = parseInt(stats.subscriberCount || '0', 10);
      const totalViews = parseInt(stats.viewCount || '0', 10);
      const videoCount = parseInt(stats.videoCount || '1', 10);

      return {
        followersCount,
        engagementRate: 0,
        monthlyViews: Math.round(totalViews / videoCount),
        handle: `@${handle}`,
      };
    } catch (error) {
      console.error('❌ Erro no YouTube Data API:', error);
      return { followersCount: 0, engagementRate: 0, monthlyViews: 0, handle: `@${handle}` };
    }
  }

  /**
   * 2. INSTAGRAM (Via RapidAPI / Instagram Data API)
   */
  static async fetchInstagramStats(profileUrlOrHandle: string): Promise<FetchedSocialStats> {
    const username = this.extractHandle(profileUrlOrHandle, 'instagram.com');
    const apiKey = process.env.RAPIDAPI_KEY;
    const apiHost = process.env.RAPIDAPI_INSTAGRAM_HOST || 'instagram-scraper-stable-api.p.rapidapi.com';

    if (!apiKey) return { followersCount: 0, engagementRate: 0, monthlyViews: 0, handle: `@${username}` };

    try {
      // Usando o endpoint correto que testaste
      const response = await axios.get(`https://${apiHost}/ig_get_fb_profile_hover.php`, {
        params: { username_or_url: username },
        headers: { 
          'X-RapidAPI-Key': apiKey, 
          'X-RapidAPI-Host': apiHost 
        },
      });

      // Acede diretamente à estrutura 'user_data' que a API devolveu no teu teste
      const userData = response.data?.user_data || response.data;
      const followersCount = userData?.follower_count || 0;

      // Como este endpoint específico foca nos dados de hover/perfil básico, 
      // podemos manter a taxa de engajamento a 0 ou calculada se houver posts.
      return {
        followersCount: Number(followersCount),
        engagementRate: 0, 
        monthlyViews: 0,
        handle: `@${userData?.username || username}`,
      };
    } catch (error) {
      console.error('❌ Erro ao buscar dados do Instagram:', error);
      return { followersCount: 0, engagementRate: 0, monthlyViews: 0, handle: `@${username}` };
    }
  }

  /**
 * 3. TIKTOK (Via RapidAPI: tiktok-api23.p.rapidapi.com)
 */
  static async fetchTikTokStats(profileUrlOrHandle: string): Promise<FetchedSocialStats> {
    const username = this.extractHandle(profileUrlOrHandle, 'tiktok.com');
    const apiKey = process.env.RAPIDAPI_KEY;
    const apiHost = process.env.RAPIDAPI_TIKTOK_HOST || 'tiktok-api23.p.rapidapi.com';

    if (!apiKey) {
      return { followersCount: 0, engagementRate: 0, monthlyViews: 0, handle: `@${username}` };
    }

    try {
      const response = await axios.get(`https://${apiHost}/api/user/info`, {
        params: { uniqueId: username }, // 👈 Usando 'uniqueId' conforme a especificação da API
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': apiHost,
        },
      });

      // Mapeamento baseado na resposta real que recebeste
      const stats = response.data?.userInfo?.stats;

      if (!stats) {
        console.warn(`⚠️ Não foram encontradas estatísticas para o utilizador TikTok: @${username}`);
        return { followersCount: 0, engagementRate: 0, monthlyViews: 0, handle: `@${username}` };
      }

      const followersCount = Number(stats.followerCount || 0);
      const totalLikes = Number(stats.heartCount || stats.heart || 0);
      const videoCount = Number(stats.videoCount || 1);

      // Cálculo da taxa de engajamento estimada:
      // (Média de curtidas por vídeo / Número de seguidores) * 100
      let engagementRate = 0;
      if (followersCount > 0 && videoCount > 0) {
        const avgLikesPerVideo = totalLikes / videoCount;
        engagementRate = Number(((avgLikesPerVideo / followersCount) * 100).toFixed(2));
      }

      return {
        followersCount,
        engagementRate,
        monthlyViews: 0,
        handle: `@${username}`,
      };
    } catch (error) {
      console.error('❌ Erro na busca de métricas do TikTok:', error);
      return { followersCount: 0, engagementRate: 0, monthlyViews: 0, handle: `@${username}` };
    }
  }

  /**
   * 4. FACEBOOK (Via RapidAPI: facebook-pages-scraper2.p.rapidapi.com)
   */
  static async fetchFacebookStats(profileUrlOrHandle: string): Promise<FetchedSocialStats> {
    const pageHandle = this.extractHandle(profileUrlOrHandle, 'facebook.com');
    const apiKey = process.env.RAPIDAPI_KEY;
    const apiHost = process.env.RAPIDAPI_FACEBOOK_HOST || 'facebook-pages-scraper2.p.rapidapi.com';

    if (!apiKey) {
      return { followersCount: 0, engagementRate: 0, monthlyViews: 0, handle: `@${pageHandle}` };
    }

    try {
      const response = await axios.get(`https://${apiHost}/get_facebook_pages_details`, {
        params: { link: profileUrlOrHandle, show_verified_badge: false },
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': apiHost,
        },
      });

      // A API retorna um array com os detalhes da página no primeiro índice [0]
      const pageData = Array.isArray(response.data) ? response.data[0] : response.data;

      if (!pageData) {
        return { followersCount: 0, engagementRate: 0, monthlyViews: 0, handle: `@${pageHandle}` };
      }

      const followersCount = Number(pageData.followers_count || 0);

      return {
        followersCount,
        engagementRate: 0, // O Facebook foca mais em seguidores/likes diretos
        monthlyViews: 0,
        handle: `@${pageHandle}`,
      };
    } catch (error) {
      console.error('❌ Erro na busca de métricas do Facebook:', error);
      return { followersCount: 0, engagementRate: 0, monthlyViews: 0, handle: `@${pageHandle}` };
    }
  }

  /**
   * MÉTODO PRINCIPAL: Roteia para a API correspondente
   */
  static async fetchStats(platform: string, profileUrlOrHandle: string): Promise<FetchedSocialStats> {
    const plat = platform.toUpperCase();

    switch (plat) {
      case 'YOUTUBE':
        return await this.fetchYouTubeStats(profileUrlOrHandle);
      case 'INSTAGRAM':
        return await this.fetchInstagramStats(profileUrlOrHandle);
      case 'TIKTOK':
        return await this.fetchTikTokStats(profileUrlOrHandle);
      case 'FACEBOOK':
        return await this.fetchFacebookStats(profileUrlOrHandle);
      default: {
        const cleanHandle = profileUrlOrHandle.replace(/https?:\/\/(www\.)?/, '').split('/')[1] || profileUrlOrHandle;
        return {
          followersCount: 0,
          engagementRate: 0,
          handle: cleanHandle.startsWith('@') ? cleanHandle : `@${cleanHandle}`,
        };
      }
    }
  }
}