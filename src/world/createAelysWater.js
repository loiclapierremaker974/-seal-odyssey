import * as THREE from 'three';
import { WaterResponse, sampleAelysSurface } from './WaterResponse.js';

/**
 * One-pass ocean for the Aelys prototype. Reflections are an analytical sky
 * approximation; no reflection render target or production texture is used.
 */
export function createAelysWater({
  size,
  waterLevel,
  terrainHeight,
  lowPower = false,
}) {
  const resolution = 256;
  const minimumHeight = -6;
  const heightRange = 9;
  const pixels = new Uint8Array(resolution * resolution);
  for (let row = 0; row < resolution; row += 1) {
    for (let column = 0; column < resolution; column += 1) {
      // Texel centres match the shader's normalized world-space lookup.
      const x = ((column + 0.5) / resolution - 0.5) * size;
      const z = ((row + 0.5) / resolution - 0.5) * size;
      const height = terrainHeight(x, z);
      pixels[row * resolution + column] = Math.round(
        THREE.MathUtils.clamp((height - minimumHeight) / heightRange, 0, 1) * 255,
      );
    }
  }
  const seabed = new THREE.DataTexture(
    pixels, resolution, resolution, THREE.RedFormat, THREE.UnsignedByteType,
  );
  seabed.name = 'Aelys shared-terrain height field';
  seabed.minFilter = THREE.LinearFilter;
  seabed.magFilter = THREE.LinearFilter;
  seabed.generateMipmaps = false;
  seabed.unpackAlignment = 1;
  seabed.needsUpdate = true;

  const response = new WaterResponse({capacity:lowPower?4:8});
  const segments = lowPower ? 96 : 176;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: { value: 0 },
        uImpacts: { value: response.impacts },
        uResponseTime: { value: 0 },
        uSeabed: { value: seabed },
        uWorldSize: { value: size },
        uWaterLevel: { value: waterLevel },
        uHeightBase: { value: minimumHeight },
        uHeightRange: { value: heightRange },
        uShallow: { value: new THREE.Color(0x46c6bc) },
        uDeep: { value: new THREE.Color(0x0b637b) },
        uHorizon: { value: new THREE.Color(0xc0e5dc) },
        uSky: { value: new THREE.Color(0x4b96bd) },
        uSun: { value: new THREE.Color(0xffe2b3) },
        uSunDirection: { value: new THREE.Vector3(-12, 20, 4).normalize() },
    },
    vertexShader: `
      uniform float uTime;
      uniform vec4 uImpacts[8];
      uniform float uResponseTime;
      vec3 waterResponse(vec2 p) {
        float height=0.0;vec2 gradient=vec2(0.0);
        for(int i=0;i<8;i++) {
          vec4 impact=uImpacts[i];float age=uResponseTime-impact.z;
          if(impact.w<=0.0 || age<0.0 || age>2.8)continue;
          vec2 radial=p-impact.xy;float distance=length(radial);
          float offset=distance-age*2.65,width=.20+age*.11;
          float envelope=.078*impact.w*exp(-age*1.35)*exp(-offset*offset/(width*width));
          float ring=envelope*sin(offset*8.5);
          float dent=-.115*impact.w*exp(-distance*distance/.30)*exp(-age*5.5);
          height+=ring+dent;
          float derivative=envelope*(8.5*cos(offset*8.5)-2.0*offset/(width*width)*sin(offset*8.5))
            -2.0*distance/.30*dent;
          gradient+=radial/max(.001,distance)*derivative;
        }
        if(abs(height)>=.24)gradient=vec2(0.0);
        return vec3(clamp(height,-.24,.24),gradient);
      }

      varying vec3 vWorldPosition;
      #include <fog_pars_vertex>
      void main() {
        vec3 transformed = position;
        transformed.y += sin(position.x * .34 + uTime * .72) * .075;
        transformed.y += cos(position.z * .43 - uTime * .56) * .052;
        transformed.y += sin((position.x + position.z) * .77 + uTime) * .022;
        transformed.y += waterResponse(position.xz).x;
        vec4 world = modelMatrix * vec4(transformed, 1.0);
        vWorldPosition = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec4 uImpacts[8];
      uniform float uResponseTime;
      vec3 waterResponse(vec2 p) {
        float height=0.0;vec2 gradient=vec2(0.0);
        for(int i=0;i<8;i++) {
          vec4 impact=uImpacts[i];float age=uResponseTime-impact.z;
          if(impact.w<=0.0 || age<0.0 || age>2.8)continue;
          vec2 radial=p-impact.xy;float distance=length(radial);
          float offset=distance-age*2.65,width=.20+age*.11;
          float envelope=.078*impact.w*exp(-age*1.35)*exp(-offset*offset/(width*width));
          float ring=envelope*sin(offset*8.5);
          float dent=-.115*impact.w*exp(-distance*distance/.30)*exp(-age*5.5);
          height+=ring+dent;
          float derivative=envelope*(8.5*cos(offset*8.5)-2.0*offset/(width*width)*sin(offset*8.5))
            -2.0*distance/.30*dent;
          gradient+=radial/max(.001,distance)*derivative;
        }
        if(abs(height)>=.24)gradient=vec2(0.0);
        return vec3(clamp(height,-.24,.24),gradient);
      }

      uniform sampler2D uSeabed;
      uniform float uWorldSize;
      uniform float uWaterLevel;
      uniform float uHeightBase;
      uniform float uHeightRange;
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform vec3 uHorizon;
      uniform vec3 uSky;
      uniform vec3 uSun;
      uniform vec3 uSunDirection;
      varying vec3 vWorldPosition;
      #include <fog_pars_fragment>
      void main() {
        vec2 p = vWorldPosition.xz;
        float crossSlope = cos((p.x + p.y) * .77 + uTime) * .01694;
        float hx = cos(p.x * .34 + uTime * .72) * .0255 + crossSlope;
        float hz = -sin(p.y * .43 - uTime * .56) * .02236 + crossSlope;
        // Small optical ripples add detail without increasing mesh density.
        hx += cos(p.x * 5.6 + p.y * 2.1 + uTime * 1.4) * .018;
        hz += cos(p.y * 6.2 - p.x * 1.7 - uTime * 1.2) * .016;
        vec3 responseSlope = waterResponse(p);
        hx += responseSlope.y; hz += responseSlope.z;
        vec3 normal = normalize(vec3(-hx, 1.0, -hz));
        if (!gl_FrontFacing) normal = -normal;
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
        float fresnel = .02 + .98 * pow(1.0 - facing, 5.0);
        vec2 terrainUv = p / uWorldSize + .5;
        float ground = texture2D(uSeabed, terrainUv).r * uHeightRange + uHeightBase;
        float depth = max(0.0, vWorldPosition.y - ground);
        vec3 colour = mix(uShallow, uDeep, 1.0 - exp(-depth * .38));
        vec3 reflection = reflect(-viewDirection, normal);
        vec3 skyColour = mix(uHorizon, uSky, smoothstep(.0, .75, reflection.y));
        bool aboveWater = cameraPosition.y >= uWaterLevel;
        float foam = 0.0;
        if (aboveWater) {
          colour = mix(colour, skyColour, fresnel * .78);
          vec3 halfway = normalize(viewDirection + uSunDirection);
          float sunGlint = pow(max(0.0, dot(normal, halfway)), 160.0);
          colour += uSun * sunGlint * .8;
          // The shore follows a dense height field from the movement terrain.
          float shore = (1.0-smoothstep(.08,.80,depth))*smoothstep(.0,.05,depth);
          float edge = depth*19.0-uTime*2.2+sin(p.x*2.4+p.y*1.9)*.8;
          float cells = .55+.45*sin(p.x*11.7-p.y*8.1+uTime*.7);
          foam = shore*smoothstep(.45,.91,.5+.5*sin(edge))*mix(.6,1.0,cells);
          colour = mix(colour,vec3(.83,.95,.88),foam*.75);
        } else {
          colour = mix(colour, uShallow, fresnel * .22);
        }
        float alpha = clamp(.28 + depth * .055 + fresnel * .26 + foam * .22, .28, .88);
        gl_FragColor = vec4(colour, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const water = new THREE.Mesh(geometry, material);
  water.name = 'Aelys depth-aware animated ocean';
  water.position.y = waterLevel;
  water.renderOrder = 4;
  water.userData.response = response;
  water.userData.surfaceHeight = (x,z,time) => waterLevel + sampleAelysSurface(x,z,time,response);
  return water;
}

export default createAelysWater;
