export default async function handler(req, res) {
  const { url } = req.query;

  if (!url || !url.includes('youtube.com/shorts')) {
    return res.status(400).json({ error: 'Please provide a valid YouTube Shorts URL' });
  }

  // 1. Extract the current video ID from the URL so we can remove it from results
  // Example: https://www.youtube.com/shorts/sP2N53Se2qY -> sP2N53Se2qY
  const currentIdMatch = url.match(/shorts\/([a-zA-Z0-9_-]{11})/);
  const currentId = currentIdMatch ? currentIdMatch[1] : null;

  try {
    // 2. Fetch the HTML
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    const html = await response.text();

    // 3. The Regex Pattern
    // Looks for "shorts/" OR "shorts\/" followed by exactly 11 characters (the ID)
    const regex = /shorts(?:\\\/|\/)([a-zA-Z0-9_-]{11})/g;

    // 4. Use a Set to store IDs. Sets automatically enforce uniqueness (No Duplicates)
    const uniqueIds = new Set();
    let match;

    while ((match = regex.exec(html)) !== null) {
      const foundId = match[1];
      
      // Only add if it's NOT the current video ID
      if (foundId !== currentId) {
        uniqueIds.add(foundId);
      }
    }

    // 5. Convert the Set back to an Array and format the objects
    const nextVideos = Array.from(uniqueIds).map(id => ({
      videoId: id,
      url: `https://www.youtube.com/shorts/${id}`,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
    }));

    return res.status(200).json({
      count: nextVideos.length,
      currentVideoId: currentId,
      nextVideos: nextVideos
    });

  } catch (error) {
    return res.status(500).json({ error: 'Server Error', details: error.message });
  }
}
