// Fallback for tools/vroid/vrm_thumbs.py: render the VRMs that have NO
// embedded thumbnail, once, headless, with three + @pixiv/three-vrm served by
// the CMS dev server. Front camera framed on the humanoid head bone (head and
// shoulders) - not the bounding box, which bunny ears and bows throw off.
//
//   cd web-admin && npx vite --port 5180          # in another shell
//   SUPABASE_ACCESS_TOKEN=... npx -y -p puppeteer-core@23 node tools/vroid/vrm_thumbs_render.mjs OUT_DIR
//   python3 tools/vroid/vrm_thumbs.py --rendered OUT_DIR   # shrinks, uploads, sets vrm_thumbnail_url
//
// Writes OUT_DIR/<character_id>.png. Uses system Chrome (CHROME env to override).
import { mkdirSync, writeFileSync } from 'node:fs';
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
    query: "select id, name, base_model_url from characters where base_model_url ilike '%.vrm%' and vrm_thumbnail_url is null",
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
  const S = 512;
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  r.setSize(S, S);
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
  vrm.update(0);
  scene.updateMatrixWorld(true);
  const head = vrm.humanoid.getNormalizedBoneNode('head') ?? vrm.humanoid.getRawBoneNode('head');
  const neck = vrm.humanoid.getNormalizedBoneNode('neck');
  const hp = head.getWorldPosition(new THREE.Vector3());
  const np = neck ? neck.getWorldPosition(new THREE.Vector3()) : hp.clone().setY(hp.y - 0.1);
  const unit = Math.max(hp.y - np.y, 0.06); // neck->head length scales the shot
  const target = new THREE.Vector3(hp.x, hp.y + unit * 0.6, hp.z);
  const camera = new THREE.PerspectiveCamera(25, 1, 0.05, 50);
  camera.position.set(target.x, target.y, target.z + unit * 14);
  camera.lookAt(target);
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
  try {
    const dataUrl = await page.evaluate(render, r.base_model_url);
    writeFileSync(join(out, `${r.id}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`  ok    ${r.name}`);
  } catch (e) {
    console.log(`  FAIL  ${r.name}: ${String(e).slice(0, 200)}`);
  }
}
await browser.close();
