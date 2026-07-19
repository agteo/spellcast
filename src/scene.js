// ---------------------------------------------------------------------------
// Three.js scene: renderer, lights, floor, and the character loader.
// Swapping characters = disposing the old glb and loading another config
// from characters.js — the Retargeter is rebuilt by main.js.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class Stage {
  constructor(container) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x11151c);
    this.scene.fog = new THREE.Fog(0x11151c, 6, 14);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    this.camera.position.set(0, 1.3, 3.4);
    this.camera.lookAt(0, 0.9, 0);

    // Simple three-point-ish lighting that reads well on dark video.
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(2, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -3;
    key.shadow.camera.right = key.shadow.camera.top = 3;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8b5cf6, 1.3);
    rim.position.set(-3, 2, -2);
    this.scene.add(rim);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    // Floor: subtle grid + shadow catcher.
    const grid = new THREE.GridHelper(20, 40, 0x8b5cf6, 0x1d2430);
    grid.material.opacity = 0.28;
    grid.material.transparent = true;
    this.scene.add(grid);
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.receiveShadow = true;
    this.scene.add(shadowPlane);

    this.character = null;
    this.ghost = null;
    this.loader = new GLTFLoader();

    this.#resize();
    new ResizeObserver(() => this.#resize()).observe(container);
  }

  #resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Load a .glb into memory without attaching it to the stage (for bone inspection).
   * @param {string} url
   */
  async loadGlbScene(url) {
    const gltf = await this.loader.loadAsync(url);
    return gltf.scene;
  }

  /**
   * Load a rigged character. Returns the root Object3D, already normalized:
   * uniformly scaled to config.targetHeight and stood on the floor at origin.
   */
  async loadCharacter(config) {
    const gltf = await this.loader.loadAsync(config.url);
    const root = gltf.scene;

    root.traverse((n) => {
      if (n.isMesh) {
        n.castShadow = true;
        n.frustumCulled = false; // skinned meshes move; don't let culling clip them
        if (config.materials) this.#applyMaterialOverrides(n, config.materials);
      }
    });

    // Normalize size/placement so any rig drops in at a sensible scale.
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const scale = config.targetHeight / (size.y || 1);
    root.scale.setScalar(scale);
    box.setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= box.min.y;
    root.updateWorldMatrix(true, true);

    this.removeCharacter();
    this.character = root;
    this.scene.add(root);
    return root;
  }

  /** Re-tint a mesh's materials from a { materialName: overrides } config map. */
  #applyMaterialOverrides(mesh, overrides) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const o = m && overrides[m.name];
      if (!o) continue;
      if (o.color !== undefined) m.color.set(o.color);
      if (o.emissive !== undefined && m.emissive) m.emissive.set(o.emissive);
      if (o.emissiveIntensity !== undefined) m.emissiveIntensity = o.emissiveIntensity;
      if (o.roughness !== undefined) m.roughness = o.roughness;
      if (o.metalness !== undefined) m.metalness = o.metalness;
    }
  }

  removeCharacter() {
    this.#disposeObject(this.character);
    this.character = null;
  }

  /**
   * Load a second translucent character for ghost replay, offset to the side
   * so it sits beside the live performer without replacing them.
   */
  async loadGhost(config, { offsetX = -0.95 } = {}) {
    const gltf = await this.loader.loadAsync(config.url);
    const root = gltf.scene;

    root.traverse((n) => {
      if (n.isMesh) {
        n.castShadow = false;
        n.receiveShadow = false;
        n.frustumCulled = false;
        this.#makeGhostMaterial(n);
      }
    });

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const scale = config.targetHeight / (size.y || 1);
    root.scale.setScalar(scale);
    box.setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.x -= center.x;
    root.position.z -= center.z;
    root.position.y -= box.min.y;
    root.position.x += offsetX;
    root.updateWorldMatrix(true, true);

    this.removeGhost();
    this.ghost = root;
    this.scene.add(root);
    return root;
  }

  removeGhost() {
    this.#disposeObject(this.ghost);
    this.ghost = null;
  }

  #makeGhostMaterial(mesh) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const ghosted = mats.map((m) => {
      const mat = m.clone();
      mat.transparent = true;
      mat.opacity = 0.38;
      mat.depthWrite = false;
      if (mat.color) mat.color.lerp(new THREE.Color(0x67e8f9), 0.35);
      if (mat.emissive) {
        mat.emissive.set(0x22d3ee);
        mat.emissiveIntensity = Math.max(mat.emissiveIntensity || 0, 0.25);
      }
      return mat;
    });
    mesh.material = ghosted.length === 1 ? ghosted[0] : ghosted;
  }

  #disposeObject(root) {
    if (!root) return;
    this.scene.remove(root);
    root.traverse((n) => {
      if (n.isMesh) {
        n.geometry?.dispose();
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        for (const m of mats) m?.dispose();
      }
    });
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
