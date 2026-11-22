// Gera os assets da logo a partir da imagem original (branco sobre preto).
// Uso: node scripts/build-logo.mjs caminho/logo.jpg
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
const src = process.argv[2];
const out = new URL('../public/assets/', import.meta.url).pathname;
const SCALE = 2;
async function alphaPart(name, left, top, width, height) {
  const { data, info } = await sharp(src).extract({ left, top, width, height })
    .resize(width * SCALE, height * SCALE, { kernel: 'lanczos3' })
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  const px = info.width * info.height;
  const rgba = Buffer.alloc(px * 4);
  for (let i = 0; i < px; i++) {
    let a = Math.max(0, Math.min(255, Math.round((data[i] - 18) * 255 / 210)));
    if (a < 14) a = 0; // remove ruído do JPEG
    rgba[i * 4] = 255; rgba[i * 4 + 1] = 255; rgba[i * 4 + 2] = 255; rgba[i * 4 + 3] = a;
  }
  await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9, palette: false }).toFile(out + name + '.png');
  console.log(name, info.width, info.height);
}
// Bandas medidas na imagem original 500x500
await alphaPart('logo', 70, 98, 360, 310);          // logo completa
await alphaPart('logo-glasses', 144, 98, 212, 98);  // óculos
await alphaPart('logo-mustache', 109, 195, 282, 79); // bigode
await alphaPart('logo-name', 70, 286, 360, 84);      // LA SANTOS
await alphaPart('logo-sub', 133, 376, 236, 31);      // BARBEARIA
await alphaPart('logo-mark', 109, 98, 282, 176);     // óculos + bigode
// Ícones (fundo preto, logo original)
await sharp(src).resize(512, 512).png().toFile(out + 'icon-512.png');
await sharp(src).resize(192, 192).png().toFile(out + 'icon-192.png');
await sharp(src).resize(180, 180).png().toFile(out + 'apple-touch-icon.png');
await sharp(src).resize(64, 64).png().toFile(out + 'favicon.png');
// Imagem de compartilhamento 1200x630
const mark = await sharp(src).resize(560, 560).toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#000' } })
  .composite([{ input: mark, left: 320, top: 35 }]).jpeg({ quality: 86 }).toFile(out + 'og.jpg');
