const https = require('https');

// --- HELPER 1: HTTP Request ---
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
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', (err) => reject(err));
  });
};

// --- HELPER 2: Parse Netscape Cookies ---
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

// --- HELPER 3: Recursive Finder ---
const findShortsData = (obj, results = []) => {
  if (!obj || typeof obj !== 'object') return results;

  if (obj.shortsLockupViewModel) {
    const data = obj.shortsLockupViewModel;
    try {
      // Title
      let title = "Unknown";
      if (data.overlayMetadata?.primaryText?.content) {
        title = data.overlayMetadata.primaryText.content;
      } else if (data.accessibilityText) {
        title = data.accessibilityText.split(',')[0];
      }

      // Views (e.g. "14M views")
      let viewCount = "N/A";
      if (data.overlayMetadata?.secondaryText?.content) {
        viewCount = data.overlayMetadata.secondaryText.content;
      }

      // URL
      let url = null;
      const urlPath = data.onTap?.innertubeCommand?.commandMetadata?.webCommandMetadata?.url;
      if (urlPath) url = `https://www.youtube.com${urlPath}`;

      // Thumbnail
      let thumbnail = null;
      const sources = data.thumbnailViewModel?.thumbnailViewModel?.image?.sources;
      if (sources && sources.length > 0) thumbnail = sources[sources.length - 1].url;

      if (url) {
        results.push({ id: data.entityId, title, views: viewCount, url, thumbnail });
      }
    } catch (err) {}
  }

  Object.keys(obj).forEach(key => findShortsData(obj[key], results));
  return results;
};

// --- VERCEL HANDLER ---
export default async function handler(req, res) {
  // Add CORS support so you can call this from anywhere
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    let cookieHeader = '';
    
    // Check if cookies were sent in body
    if (req.body && req.body.cookiesContent) {
      cookieHeader = parseNetscapeCookies(req.body.cookiesContent);
    }

    const html = await fetchHtml('https://www.youtube.com/', cookieHeader);
    const match = html.match(/var ytInitialData\s*=\s*(\{.+?\});/);

    if (!match) {
      return res.status(500).json({ error: "Could not find YouTube data. IP might be blocked or layout changed." });
    }

    const json = JSON.parse(match[1]);
    const shorts = findShortsData(json);

    return res.status(200).json({
      count: shorts.length,
      data: shorts
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
