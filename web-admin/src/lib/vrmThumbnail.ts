import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, type VRM, VRMUtils } from '@pixiv/three-vrm';

/**
 * Renders a VRM to a PNG data URL, off-screen, so the character list can show
 * the model it will actually ship rather than whatever illustration happens to
 * be in `thumbnail_url`.
 *
 * Three things make this safe to call from a list of 129 characters:
 *
 *   • ONE renderer, reused. A WebGL context per card exhausts the browser's
 *     limit (~16) and the oldest contexts are killed, which shows up as cards
 *     going blank at random.
 *   • ONE render at a time. Each VRM is ~19MB over the wire and a few hundred
 *     MB decoded; two at once on a laptop is a stall, a dozen is a crash.
 *   • A cache by URL, so scrolling back does not re-download anything.
 *
 * Nothing here writes to the database or uploads: this is a preview. The
 * thumbnail the app reads is still whatever `thumbnail_url` says.
 */

const W = 300;
const H = 420;

const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

let renderer: THREE.WebGLRenderer | null = null;

function getRenderer(): THREE.WebGLRenderer {
    if (!renderer) {
        renderer = new THREE.WebGLRenderer({
            antialias: true,
            preserveDrawingBuffer: true,
            alpha: true,
        });
        renderer.setSize(W, H);
        renderer.setPixelRatio(1);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    return renderer;
}

/** One at a time, in the order asked for. */
let queue: Promise<unknown> = Promise.resolve();

async function renderNow(url: string): Promise<string> {
    const r = getRenderer();

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(1, 2, 2.5);
    scene.add(key);

    const camera = new THREE.PerspectiveCamera(22, W / H, 0.1, 50);

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    let vrm: VRM | null = null;
    try {
        const gltf = await loader.loadAsync(url);
        vrm = (gltf.userData as { vrm?: VRM }).vrm ?? null;
        if (!vrm) throw new Error('not a VRM');

        // Models face away from the camera by convention; rotate to face us.
        VRMUtils.rotateVRM0(vrm);
        scene.add(vrm.scene);

        // Frame the model from its own bounds rather than a fixed camera, so
        // a short character is not left stranded at the bottom of the frame.
        const box = new THREE.Box3().setFromObject(vrm.scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const height = size.y || 1.5;
        // Head and shoulders: the face is what identifies a character in a
        // list, and a full body at this size is a smudge.
        const target = new THREE.Vector3(center.x, box.max.y - height * 0.16, center.z);
        camera.position.set(center.x, target.y, center.z + height * 0.62);
        camera.lookAt(target);

        r.render(scene, camera);
        return r.domElement.toDataURL('image/png');
    } finally {
        if (vrm) {
            scene.remove(vrm.scene);
            VRMUtils.deepDispose(vrm.scene);
        }
    }
}

/**
 * Queued, cached render. Rejects rather than returning a broken image so the
 * caller can keep showing the static thumbnail.
 */
export function vrmThumbnail(url: string): Promise<string> {
    const hit = cache.get(url);
    if (hit) return Promise.resolve(hit);

    const pending = inFlight.get(url);
    if (pending) return pending;

    const p = queue
        .catch(() => { /* one failure must not stall the rest of the queue */ })
        .then(() => renderNow(url))
        .then((data) => {
            cache.set(url, data);
            inFlight.delete(url);
            return data;
        })
        .catch((e) => {
            inFlight.delete(url);
            throw e;
        });

    inFlight.set(url, p);
    queue = p.catch(() => { });
    return p;
}

export function isVrm(url: string | null | undefined): boolean {
    return !!url && /\.vrm($|\?)/i.test(url);
}
