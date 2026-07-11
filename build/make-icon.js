// Genera build/icon.png (1024x1024) dal frame idle di Draco.  Uso: npm run icon
const sharp = require('sharp');
const path = require('path');

const dir = __dirname;
const sheet = path.join(dir, '..', 'assets', 'draco-sprites.png');

(async () => {
  // cella idle (riga 0, colonna 0), ritagliata sul contenuto
  const cat = await sharp(sheet)
    .extract({ left: 0, top: 0, width: 192, height: 208 })
    .trim({ threshold: 20 })
    .resize({ height: 760, fit: 'inside' })
    .png()
    .toBuffer();

  const bg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#FCF3DA"/><stop offset="1" stop-color="#EAD7A6"/>' +
    '</linearGradient></defs>' +
    '<rect width="1024" height="1024" rx="228" fill="url(#g)"/></svg>'
  );

  await sharp(bg)
    .composite([{ input: cat, gravity: 'south' }])
    .png()
    .toFile(path.join(dir, 'icon.png'));

  console.log('✅ build/icon.png rigenerata da Draco (1024x1024)');
})().catch((e) => { console.error(e); process.exit(1); });
