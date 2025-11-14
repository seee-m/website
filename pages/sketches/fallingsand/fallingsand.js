// Falling Sand Simulation with Image Sampling
// Based on cellular automata

// ========== CONFIGURATION VARIABLES ==========
let SIMULATION_SPEED = 1;        // Frames between physics updates (1 = every frame, higher = slower)
let SCAN_SPEED = 2;              // Frames between scan line advances (higher = slower scan)
let TOP_THRESHOLD = 0.05;        // Top 5% brightest pixels (fast/upward)
let MIDDLE_THRESHOLD = 0.30;     // Top 30% brightest pixels (slow fall)
let MAX_FALL_DISTANCE = 400;     // Maximum distance pixels can fall (in pixels)
let UPWARD_CHANCE = 0.1;         // Chance for brightest pixels to fall upward (0-1)
let START_DELAY = 2000;          // Delay before physics starts (in milliseconds)
let ENABLE_SCAN = true;          // Enable scan line reveal effect
let RECORD_VIDEO = false;        // Set to true to record video at 60fps
let RECORD_DURATION = 10;        // Duration in seconds to record
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
let imageFiles = [
  'images/castle.jpg',
  'images/space.jpg',
  'images/car.jpg',
  'images/flowers.jpg',
  'images/police.jpg',
  'images/wall.jpg',
  'images/computer.jpg',
  'images/accidental-running-picture.jpg',
  'images/bags-of-clothes.jpg',
  'images/broken-bumper.jpg',
  'images/canada-from-30-thousand-feet.jpg',
  'images/car-in-kensington.jpg',
  'images/car-scrape-and-scarf.jpg',
  'images/children-on-bouncy-castle.jpg',
  'images/closed-foot-cart-basel.jpg',
  'images/dirt-in-the-garden.jpg',
  'images/dust-sheet-on-car.jpg',
  'images/earth.jpg',
  'images/fucked-up-led-display.jpg',
  'images/garden-state-cutting-company.jpg',
  'images/heraklion-fishing-nets.jpg',
  'images/italian-restaurant.jpg',
  'images/miami-toaway-zone.jpg',
  'images/muga-silkworms.jpg',
  'images/newports-and-the-wonberbread-car.jpg',
  'images/nonononononono.jpg',
  'images/particle-research.jpg',
  'images/pontiac-with-attitude.jpg',
  'images/rocks-containing-aluminium.jpg',
  'images/shrine-to-mary-in-naples.jpg',
  'images/smashed-car-in-doral-miami.jpg',
  'images/tony-hawks-pro-grouter.jpg',
  'images/university-avenue-tulips.jpg',
  'images/us-navy-outfit.jpg',
  'images/uv-cactus-queens-park.jpg',
  'images/uv-leaves-queens-park.jpg',
  'images/window-box.jpg'
];

// Video recording variables
let capturer;
let isRecording = false;
let recordingFrames = 0;
let maxRecordingFrames = 0;

function preload() {
  // Pick a random image from the images folder
  let randomIndex = floor(random(imageFiles.length));
  let selectedImage = imageFiles[randomIndex];

  console.log('Loading image:', selectedImage);
  img = loadImage(selectedImage,
    () => console.log('Image loaded successfully'),
    () => {
      console.log('Failed to load', selectedImage, '- falling back to testimage.jpg');
      img = loadImage('testimage.jpg');
    }
  );
}

function setup() {
  createCanvas(800, 600); // Canvas 2D is more stable for this use case
  frameRate(60); // Lock to 60fps for smooth recording

  // Initialize video recorder if enabled
  if (RECORD_VIDEO && typeof CCapture !== 'undefined') {
    capturer = new CCapture({
      format: 'webm',
      framerate: 60,
      quality: 100,
      name: 'falling_sand_' + Date.now(),
      verbose: true
    });
    maxRecordingFrames = RECORD_DURATION * 60; // 60fps
    console.log('Video recording enabled. Recording will start automatically.');
  }

  // Calculate grid dimensions first
  cols = floor(width / cellSize);
  rows = floor(height / cellSize);

  // 1. Resize image to grid size
  img.resize(cols, rows);
  img.loadPixels();

  // 2. Apply 4-bit color Bayer dithering
  applyBayerDither();

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
        revealed: false
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
  background(20);

  // Start recording when physics starts
  if (!physicsStarted && millis() - startTime >= 0) {
    physicsStarted = true;

    // Start video capture when physics begins
    if (RECORD_VIDEO && capturer && !isRecording) {
      capturer.start();
      isRecording = true;
      console.log('Recording started...');
    }
  }

  // Progress scan line - slower than physics so pixels can outpace it
  if (physicsStarted && frameCounter % SCAN_SPEED === 0) {
    if (scanLine < rows) {
      scanLine += 1; // Advance one row
    }
  }

  // Reveal pixels up to current scan line (do this every frame)
  if (physicsStarted) {
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
              gridBuffer[i][j] = particle;
              fallDistancesBuffer[i][j] = currentFallDistance;
            }
          } else {
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

  // Render - show revealed pixels OR falling bright pixels (even beyond scan line)
  noStroke();
  let pixelDrawSize = cellSize * 0.75; // 75% size to create border
  let offset = cellSize * 0.125; // Center the smaller pixel

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

  // Handle video recording
  if (isRecording && capturer) {
    capturer.capture(document.querySelector('canvas'));
    recordingFrames++;

    // Stop recording after specified duration
    if (recordingFrames >= maxRecordingFrames) {
      capturer.stop();
      capturer.save();
      isRecording = false;
      console.log('Recording complete! Saving video...');
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

// Key press to manually start/stop recording
function keyPressed() {
  if (key === 'r' || key === 'R') {
    if (!isRecording && capturer) {
      // Start recording
      if (!capturer) {
        capturer = new CCapture({
          format: 'webm',
          framerate: 60,
          quality: 100,
          name: 'falling_sand_' + Date.now(),
          verbose: true
        });
      }
      capturer.start();
      isRecording = true;
      recordingFrames = 0;
      maxRecordingFrames = RECORD_DURATION * 60;
      console.log('Recording started (press R again to stop)');
    } else if (isRecording) {
      // Stop recording
      capturer.stop();
      capturer.save();
      isRecording = false;
      console.log('Recording stopped! Saving video...');
    }
  }
}

