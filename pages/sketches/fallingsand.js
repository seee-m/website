// ========== CONFIGURATION VARIABLES ==========
let RESOLUTION = parseInt(localStorage.getItem('resolution')) || 800;
let SIMULATION_SPEED_RAW = parseInt(localStorage.getItem('simSpeed')) || 6;
let SIMULATION_SPEED = 7 - SIMULATION_SPEED_RAW; // Reverse: 1=slowest(6), 6=fastest(1)
let SCAN_SPEED_RAW = parseInt(localStorage.getItem('scanSpeed')) || 6;
let SCAN_SPEED = 7 - SCAN_SPEED_RAW; // Reverse: 1=slowest(6), 6=fastest(1)
let PIXEL_BORDER_SIZE = parseFloat(localStorage.getItem('pixelBorder')) || 0.75;
let TOP_THRESHOLD = parseFloat(localStorage.getItem('topThreshold')) || 0.05;
let MIDDLE_THRESHOLD = parseFloat(localStorage.getItem('middleThreshold')) || 0.10;
let MAX_FALL_DISTANCE = parseInt(localStorage.getItem('maxFall')) || 1200;
let UPWARD_CHANCE = parseFloat(localStorage.getItem('upwardChance')) || 0.1;
let ENABLE_SCAN = localStorage.getItem('enableScan') !== 'false';
let UPLOADED_IMAGE_DATA = localStorage.getItem('uploadedImage') || null;

let grid;
let gridBuffer;
let cols, rows;
let cellSize = 4;
let img;
let startTime;
let physicsStarted = false;
let fallDistances = [];
let fallDistancesBuffer = [];
let scanLine = 0;
let frameCounter = 0;
let canvas;
let resizeTimeout = null;

// Performance optimizations
let scaleFactor, pixelDrawSize, offset;
let lastScanRow = 0;
let needsRedraw = true;

// Helper function to calculate optimal canvas size (SQUARE)
function calculateCanvasSize() {
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        const availableWidth = window.innerWidth - 32;
        const availableHeight = window.innerHeight - 120;
        return Math.min(availableWidth, availableHeight);
    } else {
        const availableHeight = window.innerHeight - 190;
        const availableWidth = window.innerWidth - 120;
        return Math.min(availableHeight, availableWidth);
    }
}

// SQUARE CROP function - crops image to square from center
function cropToSquare(img) {
    let size = Math.min(img.width, img.height);
    let x = (img.width - size) / 2;
    let y = (img.height - size) / 2;

    return img.get(x, y, size, size);
}

function preload() {
    if (UPLOADED_IMAGE_DATA && UPLOADED_IMAGE_DATA.trim() !== '') {
        console.log('Loading uploaded image');
        img = loadImage(UPLOADED_IMAGE_DATA,
            () => console.log('Uploaded image loaded successfully'),
            () => {
                console.log('Failed to load uploaded image, using default');
                img = loadImage('start.jpg');
            }
        );
    } else {
        console.log('No uploaded image, loading default start.jpg');
        img = loadImage('start.jpg');
    }
}

function setup() {
    // CROP TO SQUARE FIRST
    img = cropToSquare(img);

    // Use RESOLUTION directly (400, 600, 800, 1000, 1200)
    let maxDimension = RESOLUTION;

    // Since image is square, both dimensions are the same
    cols = floor(maxDimension / cellSize);
    rows = cols; // Square grid

    // Apply dithering FIRST on square image
    img.loadPixels();
    applyBayerDither();

    // THEN resize to final grid size
    img.resize(cols, rows);
    img.loadPixels();

    const canvasSize = calculateCanvasSize();
    canvas = createCanvas(canvasSize, canvasSize);
    canvas.parent('canvas-wrapper');
    frameRate(60);

    // Cache drawing calculations
    scaleFactor = width / cols;
    pixelDrawSize = scaleFactor * PIXEL_BORDER_SIZE;
    offset = scaleFactor * (1 - PIXEL_BORDER_SIZE) / 2;

    grid = make2DArray(cols, rows);
    gridBuffer = make2DArray(cols, rows);
    fallDistances = make2DArray(cols, rows);
    fallDistancesBuffer = make2DArray(cols, rows);

    let brightnesses = [];
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            let index = (j * img.width + i) * 4;
            let r = img.pixels[index];
            let g = img.pixels[index + 1];
            let b = img.pixels[index + 2];

            let brightness = (r + g + b) / 3;
            brightnesses.push({brightness: brightness, i: i, j: j, r: r, g: g, b: b});
        }
    }

    let sortedBrightness = [...brightnesses].map(b => b.brightness).sort((a, b) => b - a);
    let threshold95 = sortedBrightness[floor(sortedBrightness.length * TOP_THRESHOLD)];
    let threshold90 = sortedBrightness[floor(sortedBrightness.length * MIDDLE_THRESHOLD)];

    for (let item of brightnesses) {
        let fallCategory = 0;
        let canFall = false;

        if (item.brightness >= threshold95) {
            canFall = true;
            if (random(1) < UPWARD_CHANCE) {
                fallCategory = 3;
            } else {
                fallCategory = 2;
            }
        } else if (item.brightness >= threshold90) {
            canFall = true;
            fallCategory = 1;
        }

        if (item.r !== undefined && item.g !== undefined && item.b !== undefined) {
            let packedColor = (item.r << 16) | (item.g << 8) | item.b;

            grid[item.i][item.j] = {
                density: map(item.brightness, 0, 255, 1, 0),
                color: packedColor,
                brightness: item.brightness,
                canFall: canFall,
                fallCategory: fallCategory,
                revealed: false,
                dormant: false,
                dormantFrames: 0
            };
            fallDistances[item.i][item.j] = 0;
        }
    }

    startTime = millis();
}

function applyBayerDither() {
    let bayerMatrix = [
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5]
    ];

    let levels = 16;

    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            let index = (y * img.width + x) * 4;

            let bayerValue = bayerMatrix[y % 4][x % 4];
            let threshold = (bayerValue / 16.0) - 0.5;

            for (let c = 0; c < 3; c++) {
                let oldPixel = img.pixels[index + c];
                let normalized = oldPixel / 255.0;

                normalized += threshold / levels;

                let newPixel = floor(normalized * (levels - 1) + 0.5);
                newPixel = constrain(newPixel, 0, levels - 1);

                if (newPixel === 0) {
                    img.pixels[index + c] = 0;
                } else {
                    img.pixels[index + c] = floor((newPixel / (levels - 1)) * 255);
                }
            }
        }
    }
    img.updatePixels();
}

function draw() {
    if (!physicsStarted && millis() - startTime >= 0) {
        physicsStarted = true;
        needsRedraw = true;

        if (!ENABLE_SCAN) {
            for (let i = 0; i < cols; i++) {
                for (let j = 0; j < rows; j++) {
                    if (grid[i][j] !== null) {
                        grid[i][j].revealed = true;
                        if (grid[i][j].canFall && fallDistances[i][j] === 0) {
                            fallDistances[i][j] = 1;
                        }
                    }
                }
            }
            scanLine = rows;
            lastScanRow = rows;
        }
    }

    // Optimized scan reveal - only process new rows
    if (physicsStarted && ENABLE_SCAN && frameCounter % SCAN_SPEED === 0) {
        if (scanLine < rows) {
            scanLine += 1;
            needsRedraw = true;
        }
    }

    if (physicsStarted && ENABLE_SCAN && lastScanRow < scanLine) {
        let maxScanRow = min(floor(scanLine), rows);
        // Only process rows that haven't been scanned yet
        for (let i = 0; i < cols; i++) {
            for (let j = lastScanRow; j < maxScanRow; j++) {
                if (grid[i][j] !== null && !grid[i][j].revealed) {
                    grid[i][j].revealed = true;

                    if (grid[i][j].canFall && fallDistances[i][j] === 0) {
                        fallDistances[i][j] = 1;
                    }
                }
            }
        }
        lastScanRow = maxScanRow;
    }

    frameCounter++;
    if (physicsStarted && frameCounter % SIMULATION_SPEED === 0) {
        needsRedraw = true;

        // Only clear changed cells instead of entire arrays
        for (let i = 0; i < cols; i++) {
            gridBuffer[i].fill(null);
            fallDistancesBuffer[i].fill(0);
        }

        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                let particle = grid[i][j];
                if (particle !== null) {
                    if (!particle.revealed || !particle.canFall) {
                        gridBuffer[i][j] = particle;
                        fallDistancesBuffer[i][j] = fallDistances[i][j];
                    }
                }
            }
        }

        for (let i = 0; i < cols; i++) {
            for (let j = rows - 1; j >= 0; j--) {
                let particle = grid[i][j];

                if (particle !== null && particle.dormant) {
                    gridBuffer[i][j] = particle;
                    fallDistancesBuffer[i][j] = fallDistances[i][j];
                    continue;
                }

                if (particle !== null && particle.canFall && (particle.revealed || fallDistances[i][j] > 0)) {
                    let currentFallDistance = fallDistances[i][j];
                    let fell = false;

                    if (particle.canFall && currentFallDistance < MAX_FALL_DISTANCE) {

                        if (particle.fallCategory === 3) {
                            let above = j - 1;

                            if (above >= 0 && grid[i][above] === null) {
                                gridBuffer[i][above] = particle;
                                fallDistancesBuffer[i][above] = currentFallDistance + cellSize;
                                fell = true;
                            }
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

                            if (!fell && above >= 0) {
                                // Use faster Math.random instead of p5.random
                                let dir = Math.random() < 0.5 ? -1 : 1;
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
                        else {
                            let below = j + 1;

                            if (below < rows && currentFallDistance + cellSize <= MAX_FALL_DISTANCE) {
                                // Eliminate object allocations - check positions directly
                                let darkestCol = -1;
                                let darkestRow = -1;
                                let darkestBrightness = particle.brightness;

                                // Check center
                                let targetParticle = grid[i][below];
                                if (targetParticle === null) {
                                    darkestCol = i;
                                    darkestRow = below;
                                    darkestBrightness = 0;
                                } else if (targetParticle.brightness < darkestBrightness) {
                                    darkestCol = i;
                                    darkestRow = below;
                                    darkestBrightness = targetParticle.brightness;
                                }

                                // Check left diagonal
                                if (i - 1 >= 0) {
                                    targetParticle = grid[i - 1][below];
                                    if (targetParticle === null && (darkestBrightness > 0 || darkestCol === -1)) {
                                        darkestCol = i - 1;
                                        darkestRow = below;
                                        darkestBrightness = 0;
                                    } else if (targetParticle !== null && targetParticle.brightness < darkestBrightness) {
                                        darkestCol = i - 1;
                                        darkestRow = below;
                                        darkestBrightness = targetParticle.brightness;
                                    }
                                }

                                // Check right diagonal
                                if (i + 1 < cols) {
                                    targetParticle = grid[i + 1][below];
                                    if (targetParticle === null && (darkestBrightness > 0 || darkestCol === -1)) {
                                        darkestCol = i + 1;
                                        darkestRow = below;
                                        darkestBrightness = 0;
                                    } else if (targetParticle !== null && targetParticle.brightness < darkestBrightness) {
                                        darkestCol = i + 1;
                                        darkestRow = below;
                                        darkestBrightness = targetParticle.brightness;
                                    }
                                }

                                if (darkestCol !== -1 && particle.brightness > darkestBrightness) {
                                    targetParticle = grid[darkestCol][darkestRow];

                                    gridBuffer[darkestCol][darkestRow] = particle;
                                    fallDistancesBuffer[darkestCol][darkestRow] = currentFallDistance + cellSize;
                                    fell = true;

                                    if (targetParticle !== null && gridBuffer[i][j] === null) {
                                        gridBuffer[i][j] = targetParticle;
                                        fallDistancesBuffer[i][j] = fallDistances[darkestCol][darkestRow];
                                    }
                                }
                            }
                        }
                    }

                    if (!fell) {
                        if (gridBuffer[i][j] === null) {
                            particle.dormantFrames++;

                            if (particle.dormantFrames > 30) {
                                particle.dormant = true;
                            }

                            gridBuffer[i][j] = particle;
                            fallDistancesBuffer[i][j] = currentFallDistance;
                        }
                    } else {
                        particle.dormantFrames = 0;
                        particle.dormant = false;
                    }
                }
            }
        }

        let tempGrid = grid;
        grid = gridBuffer;
        gridBuffer = tempGrid;

        let tempFall = fallDistances;
        fallDistances = fallDistancesBuffer;
        fallDistancesBuffer = tempFall;
    }

    // Only render when simulation updates
    if (!needsRedraw) {
        return;
    }

    background(0);
    noStroke();

    // Use cached values - optimize rendering
    for (let i = 0; i < cols; i++) {
        let x = i * scaleFactor + offset; // Cache x calculation
        for (let j = 0; j < rows; j++) {
            let particle = grid[i][j];
            if (particle === null) continue; // Early exit for null particles

            // Early exit for hidden particles
            if (!particle.revealed && (!particle.canFall || fallDistances[i][j] === 0)) continue;

            // Unpack color and draw
            let c = particle.color;
            let r = (c >> 16) & 0xFF;
            let g = (c >> 8) & 0xFF;
            let b = c & 0xFF;
            fill(r, g, b);
            rect(x, j * scaleFactor + offset, pixelDrawSize, pixelDrawSize);
        }
    }

    needsRedraw = false;
}

function windowResized() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        const canvasSize = calculateCanvasSize();
        resizeCanvas(canvasSize, canvasSize);

        // Recalculate cached drawing values
        scaleFactor = width / cols;
        pixelDrawSize = scaleFactor * PIXEL_BORDER_SIZE;
        offset = scaleFactor * (1 - PIXEL_BORDER_SIZE) / 2;

        needsRedraw = true;
    }, 150);
}

function make2DArray(cols, rows) {
    let arr = new Array(cols);
    for (let i = 0; i < cols; i++) {
        arr[i] = new Array(rows).fill(null);
    }
    return arr;
}

function exportImage() {
    let scale = 4;
    let exportWidth = cols * scale;
    let exportHeight = rows * scale;

    let pg = createGraphics(exportWidth, exportHeight);
    pg.noSmooth();
    pg.noStroke();
    pg.background(0);

    let scaledCellSize = scale;
    let pixelDrawSize = scaledCellSize * PIXEL_BORDER_SIZE;
    let offset = scaledCellSize * (1 - PIXEL_BORDER_SIZE) / 2;

    for (let i = 0; i < cols; i++) {
        let x = i * scaledCellSize + offset; // Cache x calculation
        for (let j = 0; j < rows; j++) {
            let particle = grid[i][j];
            if (particle === null) continue;

            // Early exit for hidden particles
            if (!particle.revealed && (!particle.canFall || fallDistances[i][j] === 0)) continue;

            let c = particle.color;
            let r = (c >> 16) & 0xFF;
            let g = (c >> 8) & 0xFF;
            let b = c & 0xFF;
            pg.fill(r, g, b);
            pg.rect(x, j * scaledCellSize + offset, pixelDrawSize, pixelDrawSize);
        }
    }

    save(pg, 'falling_sand_' + Date.now() + '.png');
    console.log('Image exported at ' + exportWidth + 'x' + exportHeight);
}
