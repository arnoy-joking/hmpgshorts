const https = require('https');

// --- HELPER: Fetch HTML ---
const fetchHtml = (url, cookieHeader) => {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    };
    if (cookieHeader) options.headers['Cookie'] = cookieHeader;

    https.get(url, options, (res) => {
      // Handle redirects (YouTube Consent page often redirects)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchHtml(res.headers.location, cookieHeader).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', (err) => reject(err));
  });
};

// --- HELPER: Parse Cookies ---
const parseNetscapeCookies = (text) => {
  if (!text) return '';
  return text.split('\n')
    .filter(line => line && !line.startsWith('#') && line.trim() !== '')
    .map(line => {
      const parts = line.split('\t');
      if (parts.length >= 7) return `${parts[5]}=${parts[6].trim()}`;
      return null;
    })
    .filter(Boolean).join('; ');
};

// --- HELPER: Recursive Finder (Updated for ALL Formats) ---
const findShortsData = (obj, results = []) => {
  if (!obj || typeof obj !== 'object') return results;

  // FORMAT 1: Modern Shorts (Lockup View Model)
  if (obj.shortsLockupViewModel) {
    const data = obj.shortsLockupViewModel;
    try {
      const id = data.entityId;
      const title = data.overlayMetadata?.primaryText?.content || data.accessibilityText?.split(',')[0] || "Unknown";
      const views = data.overlayMetadata?.secondaryText?.content || "";
      const url = data.onTap?.innertubeCommand?.commandMetadata?.webCommandMetadata?.url 
                  ? `https://www.youtube.com${data.onTap.innertubeCommand.commandMetadata.webCommandMetadata.url}` 
                  : `https://www.youtube.com/shorts/${id}`;
      
      const sources = data.thumbnailViewModel?.thumbnailViewModel?.image?.sources;
      const thumbnail = sources ? sources[sources.length - 1].url : null;

      if (id) results.push({ id, title, views, url, thumbnail, type: 'modern' });
    } catch (e) {}
  }

  // FORMAT 2: Classic Shorts (Reel Item Renderer)
  if (obj.reelItemRenderer) {
    const data = obj.reelItemRenderer;
    try {
      const id = data.videoId;
      const title = data.headline?.simpleText || "Unknown";
      const views = data.viewCountText?.simpleText || "";
      const url = `/shorts/${id}`;
      const thumbnail = data.thumbnail?.thumbnails ? data.thumbnail.thumbnails[0].url : null;

      if (id) results.push({ 
        id, title, views, 
        url: `https://www.youtube.com${url}`, 
        thumbnail, 
        type: 'classic' 
      });
    } catch (e) {}
  }

  Object.keys(obj).forEach(key => findShortsData(obj[key], results));
  return results;
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    let cookieHeader = '';
    if (req.body && req.body.cookiesContent) {
      cookieHeader = parseNetscapeCookies(req.body.cookiesContent);
    }

    const html = await fetchHtml('https://www.youtube.com/', cookieHeader);
    
    // Check for blocking
    if (html.includes('Before you continue to YouTube')) {
      return res.status(200).json({ error: "Consent Page Detected. Cookies are invalid or IP is flagged." });
    }

    const match = html.match(/var ytInitialData\s*=\s*(\{.+?\});/);
    if (!match) {
      return res.status(500).json({ error: "Could not find ytInitialData." });
    }

    const json = JSON.parse(match[1]);
    const shorts = findShortsData(json);

    return res.status(200).json({ count: shorts.length, data: shorts });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
