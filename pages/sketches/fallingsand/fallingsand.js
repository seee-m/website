// Falling Sand Simulation with Image Sampling
// Based on cellular automata

// ========== CONFIGURATION VARIABLES ==========
// Load from localStorage if available, otherwise use defaults
let SIMULATION_SPEED = (typeof localStorage !== 'undefined' && localStorage.getItem('simSpeed')) ? parseInt(localStorage.getItem('simSpeed')) : 1;
let SCAN_SPEED = (typeof localStorage !== 'undefined' && localStorage.getItem('scanSpeed')) ? parseInt(localStorage.getItem('scanSpeed')) : 2;
let TOP_THRESHOLD = (typeof localStorage !== 'undefined' && localStorage.getItem('topThreshold')) ? parseFloat(localStorage.getItem('topThreshold')) : 0.05;
let MIDDLE_THRESHOLD = (typeof localStorage !== 'undefined' && localStorage.getItem('middleThreshold')) ? parseFloat(localStorage.getItem('middleThreshold')) : 0.30;
let MAX_FALL_DISTANCE = (typeof localStorage !== 'undefined' && localStorage.getItem('maxFall')) ? parseInt(localStorage.getItem('maxFall')) : 1200;
let UPWARD_CHANCE = (typeof localStorage !== 'undefined' && localStorage.getItem('upwardChance')) ? parseFloat(localStorage.getItem('upwardChance')) : 0.1;
let ENABLE_SCAN = (typeof localStorage !== 'undefined' && localStorage.getItem('enableScan')) ? localStorage.getItem('enableScan') !== 'false' : true;
let RESOLUTION_SCALE = (typeof localStorage !== 'undefined' && localStorage.getItem('resolutionScale')) ? parseInt(localStorage.getItem('resolutionScale')) : 3;
let PIXEL_BORDER_SIZE = (typeof localStorage !== 'undefined' && localStorage.getItem('pixelBorder')) ? parseFloat(localStorage.getItem('pixelBorder')) : 0.75;
let UPLOADED_IMAGE_DATA = (typeof localStorage !== 'undefined' && localStorage.getItem('uploadedImage')) || 'start.jpg';
// =============================================

let grid;
let gridBuffer; // Swap buffer for physics updates
let cols, rows;
let cellSize = 4;
let img;
let particles = [];
let startTime;
let physicsStarted = false;
let fallDistances = [];
let fallDistancesBuffer = [];
let scanLine = 0;
let frameCounter = 0;

// Cache for replay
let simulationCache = [];
let isReplaying = false;
let replayFrame = 0;
let isCaching = true;
let cacheReady = false;

function preload() {
  // Use uploaded image if available, otherwise use a default
  if (UPLOADED_IMAGE_DATA) {
    console.log('Loading uploaded image');
    img = loadImage(UPLOADED_IMAGE_DATA,
      () => console.log('Uploaded image loaded successfully'),
      () => {
        console.log('Failed to load uploaded image');
        img = createDefaultImage();
      }
    );
  } else {
    console.log('No uploaded image, creating default');
    img = createDefaultImage();
  }
}

function createDefaultImage() {
  // Create a simple gradient image as default
  let defaultImg = createImage(400, 300);
  defaultImg.loadPixels();
  for (let y = 0; y < defaultImg.height; y++) {
    for (let x = 0; x < defaultImg.width; x++) {
      let index = (y * defaultImg.width + x) * 4;
      let brightness = map(y, 0, defaultImg.height, 255, 0);
      defaultImg.pixels[index] = brightness;
      defaultImg.pixels[index + 1] = brightness;
      defaultImg.pixels[index + 2] = brightness;
      defaultImg.pixels[index + 3] = 255;
    }
  }
  defaultImg.updatePixels();
  return defaultImg;
}

function setup() {
  // Calculate target dimensions based on image aspect ratio
  // Max 2400 on longest side, then apply resolution scale
  let maxDimension = 2400 / pow(2, RESOLUTION_SCALE - 1);
  let imgAspect = img.width / img.height;

  let targetWidth, targetHeight;
  if (img.width > img.height) {
    targetWidth = maxDimension;
    targetHeight = maxDimension / imgAspect;
  } else {
    targetHeight = maxDimension;
    targetWidth = maxDimension * imgAspect;
  }

  // Calculate grid dimensions (this is the FINAL size we need)
  cols = floor(targetWidth / cellSize);
  rows = floor(targetHeight / cellSize);

  // 1. Resize image to EXACT grid size (only once, to final size)
  img.resize(cols, rows);
  img.loadPixels();

  // 2. Apply 4-bit color Bayer dithering AFTER resizing
  applyBayerDither();

  // Create canvas based on grid dimensions
  createCanvas(cols * cellSize, rows * cellSize);
  frameRate(60);

  // Initialize grid and fall distances tracker with buffers
  grid = make2DArray(cols, rows);
  gridBuffer = make2DArray(cols, rows);
  fallDistances = make2DArray(cols, rows);
  fallDistancesBuffer = make2DArray(cols, rows);

  // 3. Sample the dithered image - one pixel per grid cell
  let brightnesses = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      // Sample directly from the resized image (1:1 mapping)
      let index = (j * img.width + i) * 4;
      let r = img.pixels[index];
      let g = img.pixels[index + 1];
      let b = img.pixels[index + 2];

      // Calculate brightness (0-255)
      let brightness = (r + g + b) / 3;
      brightnesses.push({brightness: brightness, i: i, j: j, r: r, g: g, b: b});
    }
  }

  // Find brightness thresholds using config variables
  let sortedBrightness = [...brightnesses].map(b => b.brightness).sort((a, b) => b - a);
  let threshold95 = sortedBrightness[floor(sortedBrightness.length * TOP_THRESHOLD)];
  let threshold90 = sortedBrightness[floor(sortedBrightness.length * MIDDLE_THRESHOLD)];

  // Create all particles from the image - ALWAYS create all pixels
  for (let item of brightnesses) {
    let fallCategory = 0; // 0 = no fall, 1 = slow fall, 2 = fast fall, 3 = upward fall
    let canFall = false;

    if (item.brightness >= threshold95) {
      canFall = true;
      // Top threshold: some fall upward, rest fall fast
      if (random(1) < UPWARD_CHANCE) {
        fallCategory = 3; // upward
      } else {
        fallCategory = 2; // fast
      }
    } else if (item.brightness >= threshold90) {
      canFall = true;
      fallCategory = 1; // slow fall (middle threshold)
    }

    // Always create particle for every pixel
    if (item.r !== undefined && item.g !== undefined && item.b !== undefined) {
      // Pack RGB into single integer: 0xRRGGBB (saves memory and improves cache)
      let packedColor = (item.r << 16) | (item.g << 8) | item.b;

      grid[item.i][item.j] = {
        density: map(item.brightness, 0, 255, 1, 0),
        color: packedColor,
        brightness: item.brightness,
        canFall: canFall,
        fallCategory: fallCategory,
        revealed: false,
        dormant: false,  // Track if pixel has stopped moving
        dormantFrames: 0 // Frames since last movement
      };
      fallDistances[item.i][item.j] = 0;
    }
  }

  // Start the timer
  startTime = millis();
}

function applyBayerDither() {
  // 4x4 Bayer matrix
  let bayerMatrix = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];

  // 4-bit color = 16 levels per channel (0-15)
  let levels = 16;

  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      let index = (y * img.width + x) * 4;

      // Get Bayer threshold for this position
      let bayerValue = bayerMatrix[y % 4][x % 4];
      let threshold = (bayerValue / 16.0) - 0.5;

      // Process each color channel
      for (let c = 0; c < 3; c++) {
        let oldPixel = img.pixels[index + c];
        let normalized = oldPixel / 255.0;

        // Add dithering threshold
        normalized += threshold / levels;

        // Quantize to 4-bit (16 levels: 0-15)
        let newPixel = floor(normalized * (levels - 1) + 0.5);
        newPixel = constrain(newPixel, 0, levels - 1);

        // Scale back to 8-bit
        // Level 0 = 0 (black), Level 15 = 255 (white)
        if (newPixel === 0) {
          img.pixels[index + c] = 0; // Ensure darkest is pure black
        } else {
          img.pixels[index + c] = floor((newPixel / (levels - 1)) * 255);
        }
      }
    }
  }
  img.updatePixels();
}

function draw() {
  background(0);

  // Handle replay mode
  if (isReplaying) {
    if (replayFrame < simulationCache.length) {
      renderFromCache(simulationCache[replayFrame]);
      replayFrame++;
    } else {
      // Loop replay
      replayFrame = 0;
    }
    return;
  }

  // Start physics immediately
  if (!physicsStarted && millis() - startTime >= 0) {
    physicsStarted = true;

    // If scan is disabled, reveal all pixels at once
    if (!ENABLE_SCAN) {
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if (grid[i][j] !== null) {
            grid[i][j].revealed = true;
            // Kick off falling for bright pixels by setting initial fall distance
            if (grid[i][j].canFall && fallDistances[i][j] === 0) {
              fallDistances[i][j] = 1;
            }
          }
        }
      }
      scanLine = rows; // Set scan line to end
    }
  }

  // Progress scan line - slower than physics so pixels can outpace it
  if (physicsStarted && ENABLE_SCAN && frameCounter % SCAN_SPEED === 0) {
    if (scanLine < rows) {
      scanLine += 1; // Advance one row
    }
  }

  // Reveal pixels up to current scan line (do this every frame, only if scan enabled)
  if (physicsStarted && ENABLE_SCAN) {
    let maxScanRow = min(floor(scanLine), rows);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < maxScanRow; j++) {
        if (grid[i][j] !== null && !grid[i][j].revealed) {
          grid[i][j].revealed = true;

          // Kick off falling for bright pixels by setting initial fall distance
          if (grid[i][j].canFall && fallDistances[i][j] === 0) {
            fallDistances[i][j] = 1; // Start with tiny distance to trigger falling
          }
        }
      }
    }
  }

  // Debug text removed for performance (was checking 60,000 cells per frame)

  // Update physics - process from bottom to top for downward, top to bottom for upward
  // Use frame counter to slow down simulation
  frameCounter++;
  if (physicsStarted && frameCounter % SIMULATION_SPEED === 0) {
    // Clear buffer arrays instead of creating new ones
    for (let i = 0; i < cols; i++) {
      gridBuffer[i].fill(null);
      fallDistancesBuffer[i].fill(0);
    }

    // First, copy all unrevealed pixels and non-falling pixels to preserve them
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        let particle = grid[i][j];
        if (particle !== null) {
          if (!particle.revealed || !particle.canFall) {
            // Keep unrevealed or non-falling pixels in place
            gridBuffer[i][j] = particle;
            fallDistancesBuffer[i][j] = fallDistances[i][j];
          }
        }
      }
    }

    // Process falling particles
    for (let i = 0; i < cols; i++) {
      for (let j = rows - 1; j >= 0; j--) {
        let particle = grid[i][j];

        // Skip dormant particles (performance optimization)
        if (particle !== null && particle.dormant) {
          gridBuffer[i][j] = particle;
          fallDistancesBuffer[i][j] = fallDistances[i][j];
          continue;
        }

        // Allow bright pixels to fall even if not revealed (so they can outpace scan)
        if (particle !== null && particle.canFall && (particle.revealed || fallDistances[i][j] > 0)) {
          let currentFallDistance = fallDistances[i][j];
          let fell = false;

          // Only allow falling if this particle can fall and hasn't exceeded max distance
          if (particle.canFall && currentFallDistance < MAX_FALL_DISTANCE) {

            // Handle upward falling particles
            if (particle.fallCategory === 3) {
              let above = j - 1;

              // Try to fall straight up into empty space
              if (above >= 0 && grid[i][above] === null) {
                gridBuffer[i][above] = particle;
                fallDistancesBuffer[i][above] = currentFallDistance + cellSize;
                fell = true;
              }
              // Try to fall upward into darker pixel (revealed or unrevealed)
              else if (above >= 0 && grid[i][above] !== null) {
                let aboveParticle = grid[i][above];
                if (particle.brightness > aboveParticle.brightness) {
                  gridBuffer[i][above] = particle;
                  fallDistancesBuffer[i][above] = currentFallDistance + cellSize;
                  if (gridBuffer[i][j] === null) {
                    gridBuffer[i][j] = aboveParticle;
                    fallDistancesBuffer[i][j] = fallDistances[i][above];
                  }
                  fell = true;
                }
              }

              // Try diagonal upward fall
              if (!fell && above >= 0) {
                let dir = random([-1, 1]);
                let diag1 = i + dir;
                let diag2 = i - dir;

                if (diag1 >= 0 && diag1 < cols && grid[diag1][above] === null) {
                  gridBuffer[diag1][above] = particle;
                  fallDistancesBuffer[diag1][above] = currentFallDistance + cellSize;
                  fell = true;
                } else if (diag2 >= 0 && diag2 < cols && grid[diag2][above] === null) {
                  gridBuffer[diag2][above] = particle;
                  fallDistancesBuffer[diag2][above] = currentFallDistance + cellSize;
                  fell = true;
                }
              }
            }
            // Handle downward falling particles (categories 1 and 2)
            else {
              let below = j + 1;

              if (below < rows && currentFallDistance + cellSize <= MAX_FALL_DISTANCE) {
                // Check all three positions: straight down, diagonal left, diagonal right
                let positions = [
                  { col: i, row: below, diag: false },           // straight down
                  { col: i - 1, row: below, diag: true },        // diagonal left
                  { col: i + 1, row: below, diag: true }         // diagonal right
                ];

                // Find the darkest valid position
                let darkestPos = null;
                let darkestBrightness = particle.brightness; // Must be darker than current particle

                for (let pos of positions) {
                  if (pos.col >= 0 && pos.col < cols) {
                    let targetParticle = grid[pos.col][pos.row];

                    if (targetParticle === null) {
                      // Empty space is considered darkest (brightness 0)
                      if (0 < darkestBrightness || darkestPos === null) {
                        darkestPos = pos;
                        darkestBrightness = 0;
                      }
                    } else if (targetParticle.brightness < darkestBrightness) {
                      // Found a darker particle
                      darkestPos = pos;
                      darkestBrightness = targetParticle.brightness;
                    }
                  }
                }

                // Fall to the darkest position if found
                if (darkestPos !== null && particle.brightness > darkestBrightness) {
                  let targetParticle = grid[darkestPos.col][darkestPos.row];

                  gridBuffer[darkestPos.col][darkestPos.row] = particle;
                  fallDistancesBuffer[darkestPos.col][darkestPos.row] = currentFallDistance + cellSize;
                  fell = true;

                  // If we swapped with another particle, place it in our old position
                  if (targetParticle !== null && gridBuffer[i][j] === null) {
                    gridBuffer[i][j] = targetParticle;
                    fallDistancesBuffer[i][j] = fallDistances[darkestPos.col][darkestPos.row];
                  }
                }
              }
            }
          }

          // Stay in place if couldn't fall or reached max distance
          if (!fell) {
            // Only place if nothing already there
            if (gridBuffer[i][j] === null) {
              // Increment dormant counter if particle didn't move
              particle.dormantFrames++;

              // Mark as dormant after 30 frames without movement
              if (particle.dormantFrames > 30) {
                particle.dormant = true;
              }

              gridBuffer[i][j] = particle;
              fallDistancesBuffer[i][j] = currentFallDistance;
            }
          } else {
            // Reset dormant counter if particle moved
            particle.dormantFrames = 0;
            particle.dormant = false;

            // Particle fell, clear the original position if nothing was placed there
            if (gridBuffer[i][j] === particle) {
              // This shouldn't happen, but just in case
            }
          }
        }
      }
    }

    // Swap buffers instead of creating new arrays
    let tempGrid = grid;
    grid = gridBuffer;
    gridBuffer = tempGrid;

    let tempFall = fallDistances;
    fallDistances = fallDistancesBuffer;
    fallDistancesBuffer = tempFall;
  }

  // Cache current frame if caching is enabled
  if (isCaching && physicsStarted) {
    cacheCurrentFrame();
  }

  // Render - show revealed pixels OR falling bright pixels (even beyond scan line)
  noStroke();
  let pixelDrawSize = cellSize * PIXEL_BORDER_SIZE;
  let offset = cellSize * (1 - PIXEL_BORDER_SIZE) / 2; // Center the smaller pixel

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      let particle = grid[i][j];
      if (particle !== null) {
        // Show if revealed, OR if it's a falling bright pixel (even unrevealed)
        let shouldShow = particle.revealed || (particle.canFall && fallDistances[i][j] > 0);

        if (shouldShow) {
          // Unpack RGB from integer: 0xRRGGBB
          let c = particle.color;
          let r = (c >> 16) & 0xFF;
          let g = (c >> 8) & 0xFF;
          let b = c & 0xFF;
          fill(r, g, b);
          rect(i * cellSize + offset, j * cellSize + offset, pixelDrawSize, pixelDrawSize);
        }
      }
    }
  }

  // Enable replay button when cache has content
  if (!cacheReady && simulationCache.length > 60) {
    cacheReady = true;
    if (typeof enableReplayButton === 'function') {
      enableReplayButton();
    }
  }
}

function make2DArray(cols, rows) {
  let arr = new Array(cols);
  for (let i = 0; i < cols; i++) {
    arr[i] = new Array(rows).fill(null);
  }
  return arr;
}

// Export current frame as high resolution PNG (4x scale, nearest neighbor)
function exportHighResImage() {
  // Create a high-res graphics buffer (4x scale)
  let scale = 4;
  let exportWidth = cols * cellSize * scale;
  let exportHeight = rows * cellSize * scale;

  let pg = createGraphics(exportWidth, exportHeight);
  pg.noSmooth(); // Nearest neighbor scaling
  pg.noStroke();

  let pixelDrawSize = cellSize * PIXEL_BORDER_SIZE * scale;
  let offset = cellSize * (1 - PIXEL_BORDER_SIZE) / 2 * scale;
  let scaledCellSize = cellSize * scale;

  pg.background(0);

  // Render current state at 4x resolution
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      let particle = grid[i][j];
      if (particle !== null) {
        let shouldShow = particle.revealed || (particle.canFall && fallDistances[i][j] > 0);

        if (shouldShow) {
          let c = particle.color;
          let r = (c >> 16) & 0xFF;
          let g = (c >> 8) & 0xFF;
          let b = c & 0xFF;
          pg.fill(r, g, b);
          pg.rect(i * scaledCellSize + offset, j * scaledCellSize + offset, pixelDrawSize, pixelDrawSize);
        }
      }
    }
  }

  // Save as PNG
  save(pg, 'falling_sand_' + Date.now() + '.png');
  console.log('Image exported at ' + exportWidth + 'x' + exportHeight);
}

// Cache current frame for replay
function cacheCurrentFrame() {
  let frameData = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      let particle = grid[i][j];
      if (particle !== null) {
        let shouldShow = particle.revealed || (particle.canFall && fallDistances[i][j] > 0);
        if (shouldShow) {
          frameData.push({
            i: i,
            j: j,
            color: particle.color
          });
        }
      }
    }
  }
  simulationCache.push(frameData);
}

// Render from cached frame data
function renderFromCache(frameData) {
  background(0);
  noStroke();
  let pixelDrawSize = cellSize * PIXEL_BORDER_SIZE;
  let offset = cellSize * (1 - PIXEL_BORDER_SIZE) / 2;

  for (let pixel of frameData) {
    let c = pixel.color;
    let r = (c >> 16) & 0xFF;
    let g = (c >> 8) & 0xFF;
    let b = c & 0xFF;
    fill(r, g, b);
    rect(pixel.i * cellSize + offset, pixel.j * cellSize + offset, pixelDrawSize, pixelDrawSize);
  }
}

// Toggle replay mode
function toggleReplay() {
  if (simulationCache.length === 0) {
    console.log('No cached simulation to replay');
    return;
  }
  isReplaying = !isReplaying;
  if (isReplaying) {
    replayFrame = 0;
    isCaching = false;
    console.log('Replay started');
  } else {
    isCaching = true;
    console.log('Replay stopped');
  }
}

// Reset simulation
function resetSimulation() {
  simulationCache = [];
  isReplaying = false;
  replayFrame = 0;
  isCaching = true;
  location.reload();
}

