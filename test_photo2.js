let directUrl = "https://lh3.googleusercontent.com/pw/AP1GczOS_RUdHhu7DNdZLOKEo-tf8jsiITM9_yVXgrBdfGMX-w_UDNHTfdScMjj4_Cao7s_E6ciQ8LKZm6COkrVcNuCsaU4_zBwMh55gHljvYe8LquWIRyCV=w600-h315-p-k";
if (directUrl.includes('=')) {
  const parts = directUrl.split('=');
  // Usually the google user content size modifiers are something like w1200-h630-s-no
  // They are alphanumeric with hyphens
  if (parts[parts.length - 1].match(/^[a-zA-Z0-9-]+$/)) {
    directUrl = parts.slice(0, -1).join('=');
  }
}
console.log("directUrl stripped", directUrl);
