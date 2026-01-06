export const resolveShortUrl = async (url) => {
    if (!url || (!url.includes('goo.gl') && !url.includes('bit.ly') && !url.includes('maps.app'))) {
        return { url, title: null, coords: null };
    }
    const proxies = [
      { url: `https://corsproxy.io/?${encodeURIComponent(url)}`, type: 'text' },
      { url: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, type: 'json' },
      { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, type: 'text' }
    ];
    const fetchProxy = async (proxy) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 4000); 
        try {
            const response = await fetch(proxy.url, { signal: controller.signal });
            clearTimeout(id);
            if (!response.ok) throw new Error('Status ' + response.status);
            let text = '';
            let finalUrl = '';
            if (proxy.type === 'json') {
                const json = await response.json();
                text = json.contents;
                if (json.status?.url) finalUrl = json.status.url;
            } else {
                text = await response.text();
                if (response.url && response.url.includes('google.com')) finalUrl = response.url;
            }
            let pageTitle = null;
            const titleMatch = text.match(/<title>(.*?)<\/title>/);
            if (titleMatch) {
                pageTitle = titleMatch[1].replace(' - Google Maps', '').trim();
                if (pageTitle.includes("Google Maps")) pageTitle = null;
            }
            let foundUrl = finalUrl && finalUrl.includes('google.com') ? finalUrl : null;
            if (!foundUrl) {
                const ogMatch = text.match(/property="og:url" content="([^"]+)"/);
                if (ogMatch && ogMatch[1].includes('google.com')) foundUrl = ogMatch[1];
            }
            if (!foundUrl) {
                const longLinkMatch = text.match(/https:\/\/(www\.)?google\.com\/maps\/place\/[^"'\s<]+/);
                if (longLinkMatch) foundUrl = longLinkMatch[0];
            }
            let foundCoords = null;
            const jsCoordMatch = text.match(/\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]/);
            if (jsCoordMatch) {
                foundCoords = { lat: parseFloat(jsCoordMatch[1]), lng: parseFloat(jsCoordMatch[2]) };
            }
            if (foundUrl || pageTitle || foundCoords) {
                return { url: foundUrl || url, title: pageTitle, coords: foundCoords };
            }
            throw new Error("No data");
        } catch (e) { clearTimeout(id); throw e; }
    };
    try { return await Promise.any(proxies.map(p => fetchProxy(p))); } 
    catch (e) { return { url, title: null, coords: null }; }
};

export const extractFromUrl = (url) => {
    let name = null;
    let coords = null;
    if (!url) return { name, coords };
    try {
        const placeMatch = url.match(/\/place\/([^\/]+)/);
        if (placeMatch) name = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
        else {
            const queryMatch = url.match(/[?&]q=([^&]+)/);
            if (queryMatch) name = decodeURIComponent(queryMatch[1].replace(/\+/g, ' '));
        }
    } catch (e) {}
    const patterns = [
      /@(-?\d+\.\d+),(-?\d+\.\d+)/,
      /!3d(-?\d+\.\d+).*!4d(-?\d+\.\d+)/,
      /\/place\/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/,
      /[?&](?:q|ll|daddr)=(-?\d+\.\d+),(-?\d+\.\d+)/
    ];
    for (const p of patterns) {
      const match = url.match(p);
      if (match) {
          coords = { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
          break;
      }
    }
    if (name && /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(name)) name = null;
    return { name, coords };
};
