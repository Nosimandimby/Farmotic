// Génère les icônes PWA de Farmotic sans dépendance binaire (ni sharp, ni canvas) :
// un dégradé vert uni et un « F » blanc sont dessinés pixel par pixel, puis
// encodés en PNG (zlib de Node suffit) et empaquetés dans un fichier .ico.
//
//   node frontend/scripts/generate-icons.js
//
// À relancer uniquement si le visuel des icônes change : les PNG produits sont
// versionnés dans frontend/public/.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const dossierScript = path.dirname(fileURLToPath(import.meta.url));
const dossierPublic = path.resolve(dossierScript, '..', 'public');
const dossierIcons = path.join(dossierPublic, 'icons');

const VERT = [22, 163, 74, 255]; // #16a34a, couleur de thème du manifeste
const VERT_FONCE = [20, 128, 61, 255]; // léger dégradé pour donner du relief
const BLANC = [255, 255, 255, 255];

// ---------------------------------------------------------------- PNG (zlib)

const TABLE_CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = TABLE_CRC[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(data.length, 0);
  const corps = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corps), 0);
  return Buffer.concat([longueur, corps, crc]);
}

function encoderPNG(largeur, hauteur, pixels) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8; // profondeur 8 bits
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const brut = Buffer.alloc(hauteur * (largeur * 4 + 1));
  for (let y = 0; y < hauteur; y += 1) {
    const debut = y * (largeur * 4 + 1);
    brut[debut] = 0; // filtre « None »
    pixels.copy(brut, debut + 1, y * largeur * 4, (y + 1) * largeur * 4);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(brut, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --------------------------------------------------------------- Dessin

function creerToile(taille) {
  return Buffer.alloc(taille * taille * 4); // transparent
}

function melanger(toile, taille, x, y, couleur, opacite) {
  if (opacite <= 0) return;
  const i = (y * taille + x) * 4;
  const a = Math.min(1, opacite);
  const fondAlpha = toile[i + 3] / 255;
  const alphaFinal = a + fondAlpha * (1 - a);
  if (alphaFinal === 0) return;
  for (let c = 0; c < 3; c += 1) {
    toile[i + c] = Math.round(
      (couleur[c] * a + toile[i + c] * fondAlpha * (1 - a)) / alphaFinal,
    );
  }
  toile[i + 3] = Math.round(alphaFinal * 255);
}

// Remplit une forme définie par une fonction (x, y) => booléen, avec
// anti-aliasing par sur-échantillonnage 3×3.
function remplirForme(toile, taille, dedans, couleur) {
  const ECHANTILLONS = 3;
  for (let y = 0; y < taille; y += 1) {
    for (let x = 0; x < taille; x += 1) {
      let couverts = 0;
      for (let sy = 0; sy < ECHANTILLONS; sy += 1) {
        for (let sx = 0; sx < ECHANTILLONS; sx += 1) {
          const px = x + (sx + 0.5) / ECHANTILLONS;
          const py = y + (sy + 0.5) / ECHANTILLONS;
          if (dedans(px, py)) couverts += 1;
        }
      }
      if (couverts > 0) {
        melanger(toile, taille, x, y, couleur, couverts / ECHANTILLONS ** 2);
      }
    }
  }
}

function rectangleDans(x0, y0, x1, y1) {
  return (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function arrondiDans(x0, y0, x1, y1, rayon) {
  return (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.min(Math.max(x, x0 + rayon), x1 - rayon);
    const cy = Math.min(Math.max(y, y0 + rayon), y1 - rayon);
    return (x - cx) ** 2 + (y - cy) ** 2 <= rayon ** 2;
  };
}

// Dessine le « F » Farmotic. `echelle` réduit le logo pour la variante
// maskable (zone de sécurité : 80 % centraux).
function dessinerF(toile, taille, echelle = 1) {
  const bloc = taille * echelle;
  const decalage = (taille - bloc) / 2;
  const u = (valeur) => decalage + valeur * bloc;

  // Montant
  remplirForme(toile, taille, rectangleDans(u(0.3), u(0.22), u(0.46), u(0.78)), BLANC);
  // Barre haute
  remplirForme(toile, taille, rectangleDans(u(0.3), u(0.22), u(0.7), u(0.35)), BLANC);
  // Barre médiane
  remplirForme(toile, taille, rectangleDans(u(0.3), u(0.44), u(0.63), u(0.57)), BLANC);
}

function icone(taille, { maskable = false, arrondi = true } = {}) {
  const toile = creerToile(taille);

  // Fond : plein cadre pour la variante maskable (Android applique son propre
  // masque), coins arrondis pour les autres.
  const marge = arrondi ? taille * 0.02 : 0;
  const fond = arrondi
    ? arrondiDans(marge, marge, taille - marge, taille - marge, taille * 0.22)
    : () => true;

  // Dégradé vertical très léger (vert clair en haut, plus profond en bas).
  const ECHANTILLONS = 3;
  for (let y = 0; y < taille; y += 1) {
    const t = y / Math.max(1, taille - 1);
    const couleur = VERT.map((canal, index) =>
      index < 3
        ? Math.round(canal + (VERT_FONCE[index] - canal) * t * 0.85)
        : 255,
    );
    for (let x = 0; x < taille; x += 1) {
      let couverts = 0;
      for (let sy = 0; sy < ECHANTILLONS; sy += 1) {
        for (let sx = 0; sx < ECHANTILLONS; sx += 1) {
          if (fond(x + (sx + 0.5) / ECHANTILLONS, y + (sy + 0.5) / ECHANTILLONS)) {
            couverts += 1;
          }
        }
      }
      if (couverts > 0) {
        melanger(toile, taille, x, y, couleur, couverts / ECHANTILLONS ** 2);
      }
    }
  }

  dessinerF(toile, taille, maskable ? 0.62 : 1);
  return encoderPNG(taille, taille, toile);
}

// ------------------------------------------------------------------ ICO

function encoderICO(taille, png) {
  const entete = Buffer.alloc(6);
  entete.writeUInt16LE(0, 0);
  entete.writeUInt16LE(1, 2); // type icône
  entete.writeUInt16LE(1, 4); // une image

  const repertoire = Buffer.alloc(16);
  repertoire[0] = taille >= 256 ? 0 : taille;
  repertoire[1] = taille >= 256 ? 0 : taille;
  repertoire[2] = 0; // palette
  repertoire[3] = 0;
  repertoire.writeUInt16LE(1, 4); // plans
  repertoire.writeUInt16LE(32, 6); // bits par pixel
  repertoire.writeUInt32LE(png.length, 8);
  repertoire.writeUInt32LE(22, 12); // décalage des données

  return Buffer.concat([entete, repertoire, png]);
}

// ------------------------------------------------------------------ Sortie

fs.mkdirSync(dossierIcons, { recursive: true });

const fichiers = [
  ['icons/icon-192.png', icone(192)],
  ['icons/icon-512.png', icone(512)],
  ['icons/icon-512-maskable.png', icone(512, { maskable: true, arrondi: false })],
  ['apple-touch-icon.png', icone(180, { arrondi: false })],
  ['favicon.ico', encoderICO(32, icone(32))],
];

for (const [nom, contenu] of fichiers) {
  const chemin = path.join(dossierPublic, nom);
  fs.writeFileSync(chemin, contenu);
  console.log(
    `  ✔ ${nom.padEnd(32)} ${String(contenu.length).padStart(7)} octets`,
  );
}

console.log('\n  ✅ Icônes PWA générées dans frontend/public\n');
