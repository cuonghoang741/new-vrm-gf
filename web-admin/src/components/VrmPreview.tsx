import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  VRMLoaderPlugin,
  type VRM,
} from '@pixiv/three-vrm';

type Props = {
  url: string | null | undefined;
  height?: number;
};

export default function VrmPreview({ url, height = 420 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!url || !containerRef.current) return;
    setStatus('loading');
    setError('');

    const container = containerRef.current;
    const width = container.clientWidth;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1822);

    const camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 30);
    camera.position.set(0, 1.35, 2.6);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(1.0, 1.5, 1.0);
    scene.add(dir);
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const grid = new THREE.GridHelper(4, 12, 0x444, 0x333);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.4;
    scene.add(grid);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.6;
    controls.maxDistance = 8;
    controls.update();

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    let vrm: VRM | null = null;
    let cancelled = false;

    loader.load(
      url,
      (gltf) => {
        if (cancelled) return;
        try {
          const loaded: VRM | undefined = gltf.userData.vrm;
          if (!loaded) {
            setStatus('error');
            setError('No VRM data in this file (not a valid VRM)');
            return;
          }
          // VRM 0.x faces +Z; rotate 180° so it looks at -Z (camera).
          // VRM 1.0 already faces -Z so skip.
          const isVrm0 = (loaded as unknown as { meta?: { metaVersion?: string } })
            .meta?.metaVersion !== '1';
          if (isVrm0) loaded.scene.rotation.y = Math.PI;

          scene.add(loaded.scene);

          // Auto-frame
          const box = new THREE.Box3().setFromObject(loaded.scene);
          const center = new THREE.Vector3();
          const size = new THREE.Vector3();
          box.getCenter(center);
          box.getSize(size);
          const maxDim = Math.max(size.y, size.x, 1);
          const fitDist = maxDim / (2 * Math.tan((Math.PI * camera.fov) / 360));
          camera.position.set(0, center.y + size.y * 0.05, fitDist * 1.4);
          controls.target.set(0, center.y, 0);
          controls.update();

          vrm = loaded;
          setStatus('ready');
        } catch (e) {
          console.error('[VrmPreview] setup error', e);
          setStatus('error');
          setError((e as Error).message || 'VRM setup failed');
        }
      },
      undefined,
      (err) => {
        if (cancelled) return;
        console.error('[VrmPreview] load error', err);
        setStatus('error');
        setError((err as Error).message || 'Failed to load VRM');
      },
    );

    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const delta = clock.getDelta();
      vrm?.update?.(delta);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    const handleResize = () => {
      const w = container.clientWidth;
      renderer.setSize(w, height);
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
      if (vrm) {
        scene.remove(vrm.scene);
        vrm.scene.traverse((obj) => {
          if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry?.dispose?.();
          const mat = (obj as THREE.Mesh).material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.());
          else mat?.dispose?.();
        });
      }
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [url, height]);

  if (!url) {
    return (
      <div className="vrm-preview placeholder" style={{ height }}>
        <span className="muted small">No VRM file</span>
      </div>
    );
  }

  return (
    <div className="vrm-preview-wrap">
      <div ref={containerRef} className="vrm-preview" style={{ height }} />
      {status === 'loading' && (
        <div className="vrm-preview-overlay">Loading model…</div>
      )}
      {status === 'error' && (
        <div className="vrm-preview-overlay error">⚠ {error}</div>
      )}
      {status === 'ready' && (
        <div className="vrm-preview-hint">drag to rotate · scroll to zoom</div>
      )}
    </div>
  );
}
