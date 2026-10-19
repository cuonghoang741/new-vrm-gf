// Render every VRM character full body, once, headless, with three +
// @pixiv/three-vrm served by the CMS dev server. Arms are lowered out of the
// T-pose and a front camera frames the whole model (3:4 portrait). The
// thumbnails embedded in VRoid files are head shots, so these replace them.
//
//   cd web-admin && npx vite --port 5180          # in another shell
//   SUPABASE_ACCESS_TOKEN=... npx -y -p puppeteer-core@23 node tools/vroid/vrm_thumbs_render.mjs OUT_DIR [--missing]
//   python3 tools/vroid/vrm_thumbs.py --rendered OUT_DIR   # shrinks, uploads, sets vrm_thumbnail_url
//
// --missing renders only rows without vrm_thumbnail_url.
// Writes OUT_DIR/<character_id>.png and skips files already there, so a
// stopped run resumes. Uses system Chrome (CHROME env to override).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const REF = 'kwqqmjfsrgoczbutuisx';
const CMS = process.env.CMS_URL ?? 'http://localhost:5180/';
const out = process.argv[2];
if (!out) throw new Error('usage: vrm_thumbs_render.mjs OUT_DIR');
mkdirSync(out, { recursive: true });

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: "select id, name, base_model_url from characters where base_model_url ilike '%.vrm%'" +
      (process.argv.includes('--missing') ? ' and vrm_thumbnail_url is null' : ''),
  }),
});
const rows = await res.json();
console.log(`${rows.length} to render`);

// Runs in the page. Imports the exact pre-bundled deps the CMS uses, so three
// and three-vrm share one THREE instance.
async function render(url) {
  const src = await (await fetch('/src/lib/vrmThumbnail.ts')).text();
  const dep = (name) => src.match(new RegExp(`from "(/node_modules/\\.vite/deps/${name}[^"]*)"`))[1];
  const THREE = await import(dep('three\\.js'));
  const { GLTFLoader } = await import(dep('three_examples_jsm_loaders_GLTFLoader'));
  const { VRMLoaderPlugin, VRMUtils } = await import(dep('@pixiv_three-vrm'));
  const W = 600, H = 800;
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  r.setSize(W, H);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.setClearColor(0xe9e9ee, 1);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(0.6, 1.5, 2.5);
  scene.add(key);
  const loader = new GLTFLoader();
  loader.register((p) => new VRMLoaderPlugin(p));
  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error('not a VRM');
  VRMUtils.rotateVRM0(vrm);
  scene.add(vrm.scene);
  // Relaxed stance instead of the T-pose. rotateVRM0 turns a 0.x model's
  // whole rig half a turn about Y, which flips the sign of a Z rotation.
  const s = vrm.meta?.metaVersion === '0' ? 1 : -1;
  const bone = (n) => vrm.humanoid.getNormalizedBoneNode(n);
  bone('leftUpperArm')?.rotation.set(0, 0, 1.25 * s);
  bone('rightUpperArm')?.rotation.set(0, 0, -1.25 * s);
  bone('leftLowerArm')?.rotation.set(0, 0.15 * s, 0);
  bone('rightLowerArm')?.rotation.set(0, -0.15 * s, 0);
  vrm.update(0);
  scene.updateMatrixWorld(true);
  // Frame head top to feet. The mesh box, not bones: hair and ears belong in
  // a full-body shot; feet bones sit above the soles.
  const box = new THREE.Box3().setFromObject(vrm.scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const fov = 25;
  const camera = new THREE.PerspectiveCamera(fov, W / H, 0.05, 100);
  const halfH = (size.y * 1.08) / 2;
  const halfW = (size.x * 1.08) / 2 / (W / H);
  const dist = Math.max(halfH, halfW) / Math.tan(THREE.MathUtils.degToRad(fov / 2)) + size.z / 2;
  camera.position.set(center.x, center.y, center.z + dist);
  camera.lookAt(center);
  r.render(scene, camera);
  const data = r.domElement.toDataURL('image/png');
  VRMUtils.deepDispose(vrm.scene);
  r.dispose();
  return data;
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
await page.goto(CMS, { waitUntil: 'domcontentloaded' });
for (const r of rows) {
  if (existsSync(join(out, `${r.id}.png`))) continue;
  try {
    const dataUrl = await page.evaluate(render, r.base_model_url);
    writeFileSync(join(out, `${r.id}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`  ok    ${r.name}`);
  } catch (e) {
    console.log(`  FAIL  ${r.name}: ${String(e).slice(0, 200)}`);
  }
}
await browser.close();
