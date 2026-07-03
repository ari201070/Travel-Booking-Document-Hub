const link = "https://photos.app.goo.gl/qJEhBorJmey9AHNU7";
(async () => {
    const response = await fetch(link, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    });
    const html = await response.text();
    const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) || 
                         html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);
    let directUrl = "";
    if (ogImageMatch) {
      directUrl = ogImageMatch[1];
    }
    console.log("directUrl", directUrl);
    if (directUrl.includes('=')) {
      const parts = directUrl.split('=');
      if (parts[parts.length - 1].match(/^[whspd\d-p]+$/i)) {
        directUrl = parts.slice(0, -1).join('=');
      }
    }
    console.log("directUrl stripped", directUrl);
    const downloadRes = await fetch(directUrl + "=w2048");
    console.log("downloadRes status", downloadRes.status);
})();
