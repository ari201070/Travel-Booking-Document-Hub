(async () => {
    const res = await fetch('http://localhost:3000/api/analyze-doc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer foo' },
      body: JSON.stringify({
        fileId: 'test1234',
        mimeType: 'image/jpeg',
        name: 'Foto de Viaje Compartida.jpg',
        source: 'photos',
        baseUrl: 'https://invalid-url-that-fails.com/image'
      })
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
})();
