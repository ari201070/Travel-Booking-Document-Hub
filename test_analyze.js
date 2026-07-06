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
    if (directUrl.includes('=')) {
      const parts = directUrl.split('=');
      if (parts[parts.length - 1].match(/^[a-zA-Z0-9-]+$/)) {
        directUrl = parts.slice(0, -1).join('=');
      }
    }
    
    // Now call the local server API
    const res = await fetch('http://localhost:3000/api/analyze-doc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer foo' },
      body: JSON.stringify({
        fileId: 'test1234',
        mimeType: 'image/jpeg',
        name: 'Foto.jpg',
        source: 'photos',
        baseUrl: directUrl
      })
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
})();
