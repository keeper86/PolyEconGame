const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

function idx(x, y, w) {
  return y * w + x;
}

function isPinkish(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;

  return r > 200 && g < 200 && sat > 0.08;
}

// ---- Morphological erosion ----

function erode(alpha, w, h) {
  const out = new Uint8Array(alpha.length);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {

      let min = 255;

      for (let ky=-1; ky<=1; ky++){
        for (let kx=-1; kx<=1; kx++){
          const v = alpha[idx(x+kx,y+ky,w)];
          if (v < min) min = v;
        }
      }

      out[idx(x,y,w)] = min;
    }
  }

  return out;
}

// ---- Gaussian blur (5x5) ----

function blur(alpha, w, h) {

  const kernel = [
    1,4,6,4,1,
    4,16,24,16,4,
    6,24,36,24,6,
    4,16,24,16,4,
    1,4,6,4,1
  ];

  const norm = 256;
  const out = new Uint8Array(alpha.length);

  for (let y=2;y<h-2;y++){
    for (let x=2;x<w-2;x++){

      let sum = 0;
      let k = 0;

      for (let ky=-2;ky<=2;ky++){
        for (let kx=-2;kx<=2;kx++){
          const v = alpha[idx(x+kx,y+ky,w)];
          sum += v * kernel[k++];
        }
      }

      out[idx(x,y,w)] = sum / norm;
    }
  }

  return out;
}

// smoothstep alpha rebuild
function smoothAlpha(alpha){

  for (let i=0;i<alpha.length;i++){

    let a = alpha[i] / 255;

    a = a*a*(3-2*a); // smoothstep

    alpha[i] = Math.max(0,Math.min(255,a*255));
  }

  return alpha;
}

async function run(input, outputDir){

  const {data,info} = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({resolveWithObject:true});

  const {width,height,channels} = info;

  const visited = new Uint8Array(width*height);
  const queue = [];

  function push(x,y){
    const i = idx(x,y,width);
    if(visited[i]) return;
    visited[i]=1;
    queue.push([x,y]);
  }

  // start from borders
  for(let x=0;x<width;x++){
    push(x,0);
    push(x,height-1);
  }

  for(let y=0;y<height;y++){
    push(0,y);
    push(width-1,y);
  }

  // flood remove background
  while(queue.length){

    const [x,y] = queue.shift();
    const i = idx(x,y,width);
    const p = i*channels;

    const r=data[p], g=data[p+1], b=data[p+2];

    if(!isPinkish(r,g,b)) continue;

    data[p+3]=0;

    const n=[[1,0],[-1,0],[0,1],[0,-1]];

    for(const [dx,dy] of n){
      const nx=x+dx, ny=y+dy;
      if(nx>=0 && ny>=0 && nx<width && ny<height)
        push(nx,ny);
    }
  }

  // ---- HALO CLEAN ----

  for(let y=1;y<height-1;y++){
    for(let x=1;x<width-1;x++){

      const i=idx(x,y,width);
      const p=i*channels;

      if(data[p+3]==0) continue;

      const neighbors=[
        idx(x+1,y,width),
        idx(x-1,y,width),
        idx(x,y+1,width),
        idx(x,y-1,width)
      ];

      let nearTransparent=false;

      for(const ni of neighbors){
        if(data[ni*channels+3]==0){
          nearTransparent=true;
          break;
        }
      }

      if(nearTransparent){

        const r=data[p];
        const g=data[p+1];
        const b=data[p+2];

        const gray=(r+g+b)/3;

        data[p]=gray;
        data[p+1]=gray;
        data[p+2]=gray;
      }
    }
  }

  // ---- ALPHA PROCESSING ----

  let alpha = new Uint8Array(width*height);

  for(let i=0;i<alpha.length;i++)
    alpha[i]=data[i*channels+3];

  alpha = erode(alpha,width,height);
  alpha = blur(alpha,width,height);
  alpha = smoothAlpha(alpha);

  for(let i=0;i<alpha.length;i++)
    data[i*channels+3]=alpha[i];

  // ---- COMPONENT DETECTION ----

  const seen = new Uint8Array(width*height);
  const components=[];

  function bfs(sx,sy){

    const q=[[sx,sy]];
    seen[idx(sx,sy,width)]=1;

    let minX=sx,maxX=sx,minY=sy,maxY=sy;

    while(q.length){

      const [x,y]=q.shift();

      minX=Math.min(minX,x);
      maxX=Math.max(maxX,x);
      minY=Math.min(minY,y);
      maxY=Math.max(maxY,y);

      const n=[[1,0],[-1,0],[0,1],[0,-1]];

      for(const [dx,dy] of n){

        const nx=x+dx, ny=y+dy;

        if(nx<0||ny<0||nx>=width||ny>=height) continue;

        const ni=idx(nx,ny,width);

        if(seen[ni]) continue;

        if(data[ni*channels+3]==0) continue;

        seen[ni]=1;
        q.push([nx,ny]);
      }
    }

    return {minX,maxX,minY,maxY};
  }

  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++){

      const i=idx(x,y,width);

      if(seen[i]) continue;
      if(data[i*channels+3]==0) continue;

      components.push(bfs(x,y));
    }
  }

  console.log("Detected components:",components.length);

  // ---- EXPORT ----

for (let i = 0; i < components.length; i++) {

  const c = components[i];

  const w = c.maxX - c.minX + 1;
  const h = c.maxY - c.minY + 1;

  const baseName = path.basename(input, path.extname(input));
  const suffix = components.length > 1 ? `_${i + 1}` : "";

  const cropped = sharp(data, {
    raw: { width, height, channels }
  }).extract({
    left: c.minX,
    top: c.minY,
    width: w,
    height: h
  });

  // PNG (lossless master)
  await cropped
    .clone()
    .png()
    .toFile(path.join(outputDir, `${baseName}${suffix}.png`));

  // WebP (optimized delivery)
  await cropped
    .clone()
    .webp({
      quality: 90,
      alphaQuality: 100,
      effort: 6
    })
    .toFile(path.join(outputDir, `${baseName}${suffix}.webp`));
}

console.log(`  -> ${components.length} asset(s) written.`);

  
}

async function main() {
  const inputDir = process.argv[2] || ".";
  const outputDir = process.argv[3] || inputDir;

  const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp"]);

  const files = fs.readdirSync(inputDir)
    .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .map(f => path.join(inputDir, f));

  if (files.length === 0) {
    console.error("No image files found in:", inputDir);
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`Found ${files.length} image(s) in ${inputDir}:`);
  files.forEach(f => console.log(" ", path.basename(f)));
  console.log();

  for (const file of files) {
    console.log(`Processing: ${path.basename(file)}`);
    try {
      await run(file, outputDir);
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
    }
  }

  console.log("\nDone.");
}

main();

