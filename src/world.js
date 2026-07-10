import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

const TAU = Math.PI * 2;

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(19312026);
const between = (min, max) => min + (max - min) * random();

function canvasTexture(renderer, size, painter, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  painter(context, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  return texture;
}

function noisySurface(context, size, base, colors, count = 2400) {
  context.fillStyle = base;
  context.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i += 1) {
    context.globalAlpha = between(0.03, 0.2);
    context.fillStyle = colors[Math.floor(random() * colors.length)];
    const radius = between(0.4, 2.5);
    context.fillRect(random() * size, random() * size, radius, radius);
  }
  context.globalAlpha = 1;
}

function roofGeometry(width, depth, height) {
  const x = width / 2;
  const z = depth / 2;
  const positions = new Float32Array([
    -x, 0, -z,  x, 0, -z,  -x, 0, z,  x, 0, z,
    -x, height, 0,  x, height, 0,
  ]);
  const indices = [
    0, 1, 5, 0, 5, 4,
    2, 4, 5, 2, 5, 3,
    0, 4, 2,
    1, 3, 5,
    0, 2, 3, 0, 3, 1,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function archGeometry(width = 1, height = 1.8) {
  const shape = new THREE.Shape();
  const half = width / 2;
  const spring = height - width / 2;
  shape.moveTo(-half, 0);
  shape.lineTo(half, 0);
  shape.lineTo(half, spring);
  shape.absarc(0, spring, half, 0, Math.PI, false);
  shape.lineTo(-half, 0);
  return new THREE.ShapeGeometry(shape, 12);
}

function box(width, height, depth, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cylinder(radiusTop, radiusBottom, height, segments, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material,
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class BadaguanWorld {
  constructor(scene, renderer, quality = 'high') {
    this.scene = scene;
    this.renderer = renderer;
    this.quality = quality;
    this.clockTime = 0;
    this.colliders = [];
    this.animatedWindows = [];
    this.waveLines = [];
    this.gulls = [];
    this.pollen = null;
    this.leafPoints = null;
    this.leafData = [];
    this.hotspots = [
      {
        id: 'avenue', index: '01 / 04', position: new THREE.Vector3(0, 0, -50), radius: 13,
        eyebrow: 'SHANHAIGUAN ROAD', title: '林蔭大道', style: '法桐林蔭 · 花園街區',
        body: '八大關不是一排迎街的洋房，而是一片被成熟樹冠包覆的花園住宅區。低矮院牆、花崗岩路緣與庭院留白，讓紅瓦和山牆只從枝葉間偶爾露面。',
      },
      {
        id: 'princess', index: '02 / 04', position: new THREE.Vector3(0, 0, -34), radius: 11,
        eyebrow: 'JÜYONGGUAN ROAD', title: '公主樓', style: '丹麥意象 · 藍綠粉牆',
        body: '藍綠色牆面、白色窗框與赭紅陡屋頂，構成公主樓最鮮明的輪廓。它藏在松柏與院落之間，童話感來自比例與色彩，而不是浮誇的宮殿尺度。',
      },
      {
        id: 'huashi', index: '03 / 04', position: new THREE.Vector3(0, 0, 15), radius: 11,
        eyebrow: 'HUASHI VILLA', title: '花石樓', style: '花崗岩 · 1930s 海岸別墅',
        body: '粗獷花崗岩牆、拱窗與高低錯落的塔樓，使花石樓像一座從海岸岩地長出的微型城堡。真實尺度並不巨大，三面近海與林木掩映才是它的戲劇性。',
      },
      {
        id: 'coast', index: '04 / 04', position: new THREE.Vector3(0, 0, 72), radius: 10,
        eyebrow: 'TAIPING BAY', title: '第二海水浴場', style: '太平灣 · 藍灰海岸',
        body: '八大關南緣突然向太平灣打開。細沙、深褐礁岩和低浪線連在一起，背後仍是濃密松林與紅瓦建築；這裡的海色偏青灰，帶著青島特有的潮濕薄霧。',
      },
    ];

    this.group = new THREE.Group();
    this.group.name = 'Badaguan virtual landscape';
    scene.add(this.group);

    this.createTexturesAndMaterials();
    this.createSkyAndLights();
    this.createTerrain();
    this.createRoadNetwork();
    this.createWaterfront();
    this.createArchitecture();
    this.createTrees();
    this.createStreetDetails();
    this.createAtmosphere();
  }

  createTexturesAndMaterials() {
    const { renderer } = this;
    this.textures = {
      grass: canvasTexture(renderer, 256, (context, size) => {
        noisySurface(context, size, '#526447', ['#243c31', '#778162', '#9a8e61', '#405540'], 4500);
        for (let i = 0; i < 320; i += 1) {
          context.strokeStyle = `rgba(27,55,39,${between(0.05, 0.2)})`;
          context.beginPath();
          const x = random() * size;
          const y = random() * size;
          context.moveTo(x, y);
          context.lineTo(x + between(-2, 2), y - between(2, 6));
          context.stroke();
        }
      }, 18, 22),
      road: canvasTexture(renderer, 256, (context, size) => {
        noisySurface(context, size, '#545754', ['#303432', '#7d7e77', '#b2aa94'], 3800);
        context.lineWidth = 0.7;
        for (let i = 0; i < 8; i += 1) {
          context.strokeStyle = `rgba(25,30,28,${between(0.08, 0.2)})`;
          context.beginPath();
          context.moveTo(random() * size, 0);
          context.bezierCurveTo(random() * size, size * 0.3, random() * size, size * 0.7, random() * size, size);
          context.stroke();
        }
      }, 3, 28),
      pavement: canvasTexture(renderer, 256, (context, size) => {
        noisySurface(context, size, '#9a998e', ['#6c716e', '#c3bba7', '#545a58'], 2300);
        context.strokeStyle = 'rgba(53,57,53,.22)';
        context.lineWidth = 2;
        const unit = 32;
        for (let i = 0; i <= size; i += unit) {
          context.beginPath(); context.moveTo(i, 0); context.lineTo(i, size); context.stroke();
          context.beginPath(); context.moveTo(0, i); context.lineTo(size, i); context.stroke();
        }
      }, 2, 24),
      stone: canvasTexture(renderer, 512, (context, size) => {
        noisySurface(context, size, '#85837c', ['#525957', '#a4a097', '#676d69', '#beb5a5'], 5000);
        context.lineWidth = 3;
        let row = 0;
        for (let y = 0; y < size; y += 40) {
          context.strokeStyle = 'rgba(38,43,42,.32)';
          context.beginPath(); context.moveTo(0, y); context.lineTo(size, y); context.stroke();
          const offset = row % 2 ? -35 : 0;
          for (let x = offset; x < size; x += 70 + Math.floor(between(-8, 9))) {
            context.beginPath(); context.moveTo(x, y); context.lineTo(x + between(-4, 5), y + 40); context.stroke();
          }
          row += 1;
        }
      }, 4, 3),
      roof: canvasTexture(renderer, 256, (context, size) => {
        context.fillStyle = '#93452f'; context.fillRect(0, 0, size, size);
        for (let y = 0; y < size; y += 18) {
          for (let x = (y / 18) % 2 ? -9 : 0; x < size; x += 18) {
            context.strokeStyle = `rgba(61,30,24,${between(0.3, 0.52)})`;
            context.lineWidth = 1.4;
            context.beginPath(); context.arc(x + 9, y + 2, 8.5, 0, Math.PI); context.stroke();
          }
        }
        context.fillStyle = 'rgba(255,215,160,.07)';
        for (let i = 0; i < 400; i += 1) context.fillRect(random() * size, random() * size, 1.2, 1.2);
      }, 5, 4),
      plaster: canvasTexture(renderer, 256, (context, size) => {
        noisySurface(context, size, '#d0c3a2', ['#eee4cc', '#9f967d', '#c0b395'], 4000);
      }, 3, 2),
    };

    this.materials = {
      grass: new THREE.MeshStandardMaterial({ map: this.textures.grass, color: 0x718067, roughness: 1 }),
      road: new THREE.MeshStandardMaterial({ map: this.textures.road, color: 0x8c8b81, roughness: 0.92 }),
      wetRoad: new THREE.MeshPhysicalMaterial({ color: 0x4d5351, roughness: 0.72, clearcoat: 0.12, clearcoatRoughness: 0.4 }),
      pavement: new THREE.MeshStandardMaterial({ map: this.textures.pavement, color: 0xc1bcab, roughness: 0.95 }),
      stone: new THREE.MeshStandardMaterial({ map: this.textures.stone, color: 0xb2ada2, roughness: 0.98, bumpMap: this.textures.stone, bumpScale: 0.08 }),
      darkStone: new THREE.MeshStandardMaterial({ map: this.textures.stone, color: 0x777c78, roughness: 1, bumpMap: this.textures.stone, bumpScale: 0.12 }),
      roof: new THREE.MeshStandardMaterial({ map: this.textures.roof, color: 0xb9704e, roughness: 0.88 }),
      roofDark: new THREE.MeshStandardMaterial({ map: this.textures.roof, color: 0x6d392c, roughness: 0.92 }),
      plaster: new THREE.MeshStandardMaterial({ map: this.textures.plaster, color: 0xf1ddad, roughness: 0.96 }),
      cream: new THREE.MeshStandardMaterial({ map: this.textures.plaster, color: 0xf1e3c7, roughness: 0.92 }),
      blue: new THREE.MeshStandardMaterial({ map: this.textures.plaster, color: 0x568b83, roughness: 0.9 }),
      ochre: new THREE.MeshStandardMaterial({ map: this.textures.plaster, color: 0xc5a069, roughness: 0.94 }),
      pale: new THREE.MeshStandardMaterial({ map: this.textures.plaster, color: 0xcfd1be, roughness: 0.92 }),
      timber: new THREE.MeshStandardMaterial({ color: 0x493529, roughness: 0.88 }),
      whiteTrim: new THREE.MeshStandardMaterial({ color: 0xe3dfcf, roughness: 0.84 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x172522, roughness: 0.48, metalness: 0.42 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xa48654, roughness: 0.43, metalness: 0.36 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x527376, roughness: 0.2, metalness: 0.05, envMapIntensity: 0.8, emissive: 0x101e1e, emissiveIntensity: 0.25 }),
      warmGlass: new THREE.MeshStandardMaterial({ color: 0xc6aa78, emissive: 0x9a5a26, emissiveIntensity: 0.38, roughness: 0.4 }),
      trunk: new THREE.MeshStandardMaterial({ color: 0x756f64, roughness: 1 }),
      pineTrunk: new THREE.MeshStandardMaterial({ color: 0x4f3b2e, roughness: 1 }),
      sand: new THREE.MeshStandardMaterial({ color: 0xb8a985, roughness: 1 }),
      foam: new THREE.MeshBasicMaterial({ color: 0xdce1d9, transparent: true, opacity: 0.35, depthWrite: false }),
    };
  }

  createSkyAndLights() {
    const sky = new Sky();
    sky.scale.setScalar(480);
    sky.material.uniforms.turbidity.value = 8.5;
    sky.material.uniforms.rayleigh.value = 1.25;
    sky.material.uniforms.mieCoefficient.value = 0.008;
    sky.material.uniforms.mieDirectionalG.value = 0.82;
    const sun = new THREE.Vector3();
    const phi = THREE.MathUtils.degToRad(78);
    const theta = THREE.MathUtils.degToRad(235);
    sun.setFromSphericalCoords(1, phi, theta);
    sky.material.uniforms.sunPosition.value.copy(sun);
    this.scene.add(sky);

    this.scene.fog = new THREE.FogExp2(0xaec2c1, this.quality === 'low' ? 0.0048 : 0.0057);

    const hemisphere = new THREE.HemisphereLight(0xb8d8e3, 0x3a4632, 1.75);
    this.scene.add(hemisphere);

    const ambient = new THREE.AmbientLight(0x91aaa3, 0.46);
    this.scene.add(ambient);

    const sunLight = new THREE.DirectionalLight(0xffdfaa, 3.35);
    sunLight.position.set(-58, 72, 35);
    sunLight.target.position.set(0, 0, -15);
    sunLight.castShadow = true;
    const shadowSize = this.quality === 'low' ? 1024 : 2048;
    sunLight.shadow.mapSize.set(shadowSize, shadowSize);
    sunLight.shadow.camera.left = -82;
    sunLight.shadow.camera.right = 82;
    sunLight.shadow.camera.top = 105;
    sunLight.shadow.camera.bottom = -98;
    sunLight.shadow.camera.near = 12;
    sunLight.shadow.camera.far = 190;
    sunLight.shadow.bias = -0.00018;
    sunLight.shadow.normalBias = 0.025;
    this.scene.add(sunLight, sunLight.target);
    this.sunLight = sunLight;

    const warmFill = new THREE.DirectionalLight(0xe6a873, 0.38);
    warmFill.position.set(45, 18, -40);
    this.scene.add(warmFill);

    const seaFill = new THREE.DirectionalLight(0xa7d1d5, 0.72);
    seaFill.position.set(78, 30, 82);
    this.scene.add(seaFill);
  }

  createTerrain() {
    const land = box(190, 1.2, 212, this.materials.grass, 0, -0.75, -20);
    land.castShadow = false;
    land.receiveShadow = true;
    this.group.add(land);

    const outerGround = box(290, 0.8, 78, this.materials.grass, 0, -0.95, -158);
    outerGround.castShadow = false;
    this.group.add(outerGround);

    const parkRise = new THREE.Mesh(new THREE.CylinderGeometry(52, 58, 2.4, 32), this.materials.grass);
    parkRise.scale.set(1.15, 1, 0.45);
    parkRise.position.set(-54, -0.7, 44);
    parkRise.receiveShadow = true;
    this.group.add(parkRise);
  }

  createRoadNetwork() {
    const mainRoad = box(9.4, 0.16, 202, this.materials.road, 0, 0.03, -20);
    mainRoad.castShadow = false;
    this.group.add(mainRoad);

    [-28, 25].forEach((z) => {
      const cross = box(180, 0.15, 9.5, this.materials.road, 0, 0.04, z);
      cross.castShadow = false;
      this.group.add(cross);
      const upper = box(180, 0.02, 0.8, this.materials.wetRoad, 0, 0.13, z + 2.2);
      upper.castShadow = false;
      this.group.add(upper);
    });

    [-6.4, 6.4].forEach((x) => {
      const walk = box(2.2, 0.22, 202, this.materials.pavement, x, 0.06, -20);
      walk.castShadow = false;
      this.group.add(walk);
      const curb = box(0.32, 0.34, 202, this.materials.stone, x + Math.sign(x) * -1.24, 0.15, -20);
      curb.castShadow = false;
      this.group.add(curb);
    });

    [-28, 25].forEach((z) => {
      [-6.7, 6.7].forEach((offset) => {
        const walk = box(180, 0.2, 2.2, this.materials.pavement, 0, 0.07, z + offset);
        walk.castShadow = false;
        this.group.add(walk);
      });
    });

    for (let z = -114; z < 72; z += 10) {
      const line = box(0.14, 0.03, 3.3, this.materials.brass, 0, 0.135, z);
      line.material = line.material.clone();
      line.material.color.set(0x9c8956);
      line.castShadow = false;
      this.group.add(line);
    }

    for (let i = 0; i < 16; i += 1) {
      const puddleMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x657270, transparent: true, opacity: between(0.1, 0.22), roughness: 0.25,
        metalness: 0.08, clearcoat: 0.5, depthWrite: false,
      });
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(between(0.4, 1.2), 20), puddleMaterial);
      puddle.rotation.x = -Math.PI / 2;
      puddle.scale.x = between(1, 2.7);
      puddle.position.set(between(-4.8, 4.8), 0.15, between(-104, 58));
      this.group.add(puddle);
    }
  }

  createWaterfront() {
    const sand = box(190, 0.55, 19, this.materials.sand, 0, -0.34, 87);
    sand.castShadow = false;
    this.group.add(sand);

    const promenade = box(78, 0.42, 5, this.materials.pavement, 0, 0.05, 76.8);
    promenade.castShadow = false;
    this.group.add(promenade);

    const postPositions = [];
    for (let x = -38; x <= 38; x += 3.2) {
      if (Math.abs(x) >= 4.5) postPositions.push(x);
    }
    const railingPosts = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.07, 0.07, 1.25, 6),
      this.materials.metal,
      postPositions.length,
    );
    const postMatrix = new THREE.Matrix4();
    postPositions.forEach((x, index) => {
      postMatrix.makeTranslation(x, 0.83, 79.1);
      railingPosts.setMatrixAt(index, postMatrix);
    });
    this.group.add(railingPosts);
    [0.82, 1.22].forEach((height) => {
      [-1, 1].forEach((side) => {
        const rail = cylinder(0.07, 0.07, 33.5, 6, this.materials.metal, side * 21.25, height, 79.1);
        rail.rotation.z = Math.PI / 2;
        rail.castShadow = false;
        this.group.add(rail);
      });
    });
    [-1, 1].forEach((side) => this.colliders.push({
      minX: side < 0 ? -38.2 : 4.35,
      maxX: side < 0 ? -4.35 : 38.2,
      minZ: 78.95,
      maxZ: 79.25,
    }));

    for (let i = 0; i < 5; i += 1) {
      const step = box(10 + i * 1.8, 0.22, 1.3, this.materials.stone, 0, -0.02 - i * 0.17, 79.7 + i * 1.25);
      this.group.add(step);
    }

    const waterGeometry = new THREE.PlaneGeometry(300, 285, this.quality === 'low' ? 48 : 96, this.quality === 'low' ? 48 : 96);
    const waterMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        deepColor: { value: new THREE.Color(0x385f66) },
        shallowColor: { value: new THREE.Color(0x79999a) },
        sunColor: { value: new THREE.Color(0xf1cf9f) },
        fogColor: { value: this.scene.fog.color },
        fogDensity: { value: this.scene.fog.density },
      },
      vertexShader: `
        uniform float time;
        varying vec3 vWorldPosition;
        varying float vWave;
        void main() {
          vec3 transformed = position;
          float waveA = sin(position.x * .095 + time * .78) * .18;
          float waveB = sin(position.y * .16 - time * .62 + position.x * .035) * .11;
          float waveC = sin((position.x + position.y) * .045 + time * .38) * .08;
          transformed.z += waveA + waveB + waveC;
          vec4 world = modelMatrix * vec4(transformed, 1.0);
          vWorldPosition = world.xyz;
          vWave = waveA + waveB + waveC;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 deepColor;
        uniform vec3 shallowColor;
        uniform vec3 sunColor;
        uniform vec3 fogColor;
        uniform float fogDensity;
        varying vec3 vWorldPosition;
        varying float vWave;
        void main() {
          vec3 dx = dFdx(vWorldPosition);
          vec3 dy = dFdy(vWorldPosition);
          vec3 normal = normalize(cross(dx, dy));
          if (normal.y < 0.0) normal *= -1.0;
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);
          float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 2.3);
          float shore = 1.0 - smoothstep(90.0, 175.0, vWorldPosition.z);
          vec3 color = mix(deepColor, shallowColor, shore * .5 + fresnel * .42 + vWave * .2);
          vec3 lightDir = normalize(vec3(-.55, .7, -.25));
          vec3 halfDir = normalize(viewDir + lightDir);
          float glint = pow(max(dot(normal, halfDir), 0.0), 130.0);
          glint *= .42 + .58 * sin(vWorldPosition.x * .7 + vWorldPosition.z * .37 + time);
          color += sunColor * max(glint, 0.0) * .7;
          float distanceToCamera = length(cameraPosition - vWorldPosition);
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * distanceToCamera * distanceToCamera);
          color = mix(color, fogColor, clamp(fogFactor, 0.0, .92));
          gl_FragColor = vec4(color, .97);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.48, 223);
    water.receiveShadow = true;
    this.group.add(water);
    this.waterMaterial = waterMaterial;

    this.createSailboat(35, 151, 0.78);
    this.createSailboat(-56, 202, 0.52);

    for (let i = 0; i < 7; i += 1) {
      const wave = new THREE.Mesh(new THREE.PlaneGeometry(between(25, 54), between(0.08, 0.19)), this.materials.foam.clone());
      wave.rotation.x = -Math.PI / 2;
      wave.position.set(between(-75, 75), -0.17, 91.5 + i * 2.15);
      wave.userData.phase = between(0, TAU);
      wave.userData.baseOpacity = between(0.13, 0.32);
      wave.userData.baseX = wave.position.x;
      this.group.add(wave);
      this.waveLines.push(wave);
    }

    const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
    const rocks = new THREE.InstancedMesh(rockGeometry, this.materials.darkStone, 44);
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < 44; i += 1) {
      const x = i < 20 ? between(-90, -45) : between(42, 90);
      const z = between(82, 101);
      const scale = between(0.35, 1.7);
      matrix.compose(
        new THREE.Vector3(x, between(-0.42, -0.05), z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(between(-0.2, 0.2), between(0, TAU), between(-0.2, 0.2))),
        new THREE.Vector3(scale * between(0.8, 1.7), scale, scale * between(0.7, 1.35)),
      );
      rocks.setMatrixAt(i, matrix);
    }
    rocks.castShadow = rocks.receiveShadow = true;
    this.group.add(rocks);
  }

  addWindow(group, x, y, z, width, height, facing = 'front', material = this.materials.glass, arch = false) {
    const geometry = arch ? archGeometry(width, height) : new THREE.PlaneGeometry(width, height);
    const windowMesh = new THREE.Mesh(geometry, material);
    windowMesh.position.set(x, y, z);
    if (facing === 'back') windowMesh.rotation.y = Math.PI;
    if (facing === 'left') windowMesh.rotation.y = -Math.PI / 2;
    if (facing === 'right') windowMesh.rotation.y = Math.PI / 2;
    windowMesh.castShadow = false;
    group.add(windowMesh);

    const trimMaterial = this.materials.whiteTrim;
    const depth = 0.09;
    if (!arch) {
      if (this.quality === 'low') {
        const backing = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.24, height + 0.24), trimMaterial);
        backing.position.set(x, y, z);
        if (facing === 'front') backing.position.z -= 0.012;
        if (facing === 'back') { backing.position.z += 0.012; backing.rotation.y = Math.PI; }
        if (facing === 'left') { backing.position.x += 0.012; backing.rotation.y = -Math.PI / 2; }
        if (facing === 'right') { backing.position.x -= 0.012; backing.rotation.y = Math.PI / 2; }
        backing.castShadow = false;
        group.add(backing);
        return windowMesh;
      }
      const frameTop = box(width + 0.24, 0.12, depth, trimMaterial, x, y + height / 2 + 0.06, z + (facing === 'front' ? 0.015 : 0));
      const frameBottom = box(width + 0.24, 0.12, depth, trimMaterial, x, y - height / 2 - 0.06, z + (facing === 'front' ? 0.015 : 0));
      const frameMiddle = box(0.09, height, depth, trimMaterial, x, y, z + (facing === 'front' ? 0.02 : 0));
      [frameTop, frameBottom, frameMiddle].forEach((frame) => {
        if (facing === 'left' || facing === 'right') frame.rotation.y = Math.PI / 2;
        frame.castShadow = false;
        group.add(frame);
      });
    }
    return windowMesh;
  }

  createVilla({ x, z, width = 14, depth = 10, height = 7.5, material, roofMaterial, variant = 0 }) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;

    const plinth = box(width + 0.6, 1.2, depth + 0.55, this.materials.darkStone, 0, 0.6, 0);
    const body = box(width, height, depth, material, 0, 1.2 + height / 2, 0);
    const roof = new THREE.Mesh(roofGeometry(width + 1.2, depth + 1.6, 3.4 + variant * 0.2), roofMaterial);
    roof.position.y = height + 1.2;
    roof.castShadow = roof.receiveShadow = true;
    group.add(plinth, body, roof);

    const warm = random() > 0.78;
    const windowMaterial = warm ? this.materials.warmGlass : this.materials.glass;
    [-width * 0.27, width * 0.27].forEach((wx) => {
      this.addWindow(group, wx, 3.1, depth / 2 + 0.055, 1.25, 1.75, 'front', windowMaterial);
      this.addWindow(group, wx, 6, depth / 2 + 0.055, 1.25, 1.7, 'front', this.materials.glass);
    });

    const door = box(1.55, 2.55, 0.16, this.materials.timber, 0, 2.48, depth / 2 + 0.12);
    group.add(door);
    const awning = new THREE.Mesh(roofGeometry(3.7, 2.2, 1.2), roofMaterial);
    awning.position.set(0, 4.05, depth / 2 + 0.85);
    awning.castShadow = true;
    group.add(awning);

    if (variant % 2 === 0) {
      const wingWidth = width * 0.42;
      const wing = box(wingWidth, height * 0.72, depth * 0.68, material, width * 0.47, 1.2 + height * 0.36, 0.65);
      const wingRoof = new THREE.Mesh(roofGeometry(wingWidth + 0.8, depth * 0.68 + 1.2, 2.2), roofMaterial);
      wingRoof.position.set(width * 0.47, 1.2 + height * 0.72, 0.65);
      wingRoof.castShadow = true;
      group.add(wing, wingRoof);
    } else {
      const bay = box(3.1, height * 0.75, 1.25, material, width * 0.27, 1.2 + height * 0.375, depth / 2 + 0.58);
      group.add(bay);
    }

    const chimney = box(1.15, 3.3, 1.05, this.materials.darkStone, -width * 0.28, height + 2.1, -0.4);
    group.add(chimney);

    if (variant === 2) {
      const timberY = height + 1.36;
      [-width * 0.32, 0, width * 0.32].forEach((tx) => group.add(box(0.16, 2.3, 0.14, this.materials.timber, tx, timberY, depth / 2 + 0.16)));
      group.add(box(width * 0.75, 0.14, 0.14, this.materials.timber, 0, height + 0.55, depth / 2 + 0.16));
    }

    this.group.add(group);
    const worldDepth = width + 1.5;
    const worldWidth = depth + 1.5;
    this.colliders.push({ minX: x - worldWidth / 2, maxX: x + worldWidth / 2, minZ: z - worldDepth / 2, maxZ: z + worldDepth / 2 });
    return group;
  }

  createHuashiVilla() {
    const group = new THREE.Group();
    group.position.set(-34, 0, 45);
    group.rotation.y = Math.PI / 2;

    const base = box(23, 1.4, 12.8, this.materials.darkStone, 0, 0.7, 0);
    const main = box(22, 10.8, 12.1, this.materials.stone, 0, 6.8, 0);
    const upper = box(13.5, 4.1, 10.8, this.materials.stone, 1.2, 14.2, -0.25);
    const roof = new THREE.Mesh(roofGeometry(15, 12.2, 4.5), this.materials.roofDark);
    roof.position.set(1.2, 16.25, -0.25);
    roof.castShadow = roof.receiveShadow = true;
    group.add(base, main, upper, roof);

    const tower = cylinder(4.05, 4.3, 18.3, 10, this.materials.stone, -8.15, 9.85, 3.6);
    group.add(tower);
    const towerBand = cylinder(4.4, 4.4, 0.65, 10, this.materials.darkStone, -8.15, 18.75, 3.6);
    group.add(towerBand);
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * TAU;
      const crenel = box(1.1, 1.3, 0.75, this.materials.stone,
        -8.15 + Math.sin(angle) * 3.85, 19.55, 3.6 + Math.cos(angle) * 3.85);
      crenel.rotation.y = angle;
      group.add(crenel);
    }

    const stairTower = cylinder(2.65, 2.8, 13.2, 8, this.materials.stone, 10.2, 7.3, 2.1);
    const stairRoof = new THREE.Mesh(new THREE.ConeGeometry(3.25, 4.2, 8), this.materials.roofDark);
    stairRoof.position.set(10.2, 16, 2.1);
    stairRoof.castShadow = true;
    group.add(stairTower, stairRoof);

    [-5.2, 0.4, 5.7].forEach((x) => {
      this.addWindow(group, x, 4.1, 6.08, 1.2, 2.45, 'front', this.materials.glass, true);
      this.addWindow(group, x, 8.4, 6.08, 1.1, 2.15, 'front', this.materials.glass, true);
    });
    [-3.5, 1.2, 5.3].forEach((x) => this.addWindow(group, x, 14, 5.22, 1.0, 1.75, 'front'));

    const entry = box(2.1, 3.25, 0.2, this.materials.timber, 4.3, 2.45, 6.14);
    const balcony = box(5, 0.35, 1.5, this.materials.darkStone, 3.7, 10.9, 6.5);
    group.add(entry, balcony);

    const terrace = box(31, 0.6, 18, this.materials.stone, 0, 0.1, 0);
    group.add(terrace);

    this.group.add(group);
    this.colliders.push({ minX: -43, maxX: -24, minZ: 31, maxZ: 59 });
    return group;
  }

  createSailboat(x, z, scale = 1) {
    const group = new THREE.Group();
    group.position.set(x, -0.05, z);
    group.scale.setScalar(scale);
    const hull = box(5.2, 0.65, 1.45, this.materials.timber, 0, 0.42, 0);
    hull.geometry.translate(0, 0, 0);
    const mast = cylinder(0.07, 0.09, 7.2, 6, this.materials.timber, 0, 4.05, 0);
    const sailMaterial = new THREE.MeshStandardMaterial({ color: 0xd9d5c3, roughness: 0.9, side: THREE.DoubleSide });
    const sailGeometry = new THREE.BufferGeometry();
    sailGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0.18, 1, 0, 0.18, 7.2, 0, 3.6, 1, 0,
      -0.18, 1.3, 0, -0.18, 6.5, 0, -2.5, 1.3, 0,
    ], 3));
    sailGeometry.computeVertexNormals();
    const sails = new THREE.Mesh(sailGeometry, sailMaterial);
    sails.castShadow = true;
    group.add(hull, mast, sails);
    this.group.add(group);
  }

  createPrincessHouse() {
    const group = new THREE.Group();
    group.position.set(34, 0, -18);
    group.rotation.y = -Math.PI / 2;

    const body = box(18, 8.5, 11, this.materials.blue, 0, 5, 0);
    const plinth = box(18.6, 1.2, 11.5, this.materials.darkStone, 0, 0.6, 0);
    const roof = new THREE.Mesh(roofGeometry(19.4, 13, 5.5), this.materials.roof);
    roof.position.y = 9.2;
    roof.castShadow = roof.receiveShadow = true;
    group.add(plinth, body, roof);

    const tower = box(6, 11.2, 6.2, this.materials.blue, -6.2, 6.6, 2.4);
    const towerRoof = new THREE.Mesh(roofGeometry(7.2, 7.5, 5.7), this.materials.roofDark);
    towerRoof.position.set(-6.2, 12.2, 2.4);
    towerRoof.castShadow = true;
    group.add(tower, towerRoof);

    const porch = box(5.2, 3.2, 2.6, this.materials.blue, 3.8, 2.2, 6);
    const porchRoof = new THREE.Mesh(roofGeometry(6.2, 3.8, 1.8), this.materials.roof);
    porchRoof.position.set(3.8, 3.8, 6);
    group.add(porch, porchRoof);

    [-5.8, 0, 5.7].forEach((x) => {
      this.addWindow(group, x, 3.4, 5.56, 1.3, 1.9, 'front', this.materials.glass);
      this.addWindow(group, x, 6.8, 5.56, 1.25, 1.8, 'front', this.materials.glass);
    });

    [-8.4, -4, 0.4, 4.8, 8.3].forEach((x) => {
      group.add(box(0.16, 7.7, 0.12, this.materials.whiteTrim, x, 5.3, 5.61));
    });
    group.add(box(17.8, 0.16, 0.12, this.materials.whiteTrim, 0, 8.55, 5.61));

    const roundWindow = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.72, 20), this.materials.whiteTrim);
    roundWindow.position.set(0, 11.15, 6.02);
    group.add(roundWindow);
    const chimney = box(1.2, 4.6, 1.1, this.materials.whiteTrim, 4.2, 11.2, -1.5);
    group.add(chimney);

    this.group.add(group);
    this.colliders.push({ minX: 27, maxX: 42, minZ: -29, maxZ: -7 });
    return group;
  }

  createArchitecture() {
    this.createHuashiVilla();
    this.createPrincessHouse();

    const villaSpecs = [
      [-34, -94, 13.5, 9.5, 7.3, 'cream', 0],
      [-38, -66, 15.5, 10.5, 8.2, 'ochre', 1],
      [-35, -39, 13, 9.2, 7.1, 'pale', 2],
      [-37, -2, 15, 11, 8.0, 'plaster', 0],
      [-39, 23, 13.5, 9.5, 7.7, 'cream', 2],
      [36, -96, 14.8, 10.5, 7.5, 'ochre', 2],
      [38, -68, 13, 9.5, 7.1, 'pale', 1],
      [38, 5, 15.6, 10.8, 7.9, 'cream', 0],
      [40, 33, 13.2, 9.5, 7.2, 'plaster', 1],
      [40, 61, 14.5, 10, 7.4, 'ochre', 2],
      [-66, -27, 16, 11, 8.2, 'pale', 1],
      [67, 25, 15, 10, 7.6, 'cream', 0],
    ];
    villaSpecs.forEach(([x, z, width, depth, height, materialName, variant], index) => {
      this.createVilla({
        x, z, width, depth, height,
        material: this.materials[materialName],
        roofMaterial: index % 3 === 1 ? this.materials.roofDark : this.materials.roof,
        variant,
      });
    });

    const wallSegments = [
      [-15.5, -94, 20], [-15.5, -66, 20], [-15.5, -39, 18], [-15.5, -4, 22], [-15.5, 24, 17], [-15.5, 50, 20],
      [15.5, -96, 19], [15.5, -68, 19], [15.5, -18, 23], [15.5, 7, 19], [15.5, 34, 20], [15.5, 60, 19],
    ];
    wallSegments.forEach(([x, z, length], index) => this.createGardenWall(x, z, length, index % 2 === 0));
  }

  createGardenWall(x, z, length, fence = false) {
    const gap = 3.5;
    const segment = (length - gap) / 2;
    const a = box(0.55, 0.72, segment, this.materials.stone, x, 0.36, z - (gap + segment) / 2);
    const b = box(0.55, 0.72, segment, this.materials.stone, x, 0.36, z + (gap + segment) / 2);
    const p1 = box(0.9, 1.75, 0.9, this.materials.darkStone, x, 0.88, z - gap / 2);
    const p2 = box(0.9, 1.75, 0.9, this.materials.darkStone, x, 0.88, z + gap / 2);
    this.group.add(a, b, p1, p2);
    [a, b, p1, p2].forEach((piece) => {
      const size = new THREE.Vector3();
      new THREE.Box3().setFromObject(piece).getSize(size);
      this.colliders.push({
        minX: piece.position.x - size.x / 2,
        maxX: piece.position.x + size.x / 2,
        minZ: piece.position.z - size.z / 2,
        maxZ: piece.position.z + size.z / 2,
      });
    });

    if (fence) {
      const offsets = [];
      for (let offset = -length / 2; offset <= length / 2; offset += 1.25) {
        if (Math.abs(offset) >= gap / 2) offsets.push(offset);
      }
      const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.85, 0.07), this.materials.metal, offsets.length);
      const matrix = new THREE.Matrix4();
      offsets.forEach((offset, index) => {
        matrix.makeTranslation(x, 1.12, z + offset);
        posts.setMatrixAt(index, matrix);
      });
      this.group.add(posts);
    }
  }

  createTrees() {
    const treePositions = [];
    for (let z = -115; z <= 73; z += 7.6) {
      [-1, 1].forEach((side) => {
        if (Math.abs(z + 28) < 5 || Math.abs(z - 25) < 5) return;
        treePositions.push({ x: side * between(9.6, 12.2), z: z + between(-1.1, 1.1), scale: between(0.82, 1.18), autumn: random() > 0.82, major: true });
      });
    }
    for (let i = 0; i < 82; i += 1) {
      let x = between(-86, 86);
      const z = between(-116, 69);
      if (Math.abs(x) < 19) x = Math.sign(x || 1) * between(20, 85);
      const clearHuashi = !(x > -49 && x < -20 && z > 28 && z < 64);
      const clearPrincess = !(x > 24 && x < 44 && z > -32 && z < -5);
      if (clearHuashi && clearPrincess) treePositions.push({ x, z, scale: between(0.7, 1.2), autumn: random() > 0.9 });
    }

    const trunkGeometry = new THREE.CylinderGeometry(0.42, 0.58, 7.4, 7);
    const crownGeometry = new THREE.IcosahedronGeometry(2.65, 1);
    const branchGeometry = new THREE.CylinderGeometry(0.13, 0.25, 4.1, 5);
    const trunks = new THREE.InstancedMesh(trunkGeometry, this.materials.trunk, treePositions.length);
    const crowns = new THREE.InstancedMesh(crownGeometry, new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.98,
      emissive: 0x101a0f,
      emissiveIntensity: 0.44,
    }), treePositions.length * 3);
    const branches = new THREE.InstancedMesh(branchGeometry, this.materials.trunk, treePositions.length * 2);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    let crownIndex = 0;
    let branchIndex = 0;
    treePositions.forEach((tree, index) => {
      if (tree.major) this.colliders.push({ x: tree.x, z: tree.z, radius: 0.58 * tree.scale });
      const trunkHeight = 7.2 * tree.scale;
      matrix.compose(
        new THREE.Vector3(tree.x, trunkHeight / 2, tree.z),
        quaternion.setFromEuler(new THREE.Euler(between(-0.025, 0.025), between(0, TAU), between(-0.025, 0.025))),
        new THREE.Vector3(tree.scale, tree.scale, tree.scale),
      );
      trunks.setMatrixAt(index, matrix);
      for (let j = 0; j < 2; j += 1) {
        const angle = between(0, TAU);
        const direction = new THREE.Vector3(Math.sin(angle) * 0.6, 1, Math.cos(angle) * 0.6).normalize();
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        matrix.compose(
          new THREE.Vector3(tree.x + Math.sin(angle) * 0.6, trunkHeight * 0.74, tree.z + Math.cos(angle) * 0.6),
          quaternion,
          new THREE.Vector3(tree.scale, tree.scale, tree.scale),
        );
        branches.setMatrixAt(branchIndex, matrix);
        branchIndex += 1;
      }
      for (let j = 0; j < 3; j += 1) {
        const angle = (j / 3) * TAU + between(-0.5, 0.5);
        const radius = j === 0 ? 0.4 : 2.1 * tree.scale;
        const px = tree.x + Math.cos(angle) * radius;
        const pz = tree.z + Math.sin(angle) * radius;
        const py = trunkHeight + 1.5 + (j === 0 ? 1.1 : between(-0.25, 0.8));
        scale.set(between(1, 1.45) * tree.scale, between(0.82, 1.18) * tree.scale, between(1, 1.45) * tree.scale);
        matrix.compose(new THREE.Vector3(px, py, pz), quaternion.setFromEuler(new THREE.Euler(between(-0.25, 0.25), between(0, TAU), 0)), scale);
        crowns.setMatrixAt(crownIndex, matrix);
        if (tree.autumn) {
          color.set(random() > 0.45 ? 0xb18b45 : 0x7d733b).offsetHSL(between(-0.02, 0.02), between(-0.03, 0.04), between(-0.05, 0.05));
        } else {
          color.set([0x4a6845, 0x698453, 0x7e8f60, 0x3e5b3f][Math.floor(random() * 4)]).offsetHSL(between(-0.015, 0.015), 0, between(-0.03, 0.05));
        }
        crowns.setColorAt(crownIndex, color);
        crownIndex += 1;
      }
    });
    trunks.castShadow = trunks.receiveShadow = true;
    branches.castShadow = true;
    crowns.castShadow = this.quality !== 'low';
    crowns.receiveShadow = true;
    trunks.instanceMatrix.needsUpdate = branches.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = true;
    crowns.instanceColor.needsUpdate = true;
    this.group.add(trunks, branches, crowns);

    const pinePositions = [];
    for (let i = 0; i < 34; i += 1) {
      const side = random() > 0.5 ? 1 : -1;
      pinePositions.push({ x: side * between(43, 89), z: between(50, 78), scale: between(0.7, 1.25) });
    }
    const pineCrownGeometry = new THREE.ConeGeometry(2.8, 6.5, 9);
    const pineMaterial = new THREE.MeshStandardMaterial({ color: 0x294738, roughness: 1 });
    const pineCrowns = new THREE.InstancedMesh(pineCrownGeometry, pineMaterial, pinePositions.length * 2);
    const pineTrunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.38, 7, 6), this.materials.pineTrunk, pinePositions.length);
    let pineIndex = 0;
    pinePositions.forEach((tree, index) => {
      matrix.compose(new THREE.Vector3(tree.x, 3.5 * tree.scale, tree.z), new THREE.Quaternion(), new THREE.Vector3(tree.scale, tree.scale, tree.scale));
      pineTrunks.setMatrixAt(index, matrix);
      for (let level = 0; level < 2; level += 1) {
        const s = tree.scale * (1 - level * 0.2);
        matrix.compose(new THREE.Vector3(tree.x, (5.1 + level * 3.2) * tree.scale, tree.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, between(0, TAU), 0)), new THREE.Vector3(s, s, s));
        pineCrowns.setMatrixAt(pineIndex, matrix);
        pineIndex += 1;
      }
    });
    pineTrunks.castShadow = pineCrowns.castShadow = true;
    this.group.add(pineTrunks, pineCrowns);

    const shrubs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.75, 1), new THREE.MeshStandardMaterial({ color: 0x476443, roughness: 1 }), 120);
    for (let i = 0; i < 120; i += 1) {
      const side = random() > 0.5 ? 1 : -1;
      const x = side * between(18.5, 84);
      const z = between(-116, 70);
      const s = between(0.55, 1.35);
      matrix.compose(new THREE.Vector3(x, s * 0.56, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, between(0, TAU), 0)), new THREE.Vector3(s * between(0.8, 1.5), s, s * between(0.8, 1.5)));
      shrubs.setMatrixAt(i, matrix);
    }
    shrubs.castShadow = true;
    this.group.add(shrubs);
  }

  createStreetDetails() {
    const lampPositions = [];
    for (let z = -108; z <= 66; z += 17.5) {
      [-1, 1].forEach((side) => lampPositions.push({ x: side * 7.72, z: z + (side > 0 ? 3 : -3) }));
    }
    this.createLamps(lampPositions);

    this.createBench(-7.8, -43, Math.PI / 2);
    this.createBench(7.8, 38, -Math.PI / 2);
    this.createBench(-7.7, 65, Math.PI / 2);
    this.createRoadSign(-7.7, -24.5, '山海關路', 'SHANHAIGUAN RD');
    this.createRoadSign(7.7, 28.5, '正陽關路', 'ZHENGYANGGUAN RD');
    this.createClassicCar(3.55, 8.5, 0x31463f);

    const fallenLeaves = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.065, 5),
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      76,
    );
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    for (let i = 0; i < 76; i += 1) {
      quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, between(0, TAU), between(0, TAU)));
      scale.set(between(0.5, 1.8), between(0.6, 1.25), 1);
      matrix.compose(new THREE.Vector3(between(-5.2, 5.2), 0.16, between(-112, 67)), quaternion, scale);
      fallenLeaves.setMatrixAt(i, matrix);
      fallenLeaves.setColorAt(i, color.set(random() > 0.6 ? 0xa77c36 : 0x5b6840));
    }
    this.group.add(fallenLeaves);
  }

  createLamps(positions) {
    const parts = [
      new THREE.InstancedMesh(new THREE.CylinderGeometry(0.075, 0.12, 4.2, 7), this.materials.metal, positions.length),
      new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.2, 0.22, 7), this.materials.metal, positions.length),
      new THREE.InstancedMesh(new THREE.BoxGeometry(0.43, 0.7, 0.43), this.materials.warmGlass, positions.length),
      new THREE.InstancedMesh(new THREE.ConeGeometry(0.42, 0.35, 4), this.materials.metal, positions.length),
    ];
    const heights = [2.1, 4.35, 3.95, 4.49];
    const matrix = new THREE.Matrix4();
    const capRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0));
    parts.forEach((part, partIndex) => {
      positions.forEach((position, index) => {
        matrix.compose(
          new THREE.Vector3(position.x, heights[partIndex], position.z),
          partIndex === 3 ? capRotation : new THREE.Quaternion(),
          new THREE.Vector3(1, 1, 1),
        );
        part.setMatrixAt(index, matrix);
      });
      part.castShadow = this.quality !== 'low';
      this.group.add(part);
    });
    positions.forEach((position) => this.colliders.push({ x: position.x, z: position.z, radius: 0.14 }));
  }

  createBench(x, z, rotation) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    [-0.85, 0.85].forEach((px) => {
      group.add(box(0.12, 0.85, 0.45, this.materials.metal, px, 0.42, 0));
    });
    for (let i = 0; i < 4; i += 1) group.add(box(2.2, 0.12, 0.28, this.materials.timber, 0, 0.55 + i * 0.28, -0.22 - i * 0.05));
    group.add(box(2.25, 0.12, 0.7, this.materials.timber, 0, 0.72, 0.38));
    this.group.add(group);
  }

  createRoadSign(x, z, chinese, english) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 170;
    const context = canvas.getContext('2d');
    context.fillStyle = '#183b33';
    context.fillRect(4, 4, 504, 162);
    context.strokeStyle = '#d2c8a7';
    context.lineWidth = 6;
    context.strokeRect(7, 7, 498, 156);
    context.fillStyle = '#ece4ca';
    context.textAlign = 'center';
    context.font = '600 58px serif';
    context.fillText(chinese, 256, 72);
    context.font = '500 25px sans-serif';
    context.letterSpacing = '5px';
    context.fillText(english, 256, 126);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const signMaterial = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.76, side: THREE.DoubleSide });
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.add(cylinder(0.07, 0.1, 2.8, 7, this.materials.metal, 0, 1.4, 0));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.82), signMaterial);
    sign.position.y = 2.65;
    sign.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
    sign.castShadow = true;
    group.add(sign);
    this.group.add(group);
  }

  createClassicCar(x, z, color) {
    const group = new THREE.Group();
    group.position.set(x, 0.1, z);
    const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.38, roughness: 0.36 });
    group.add(box(3.65, 0.72, 1.55, paint, 0, 0.75, 0));
    const cabin = box(1.9, 0.82, 1.38, this.materials.glass, -0.15, 1.47, 0);
    cabin.geometry.translate(0, 0, 0);
    group.add(cabin);
    [-1.15, 1.15].forEach((wx) => [-0.77, 0.77].forEach((wz) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.22, 12), this.materials.metal);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.52, wz);
      wheel.castShadow = true;
      group.add(wheel);
    }));
    const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xd9c89c, emissive: 0x9c7c42, emissiveIntensity: 0.15 });
    [-0.52, 0.52].forEach((wz) => group.add(box(0.12, 0.28, 0.3, lampMaterial, 1.86, 0.88, wz)));
    group.rotation.y = 0.04;
    this.group.add(group);
    this.colliders.push({ minX: x - 2.1, maxX: x + 2.1, minZ: z - 1.1, maxZ: z + 1.1 });
  }

  createAtmosphere() {
    const pollenCount = this.quality === 'low' ? 120 : 320;
    const positions = new Float32Array(pollenCount * 3);
    for (let i = 0; i < pollenCount; i += 1) {
      positions[i * 3] = between(-34, 34);
      positions[i * 3 + 1] = between(0.3, 12);
      positions[i * 3 + 2] = between(-110, 65);
    }
    const pollenGeometry = new THREE.BufferGeometry();
    pollenGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pollenMaterial = new THREE.PointsMaterial({ color: 0xe3d49a, size: 0.045, transparent: true, opacity: 0.46, depthWrite: false, sizeAttenuation: true });
    this.pollen = new THREE.Points(pollenGeometry, pollenMaterial);
    this.group.add(this.pollen);

    const leafCount = this.quality === 'low' ? 18 : 42;
    const leafPositions = new Float32Array(leafCount * 3);
    const leafColors = new Float32Array(leafCount * 3);
    const green = new THREE.Color();
    for (let i = 0; i < leafCount; i += 1) {
      leafPositions[i * 3] = between(-18, 18);
      leafPositions[i * 3 + 1] = between(1, 12);
      leafPositions[i * 3 + 2] = between(-105, 65);
      green.set(random() > 0.8 ? 0xb09042 : 0x637347);
      leafColors[i * 3] = green.r; leafColors[i * 3 + 1] = green.g; leafColors[i * 3 + 2] = green.b;
      this.leafData.push({ speed: between(0.1, 0.28), sway: between(0.3, 0.8), phase: between(0, TAU) });
    }
    const leafGeometry = new THREE.BufferGeometry();
    leafGeometry.setAttribute('position', new THREE.BufferAttribute(leafPositions, 3));
    leafGeometry.setAttribute('color', new THREE.BufferAttribute(leafColors, 3));
    this.leafPoints = new THREE.Points(leafGeometry, new THREE.PointsMaterial({ size: 0.11, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false }));
    this.group.add(this.leafPoints);

    const cloudTexture = canvasTexture(this.renderer, 256, (context, size) => {
      context.clearRect(0, 0, size, size);
      const gradient = context.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, 'rgba(238,239,224,.48)');
      gradient.addColorStop(0.45, 'rgba(224,232,221,.25)');
      gradient.addColorStop(1, 'rgba(220,230,222,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);
    });
    cloudTexture.wrapS = cloudTexture.wrapT = THREE.ClampToEdgeWrapping;
    for (let i = 0; i < 7; i += 1) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexture, transparent: true, opacity: between(0.11, 0.22), depthWrite: false, fog: true }));
      sprite.position.set(between(-145, 145), between(52, 83), between(105, 250));
      sprite.scale.set(between(48, 82), between(17, 28), 1);
      this.group.add(sprite);
    }

    for (let i = 0; i < 9; i += 1) {
      const gull = this.createGull();
      gull.position.set(between(-105, 105), between(13, 31), between(115, 235));
      gull.userData.radius = between(16, 38);
      gull.userData.speed = between(0.05, 0.12);
      gull.userData.phase = between(0, TAU);
      this.group.add(gull);
      this.gulls.push(gull);
    }
  }

  createGull() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.8, 0, 0, 0, 0.15, 0,
      0, 0.15, 0, 0.8, 0, 0,
    ], 3));
    const material = new THREE.LineBasicMaterial({ color: 0x2e4748, transparent: true, opacity: 0.7 });
    return new THREE.LineSegments(geometry, material);
  }

  isWalkable(position, previousPosition) {
    const radius = 0.55;
    if (position.x < -90 || position.x > 90 || position.z < -121 || position.z > 96) return false;
    for (const collider of this.colliders) {
      if (collider.radius) {
        if (Math.hypot(position.x - collider.x, position.z - collider.z) < radius + collider.radius) return false;
        continue;
      }
      if (
        position.x + radius > collider.minX && position.x - radius < collider.maxX &&
        position.z + radius > collider.minZ && position.z - radius < collider.maxZ
      ) return false;
    }
    return true;
  }

  getGroundHeight(x, z) {
    if (z > 79) return THREE.MathUtils.lerp(0, -0.08, THREE.MathUtils.clamp((z - 79) / 7, 0, 1));
    const dx = (x + 54) / 60;
    const dz = (z - 44) / 25;
    const distance = Math.hypot(dx, dz);
    return distance < 1 ? 0.5 * (1 - distance * distance) : 0;
  }

  update(delta, elapsed) {
    this.clockTime = elapsed;
    if (this.waterMaterial) this.waterMaterial.uniforms.time.value = elapsed;
    if (this.pollen) {
      this.pollen.rotation.y = Math.sin(elapsed * 0.06) * 0.02;
      this.pollen.position.x = Math.sin(elapsed * 0.16) * 0.5;
    }
    if (this.leafPoints) {
      const attribute = this.leafPoints.geometry.attributes.position;
      for (let i = 0; i < this.leafData.length; i += 1) {
        const data = this.leafData[i];
        attribute.array[i * 3 + 1] -= data.speed * delta;
        attribute.array[i * 3] += Math.sin(elapsed * data.sway + data.phase) * delta * 0.09;
        if (attribute.array[i * 3 + 1] < 0.25) attribute.array[i * 3 + 1] = between(7, 13);
      }
      attribute.needsUpdate = true;
    }
    this.waveLines.forEach((wave, index) => {
      const pulse = (Math.sin(elapsed * 0.72 + wave.userData.phase) + 1) / 2;
      wave.material.opacity = wave.userData.baseOpacity * (0.35 + pulse * 0.65);
      wave.position.x = wave.userData.baseX + Math.sin(elapsed * 0.18 + index) * 1.2;
      wave.scale.x = 0.85 + pulse * 0.25;
    });
    this.gulls.forEach((gull, index) => {
      const phase = elapsed * gull.userData.speed + gull.userData.phase;
      gull.position.x += Math.sin(phase) * delta * 0.23;
      gull.position.y += Math.sin(elapsed * 0.62 + index) * delta * 0.035;
      gull.rotation.z = Math.sin(elapsed * 1.7 + index) * 0.08;
    });
  }
}
