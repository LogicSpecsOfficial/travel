export const resolveShortUrl = async (url) => {
    if (!url || (!url.includes('goo.gl') && !url.includes('bit.ly') && !url.includes('maps.app'))) {
        return { url, title: null, coords: null };
    }
    const proxies = [
      { url: `https://corsproxy.io/?${encodeURIComponent(url)}`, type: 'text' },
      { url: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, type: 'json' },
      { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, type: 'text' }
    ];
    // ... [Copy the rest of the resolveShortUrl function here] ...
    // Note: You will need to copy the full logic for this and extractFromUrl here
};

export const extractFromUrl = (url) => {
    // ... [Copy the extractFromUrl function logic here] ...
};
