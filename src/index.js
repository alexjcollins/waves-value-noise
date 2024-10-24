// ThreeJS and Third-party deps
import * as THREE from "three";
import * as dat from "dat.gui";
import Stats from "three/examples/jsm/libs/stats.module";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

// Core boilerplate code deps
import {
  createCamera,
  createRenderer,
  runApp,
  getDefaultUniforms,
} from "./core-utils";

global.THREE = THREE;

/**************************************************
 * 0. Tweakable parameters for the scene
 *************************************************/
const uniforms = {
  ...getDefaultUniforms(),
  // wave 1
  u_noise_freq_1: { value: 0.8 },
  u_noise_amp_1: { value: 0.2 },
  u_spd_modifier_1: { value: 1.0 },
  // wave 2
  u_noise_freq_2: { value: 2.0 },
  u_noise_amp_2: { value: 0.15 },
  u_spd_modifier_2: { value: 0.2 },
};

/**************************************************
 * 1. Initialize core threejs components
 *************************************************/
// Create the scene
let scene = new THREE.Scene();

// Create the renderer via 'createRenderer',
let renderer = createRenderer({ antialias: true });

// Create the camera with extended far clipping plane
let camera = createCamera(80, 0.1, 100, { x: 0, y: 0, z: 4 }); // Increased far plane from 10 to 100

/**************************************************
 * 2. Build your scene in this threejs app
 *************************************************/
let app = {
  vertexShader() {
    return `
    #define PI 3.14159265359

    uniform float u_time;
    uniform float u_noise_amp_1;
    uniform float u_noise_freq_1;
    uniform float u_spd_modifier_1;
    uniform float u_noise_amp_2;
    uniform float u_noise_freq_2;
    uniform float u_spd_modifier_2;

    varying float vPosY;

    // 2D Random
    float random (in vec2 st) {
        return fract(sin(dot(st.xy,
                            vec2(12.9898,78.233)))
                    * 43758.5453123);
    }

    // 2D Noise
    float noise (in vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);

        // Four corners in 2D of a tile
        float a = random(i);
        float b = random(i + vec2(1.0, 0.0));
        float c = random(i + vec2(0.0, 1.0));
        float d = random(i + vec2(1.0, 1.0));

        // Smooth Interpolation
        vec2 u = f*f*(3.0-2.0*f);

        // Mix 4 corners percentages
        return mix(a, b, u.x) +
                (c - a)* u.y * (1.0 - u.x) +
                (d - b) * u.x * u.y;
    }

    mat2 rotate2d(float angle){
        return mat2(cos(angle),-sin(angle),
                  sin(angle),cos(angle));
    }

    void main() {
      vec3 pos = position;
      vPosY = pos.y; // Pass the y-position to the fragment shader

      // Apply noise to create wave effect
      pos.z += noise(pos.xy * u_noise_freq_1 + u_time * u_spd_modifier_1) * u_noise_amp_1;
      pos.z += noise(rotate2d(PI / 4.) * pos.xy * u_noise_freq_2 - u_time * u_spd_modifier_2 * 0.6) * u_noise_amp_2;

      vec4 mvm = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvm;
    }
    `;
  },
  fragmentShader() {
    return `
    #ifdef GL_ES
    precision mediump float;
    #endif

    varying float vPosY;

    void main() {
      // Define gradient colors
      vec3 colorStart = vec3(235.0/255.0, 116.0/255.0, 206.0/255.0); // #EB74CE
      vec3 colorEnd = vec3(50.0/255.0, 137.0/255.0, 247.0/255.0);    // #3289F7

      // Calculate gradient based on vPosY
      float gradientFactor = (vPosY + 2.0) / 4.0; // Adjust based on mesh dimensions
      gradientFactor = clamp(gradientFactor, 0.0, 1.0);

      vec3 color = mix(colorStart, colorEnd, gradientFactor);

      gl_FragColor = vec4(color, 1.0);
    }
    `;
  },
  async initScene() {
    // OrbitControls
    this.controls = new OrbitControls(camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0;

    // Environment
    scene.background = new THREE.Color("#191932");

    // Mesh
    // Create a custom hexagonal grid geometry with thick edges
    this.geometry = this.createHexagonalMeshGeometry(4, 4, 0.1, 0.003);

    const material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: this.vertexShader(),
      fragmentShader: this.fragmentShader(),
    });

    this.mesh = new THREE.Mesh(this.geometry, material);
    scene.add(this.mesh);

    // Set appropriate positioning
    this.mesh.rotation.x = -Math.PI / 3; // Rotate mesh to be horizontal
    this.mesh.position.y = 0;

    // GUI controls
    const gui = new dat.GUI();

    let wave1 = gui.addFolder("Wave 1");
    wave1
      .add(uniforms.u_noise_freq_1, "value", 0.1, 5, 0.1)
      .name("Frequency");
    wave1
      .add(uniforms.u_noise_amp_1, "value", 0.0, 1.0, 0.01)
      .name("Amplitude");
    wave1
      .add(uniforms.u_spd_modifier_1, "value", 0.0, 5.0, 0.1)
      .name("Speed");

    let wave2 = gui.addFolder("Wave 2");
    wave2
      .add(uniforms.u_noise_freq_2, "value", 0.1, 5, 0.1)
      .name("Frequency");
    wave2
      .add(uniforms.u_noise_amp_2, "value", 0.0, 1.0, 0.01)
      .name("Amplitude");
    wave2
      .add(uniforms.u_spd_modifier_2, "value", 0.0, 5.0, 0.1)
      .name("Speed");

    // Stats - show fps
    this.stats1 = new Stats();
    this.stats1.showPanel(0); // Panel 0 = fps
    this.stats1.domElement.style.cssText =
      "position:absolute;top:0px;left:0px;";
    // this.container is the parent DOM element of the threejs canvas element
    this.container.appendChild(this.stats1.domElement);
  },
  // Create the hexagonal grid geometry with thick edges
  createHexagonalMeshGeometry(gridWidth, gridHeight, hexRadius, lineThickness) {
    const geometry = new THREE.BufferGeometry();

    const vertices = [];
    const indices = [];

    const hexWidth = Math.sqrt(3) * hexRadius; // Width of the hexagon
    const hexHeight = 2 * hexRadius; // Height of the hexagon

    const horizDist = hexWidth; // Horizontal distance between hex centers
    const vertDist = (3 / 4) * hexHeight; // Vertical distance between hex centers

    // Calculate the number of hexagons in each direction
    const cols = Math.ceil((gridWidth + hexWidth) / horizDist);
    const rows = Math.ceil((gridHeight + hexHeight) / vertDist);

    let vertexIndex = 0;

    for (let row = -rows; row <= rows; row++) {
      for (let col = -cols; col <= cols; col++) {
        // Calculate the position of the hexagon center
        const x = col * horizDist + (row % 2) * (horizDist / 2);
        const y = row * vertDist;
        // Center the grid
        const posX = x - gridWidth / 2;
        const posY = y - gridHeight / 2;

        // Create hexagon edges as rectangles (quads)
        const rotationOffset = 2 * Math.PI / 4; // Rotate hexagon by 120 degrees
        for (let i = 0; i < 6; i++) {
          const angle1 = (Math.PI / 3) * i + rotationOffset;
          const angle2 = (Math.PI / 3) * ((i + 1) % 6) + rotationOffset;

          const x1 = posX + hexRadius * Math.cos(angle1);
          const y1 = posY + hexRadius * Math.sin(angle1);

          const x2 = posX + hexRadius * Math.cos(angle2);
          const y2 = posY + hexRadius * Math.sin(angle2);

          // Calculate edge direction and normal
          const dx = x2 - x1;
          const dy = y2 - y1;
          const length = Math.sqrt(dx * dx + dy * dy);
          const nx = -dy / length;
          const ny = dx / length;

          // Create two vertices for the quad (edge)
          const offsetX = (lineThickness / 2) * nx;
          const offsetY = (lineThickness / 2) * ny;

          vertices.push(
            x1 + offsetX, y1 + offsetY, 0, // Vertex 1
            x1 - offsetX, y1 - offsetY, 0, // Vertex 2
            x2 - offsetX, y2 - offsetY, 0, // Vertex 3
            x2 + offsetX, y2 + offsetY, 0  // Vertex 4
          );

          // Add two triangles to form the quad
          indices.push(
            vertexIndex, vertexIndex + 1, vertexIndex + 2,
            vertexIndex, vertexIndex + 2, vertexIndex + 3
          );

          vertexIndex += 4;
        }
      }
    }

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3)
    );
    geometry.setIndex(indices);

    geometry.computeVertexNormals();

    return geometry;
  },
  // @param {number} interval - time elapsed between 2 frames
  // @param {number} elapsed - total time elapsed since app start
  updateScene(interval, elapsed) {
    this.controls.update();
    this.stats1.update();
  },
};

/**************************************************
 * 3. Run the app
 *************************************************/
runApp(app, scene, renderer, camera, true, uniforms, undefined);
