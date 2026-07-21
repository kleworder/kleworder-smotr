const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const OMDB_API_KEY = process.env.OMDB_API_KEY;
const POISKKINO_API_KEY = process.env.POISKKINO_API_KEY || 'ZQQ8GMN-TN54SGK-NB3MKEC-ZKB8V06';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

const shikimoriClient = axios.create({
  httpsAgent: new https.Agent({ rejectUnauthorized: false, keepAlive: true }),
  timeout: 15000,
  headers: {
    'User-Agent': 'MyMediaLibraryApp/1.0',
    'Accept': 'application/json',
    'Accept-Language': 'ru-RU,ru;q=0.9'
  }
});

const poiskkinoClient = axios.create({
  baseURL: 'https://api.poiskkino.dev',
  timeout: 15000,
  headers: {
    'X-API-KEY': POISKKINO_API_KEY,
    'accept': 'application/json'
  }
});

const descriptionCache = new Map();

function buildImageUrl(imageObj) {
  if (!imageObj) return '';
  const url = imageObj.original || imageObj.preview || '';
  if (!url) return '';
  return url.startsWith('http') ? url : 'https://shikimori.one' + url;
}

async function fetchAnimeDescription(animeId) {
  if (descriptionCache.has(animeId)) return descriptionCache.get(animeId);
  try {
    const response = await shikimoriClient.get(`https://shikimori.one/animes/${animeId}`, { timeout: 8000 });
    const $ = cheerio.load(response.data);
    let description = '';
    const descBlock = $('.b-text_with_paragraphs');
    if (descBlock.length > 0) {
      descBlock.find('br').replaceWith('\n');
      description = descBlock.text().trim();
    }
    if (!description) description = $('meta[name="description"]').attr('content') || '';
    description = description.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
    if (description.length > 400) description = description.substring(0, 400) + '...';
    const result = description || 'Описание отсутствует';
    descriptionCache.set(animeId, result);
    return result;
  } catch (error) {
    return 'Описание отсутствует';
  }
}

function formatPoiskkinoMovie(movie) {
  const isSeries = movie.type === 'tv-series' || movie.type === 'animated-series' || movie.isSeries;
  let durationText = '—';
  if (movie.movieLength) durationText = `${movie.movieLength} мин`;
  else if (movie.seriesLength) durationText = `${movie.seriesLength} мин/эп`;

  let episodesText = '—';
  if (isSeries && movie.totalSeriesLength) episodesText = `${movie.totalSeriesLength} эп.`;
  else if (isSeries && movie.seasonsInfo) {
    const totalEpisodes = movie.seasonsInfo.reduce((sum, s) => sum + (s.episodesCount || 0), 0);
    episodesText = `${totalEpisodes} эп. (${movie.seasonsInfo.length} сез.)`;
  }

  let rating = '—';
  if (movie.rating?.kp) rating = movie.rating.kp.toFixed(1);
  else if (movie.rating?.imdb) rating = movie.rating.imdb.toFixed(1);

  const year = movie.year ? movie.year.toString() : '';
  let posterUrl = '';
  if (movie.poster?.url) posterUrl = movie.poster.url;
  else if (movie.poster?.previewUrl) posterUrl = movie.poster.previewUrl;

  return {
    id: movie.id,
    title: movie.name || movie.alternativeName || movie.enName || 'Без названия',
    original_title: movie.alternativeName || movie.enName || '',
    rating: rating,
    description: movie.description || movie.shortDescription || 'Описание отсутствует',
    episodes: episodesText,
    duration: durationText,
    status: year || '—',
    type: isSeries ? 'tv' : 'movie',
    kind: isSeries ? 'Сериал' : 'Фильм',
    url: `https://www.kinopoisk.ru/film/${movie.id}/`,
    image_url: posterUrl,
    year: year
  };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, corsHeaders);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  const searchParams = url.searchParams;

  try {
    // Shikimori search
    if (path === '/api/search/shikimori') {
      const q = searchParams.get('q');
      if (!q) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'Query required' }));
        return;
      }

      const response = await shikimoriClient.get('https://shikimori.one/api/animes', {
        params: { search: q, limit: 8, order: 'ranked' }
      });

      const statusMap = { 'ongoing': 'Выходит', 'released': 'Завершён', 'anons': 'Анонс' };
      const kindMap = { 'tv': 'ТВ', 'movie': 'Фильм', 'ova': 'OVA', 'ona': 'ONA', 'special': 'Спешл', 'music': 'Клип' };

      const animes = response.data.map(anime => {
        let durationText = '—';
        if (anime.duration && anime.episodes) {
          const totalMin = anime.duration * anime.episodes;
          const hours = Math.floor(totalMin / 60);
          durationText = hours > 0 
            ? `~${anime.duration} мин/эп, всего ~${hours}ч ${totalMin % 60}мин`
            : `~${anime.duration} мин/эп`;
        } else if (anime.duration) {
          durationText = `~${anime.duration} мин/эп`;
        }

        return {
          id: anime.id,
          title: anime.russian || anime.name,
          original_title: anime.name,
          rating: anime.score ? anime.score.toString() : '—',
          description: null,
          episodes: anime.episodes ? `${anime.episodes} эп.` : '—',
          duration: durationText,
          status: statusMap[anime.status] || anime.status || '—',
          kind: kindMap[anime.kind] || anime.kind || '—',
          url: `https://shikimori.one${anime.url}`,
          image_url: buildImageUrl(anime.image),
          year: anime.aired_on ? anime.aired_on.substring(0, 4) : ''
        };
      });

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify(animes));
      return;
    }

    // Shikimori by ID
    if (path.match(/^\/api\/search\/shikimori\/\d+$/)) {
      const animeId = path.split('/').pop();
      const response = await shikimoriClient.get(`https://shikimori.one/api/animes/${animeId}`);
      const anime = response.data;
      const description = await fetchAnimeDescription(animeId);

      let durationText = '—';
      if (anime.duration && anime.episodes) {
        const totalMin = anime.duration * anime.episodes;
        const hours = Math.floor(totalMin / 60);
        durationText = `~${anime.duration} мин/эп, всего ~${hours}ч ${totalMin % 60}мин`;
      } else if (anime.duration) {
        durationText = `~${anime.duration} мин/эп`;
      }

      const statusMap = { 'ongoing': 'Выходит', 'released': 'Завершён', 'anons': 'Анонс' };

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({
        id: anime.id,
        title: anime.russian || anime.name,
        original_title: anime.name,
        rating: anime.score ? anime.score.toString() : '—',
        description: description,
        episodes: anime.episodes ? `${anime.episodes} эпизодов` : '—',
        duration: durationText,
        status: statusMap[anime.status] || anime.status || '—',
        url: `https://shikimori.one${anime.url}`,
        image_url: buildImageUrl(anime.image),
        year: anime.aired_on ? anime.aired_on.substring(0, 4) : ''
      }));
      return;
    }

    // Shikimori by URL
    if (path === '/api/search/shikimori/url') {
      const urlParam = searchParams.get('url');
      if (!urlParam) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'URL required' }));
        return;
      }

      let animeId = null;
      const match1 = urlParam.match(/animes\/(?:z?)?(\d+)/);
      const match2 = urlParam.match(/animes\/[a-z0-9-]*-(\d+)/);
      if (match1) animeId = match1[1];
      else if (match2) animeId = match2[1];
      if (!animeId) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'Invalid URL' }));
        return;
      }

      const response = await shikimoriClient.get(`https://shikimori.one/api/animes/${animeId}`);
      const anime = response.data;
      const description = await fetchAnimeDescription(animeId);

      let durationText = '—';
      if (anime.duration && anime.episodes) {
        const totalMin = anime.duration * anime.episodes;
        const hours = Math.floor(totalMin / 60);
        durationText = `~${anime.duration} мин/эп, всего ~${hours}ч ${totalMin % 60}мин`;
      } else if (anime.duration) {
        durationText = `~${anime.duration} мин/эп`;
      }

      const statusMap = { 'ongoing': 'Выходит', 'released': 'Завершён', 'anons': 'Анонс' };

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({
        id: anime.id,
        title: anime.russian || anime.name,
        original_title: anime.name,
        rating: anime.score ? anime.score.toString() : '—',
        description: description,
        episodes: anime.episodes ? `${anime.episodes} эпизодов` : '—',
        duration: durationText,
        status: statusMap[anime.status] || anime.status || '—',
        url: `https://shikimori.one${anime.url}`,
        image_url: buildImageUrl(anime.image),
        year: anime.aired_on ? anime.aired_on.substring(0, 4) : ''
      }));
      return;
    }

    // Kinopoisk search
    if (path === '/api/search/kinopoisk') {
      const q = searchParams.get('q');
      if (!q) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'Query required' }));
        return;
      }

      const response = await poiskkinoClient.get('/v1.4/movie/search', {
        params: { query: q, limit: 8, page: 1 }
      });

      const docs = response.data.docs || [];
      if (docs.length === 0) {
        res.writeHead(404, corsHeaders);
        res.end(JSON.stringify({ error: 'Ничего не найдено' }));
        return;
      }

      const results = docs
        .filter(m => ['movie', 'tv-series', 'animated-series', 'cartoon'].includes(m.type))
        .map(formatPoiskkinoMovie);

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify(results));
      return;
    }

    // Kinopoisk by ID
    if (path.match(/^\/api\/search\/kinopoisk\/\d+$/)) {
      const kpId = path.split('/').pop();
      const response = await poiskkinoClient.get(`/v1.4/movie/${kpId}`);
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify(formatPoiskkinoMovie(response.data)));
      return;
    }

    // Kinopoisk by URL
    if (path === '/api/search/kinopoisk/url') {
      const urlParam = searchParams.get('url');
      if (!urlParam) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'URL required' }));
        return;
      }

      const match = urlParam.match(/film\/(\d+)/);
      if (!match) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'Invalid Kinopoisk URL' }));
        return;
      }

      const response = await poiskkinoClient.get(`/v1.4/movie/${match[1]}`);
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify(formatPoiskkinoMovie(response.data)));
      return;
    }

    // OMDB fallback
    if (path === '/api/search/omdb') {
      const q = searchParams.get('q');
      if (!q) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'Query required' }));
        return;
      }
      if (!OMDB_API_KEY) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ error: 'OMDB API key not configured' }));
        return;
      }

      const response = await axios.get('http://www.omdbapi.com/', {
        params: { apikey: OMDB_API_KEY, s: q, page: 1 }
      });

      if (response.data.Error) {
        res.writeHead(404, corsHeaders);
        res.end(JSON.stringify({ error: response.data.Error }));
        return;
      }

      const results = response.data.Search || [];
      const detailedResults = await Promise.all(
        results.slice(0, 5).map(async (item) => {
          const detailRes = await axios.get('http://www.omdbapi.com/', {
            params: { apikey: OMDB_API_KEY, i: item.imdbID, plot: 'short' }
          });
          const d = detailRes.data;
          return {
            id: d.imdbID,
            title: d.Title,
            original_title: d.Title,
            rating: d.imdbRating || '—',
            description: d.Plot || 'Описание отсутствует',
            episodes: d.Type === 'series' ? `${d.totalSeasons || '?'} сезонов` : '—',
            duration: d.Runtime || '—',
            status: d.Year || '—',
            type: d.Type,
            kind: d.Type === 'movie' ? 'Фильм' : 'Сериал',
            url: `https://www.imdb.com/title/${d.imdbID}/`,
            image_url: d.Poster !== 'N/A' ? d.Poster : '',
            year: d.Year || ''
          };
        })
      );

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify(detailedResults));
      return;
    }

    // OMDB by URL
    if (path === '/api/search/omdb/url') {
      const urlParam = searchParams.get('url');
      if (!urlParam) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'URL required' }));
        return;
      }
      if (!OMDB_API_KEY) {
        res.writeHead(500, corsHeaders);
        res.end(JSON.stringify({ error: 'OMDB API key not configured' }));
        return;
      }

      const match = urlParam.match(/title\/(tt\d+)/);
      if (!match) {
        res.writeHead(400, corsHeaders);
        res.end(JSON.stringify({ error: 'Invalid IMDb URL' }));
        return;
      }

      const response = await axios.get('http://www.omdbapi.com/', {
        params: { apikey: OMDB_API_KEY, i: match[1], plot: 'full' }
      });

      const d = response.data;
      if (d.Error) {
        res.writeHead(404, corsHeaders);
        res.end(JSON.stringify({ error: d.Error }));
        return;
      }

      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({
        id: d.imdbID,
        title: d.Title,
        original_title: d.Title,
        rating: d.imdbRating || '—',
        description: d.Plot || 'Описание отсутствует',
        episodes: d.Type === 'series' ? `${d.totalSeasons || '?'} сезонов` : '—',
        duration: d.Runtime || '—',
        status: d.Year || '—',
        type: d.Type,
        kind: d.Type === 'movie' ? 'Фильм' : 'Сериал',
        url: `https://www.imdb.com/title/${d.imdbID}/`,
        image_url: d.Poster !== 'N/A' ? d.Poster : '',
        year: d.Year || ''
      }));
      return;
    }

    res.writeHead(404, corsHeaders);
    res.end(JSON.stringify({ error: 'Not found' }));

  } catch (error) {
    console.error('Search API Error:', error.message);
    res.writeHead(500, corsHeaders);
    res.end(JSON.stringify({ error: 'Search failed', details: error.message }));
  }
};
