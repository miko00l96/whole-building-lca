// three.js view of the IFC model: one mesh per element, coloured by the app (embodied carbon, change, category …), with
// hover and click picking, edges on models of moderate size, and rendering only when something changes.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { MeshData } from './types.ts';

export interface Paint { color: string; opacity?: number; hidden?: boolean }
export type ViewDir = 'iso' | 'top' | 'front' | 'side';

export class CarbonViewer {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.05, 20000);
  private controls: OrbitControls;
  private meshes = new Map<number, THREE.Mesh>();
  private mats = new Map<string, THREE.MeshLambertMaterial>();
  private paints = new Map<number, Paint>();
  private edges: THREE.LineSegments | null = null;
  private ray = new THREE.Raycaster();
  private ro: ResizeObserver;
  private frame = 0;
  private hoverId: number | null = null;
  private selId: number | null = null;
  private down: { x: number; y: number } | null = null;
  private moveQueued: PointerEvent | null = null;
  onHover?: (id: number | null, x: number, y: number) => void;
  onPick?: (id: number | null) => void;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x000000, 0);
    host.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa69f, 1.25));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(0.8, 1.6, 1.1);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.45);
    fill.position.set(-1, 0.4, -0.8);
    this.scene.add(fill);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', () => this.request());
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', (e) => { if (!this.moveQueued) requestAnimationFrame(() => this.hover()); this.moveQueued = e; });
    el.addEventListener('pointerleave', () => { this.setHover(null); this.onHover?.(null, 0, 0); });
    el.addEventListener('pointerdown', (e) => { this.down = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointerup', (e) => {
      if (!this.down || Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 4) { this.down = null; return; }
      this.down = null;
      const id = this.pick(e);
      this.onPick?.(id);
    });
    el.addEventListener('dblclick', (e) => { const id = this.pick(e); if (id != null) this.fit([id]); });
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  private resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.request();
  }

  request() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const moving = this.controls.update();
      this.renderer.render(this.scene, this.camera);
      if (moving) this.request();
    });
  }

  clear() {
    for (const m of this.meshes.values()) { this.scene.remove(m); m.geometry.dispose(); }
    this.meshes.clear();
    if (this.edges) { this.scene.remove(this.edges); this.edges.geometry.dispose(); (this.edges.material as THREE.Material).dispose(); this.edges = null; }
    this.paints.clear();
    this.request();
  }

  add(list: MeshData[]) {
    const base = this.mat('#c9cfcb', 1, '');
    for (const d of list) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(d.nrm, 3));
      g.setIndex(new THREE.BufferAttribute(d.idx, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const m = new THREE.Mesh(g, base);
      m.userData.id = d.id;
      m.matrixAutoUpdate = false;
      this.meshes.set(d.id, m);
      this.scene.add(m);
    }
    this.request();
  }

  /** Edges for models of moderate size (drawn as one line set). */
  addEdges(maxTriangles = 1_500_000) {
    let tri = 0;
    for (const m of this.meshes.values()) tri += (m.geometry.index?.count ?? 0) / 3;
    if (tri > maxTriangles || this.meshes.size > 6000) return;
    const chunks: Float32Array[] = [];
    let n = 0;
    for (const m of this.meshes.values()) {
      const e = new THREE.EdgesGeometry(m.geometry, 28);
      const a = e.getAttribute('position').array as Float32Array;
      chunks.push(a);
      n += a.length;
      e.dispose();
    }
    const all = new Float32Array(n);
    let o = 0;
    for (const c of chunks) { all.set(c, o); o += c.length; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(all, 3));
    this.edges = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x24352c, transparent: true, opacity: 0.28 }));
    this.edges.matrixAutoUpdate = false;
    this.scene.add(this.edges);
    this.request();
  }

  private mat(color: string, opacity: number, state: '' | 'hover' | 'sel') {
    const k = `${color}|${opacity}|${state}`;
    let m = this.mats.get(k);
    if (!m) {
      m = new THREE.MeshLambertMaterial({
        color: new THREE.Color(color), transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
        emissive: new THREE.Color(state === 'sel' ? 0x7a5a00 : state === 'hover' ? 0x2c4a3a : 0x000000),
      });
      this.mats.set(k, m);
    }
    return m;
  }

  private apply(id: number) {
    const m = this.meshes.get(id);
    if (!m) return;
    const p = this.paints.get(id) ?? { color: '#c9cfcb' };
    m.visible = !p.hidden;
    m.material = this.mat(p.color, p.opacity ?? 1, id === this.selId ? 'sel' : id === this.hoverId ? 'hover' : '');
  }

  paint(fn: (id: number) => Paint) {
    for (const id of this.meshes.keys()) { this.paints.set(id, fn(id)); this.apply(id); }
    this.request();
  }

  select(id: number | null) {
    const old = this.selId;
    this.selId = id;
    if (old != null) this.apply(old);
    if (id != null) this.apply(id);
    this.request();
  }

  private setHover(id: number | null) {
    if (id === this.hoverId) return;
    const old = this.hoverId;
    this.hoverId = id;
    if (old != null) this.apply(old);
    if (id != null) this.apply(id);
    this.renderer.domElement.style.cursor = id != null ? 'pointer' : 'default';
    this.request();
  }

  private pick(e: { clientX: number; clientY: number }): number | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const vis = [...this.meshes.values()].filter((m) => m.visible);
    const hit = this.ray.intersectObjects(vis, false).find((h) => ((h.object as THREE.Mesh).material as THREE.Material).opacity > 0.5)
      ?? this.ray.intersectObjects(vis, false)[0];
    return hit ? (hit.object.userData.id as number) : null;
  }

  private hover() {
    const e = this.moveQueued;
    this.moveQueued = null;
    if (!e || this.down) return;
    const id = this.pick(e);
    this.setHover(id);
    const r = this.host.getBoundingClientRect();
    this.onHover?.(id, e.clientX - r.left, e.clientY - r.top);
  }

  private box(ids?: number[]) {
    const b = new THREE.Box3();
    for (const [id, m] of this.meshes) {
      if (ids ? !ids.includes(id) : !m.visible) continue;
      if (m.geometry.boundingBox) b.union(m.geometry.boundingBox);
    }
    return b;
  }

  fit(ids?: number[], dir: ViewDir = 'iso') {
    const b = this.box(ids);
    if (b.isEmpty()) return;
    const c = b.getCenter(new THREE.Vector3());
    const r = Math.max(0.5, b.getSize(new THREE.Vector3()).length() / 2);
    const d = dir === 'top' ? new THREE.Vector3(0, 1, 0.0001) : dir === 'front' ? new THREE.Vector3(0, 0.12, 1) : dir === 'side' ? new THREE.Vector3(1, 0.12, 0) : new THREE.Vector3(1, 0.85, 1.25);
    d.normalize();
    const dist = r / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (ids ? 1.3 : 1.15);
    this.camera.position.copy(c.clone().add(d.multiplyScalar(dist)));
    this.camera.near = Math.max(0.01, dist / 500);
    this.camera.far = dist * 20 + r * 4;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(c);
    this.controls.update();
    this.request();
  }

  view(dir: ViewDir) { this.fit(undefined, dir); }

  png(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.ro.disconnect();
    this.controls.dispose();
    this.clear();
    for (const m of this.mats.values()) m.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
