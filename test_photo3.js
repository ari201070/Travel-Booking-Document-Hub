const directUrl = "https://lh3.googleusercontent.com/pw/AP1GczOS_RUdHhu7DNdZLOKEo-tf8jsiITM9_yVXgrBdfGMX-w_UDNHTfdScMjj4_Cao7s_E6ciQ8LKZm6COkrVcNuCsaU4_zBwMh55gHljvYe8LquWIRyCV";
(async () => {
    const downloadRes = await fetch(directUrl + "=w2048");
    console.log("downloadRes status", downloadRes.status);
})();
