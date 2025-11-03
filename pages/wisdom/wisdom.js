var user_status = [
    "absorb",
    "accomplish the opposite of",
    "actively resist",
    "be open to",
    "be wholly consumed by",
    "begin",
    "blindly follow",
    "break free of",
    "carefully examine",
    "clearly articulate",
    "critically examine",
    "crush your most",
    "deliberately construct",
    "don't think about",
    "emotionally respond to",
    "express plainly", 
    "fall in love with",
    "frequently revisit",
    "gently release",
    "immediately abandon",
    "immediately cease engaging with",
    "internalise and then forget",
    "intuitively grasp",
    "ironically celebrate",
    "listen keenly to",
    "lose control of",
    "never obfuscate",
    "percieve with open eyes, your",
    "playfully experiment with",
    "profoundly misunderstand",
    "quietly observe",
    "rarely acknowledge",
    "refine and tinker with",
    "roughly estimate",
    "selectively interpret",
    "seriously contemplate",
    "sincerely honor",
    "superficially engage with",
    "systematically dismantle",
    "temporarily suspend",
    "touch and understand",
    "unknowingly perpetuate",
    "willingly surrender to"
];

var qualities = [
    "abstract",
    "accidental",
    "active",
    "amusing",
    "ancient",
    "artificial",
    "authentic",
    "celestial",
    "chaotic",
    "circular",
    "collective",
    "common",
    "complex",
    "concrete",
    "confrontational",
    "conscious",
    "conventional",
    "crude",
    "cultivated",
    "dead",
    "delicate",
    "deliberate",
    "disgusting",
    "divine",
    "domestic",
    "earthly",
    "elaborate",
    "elusive",
    "enduring",
    "ephemeral",
    "essential",
    "experimental",
    "extraordinary",
    "familiar",
    "fluid",
    "forbidden",
    "foreign",
    "fragile",
    "gentle",
    "godlike",
    "harsh",
    "hidden",
    "human",
    "hybrid",
    "iconoclastic",
    "immortal",
    "inanimate",
    "individual",
    "intentional",
    "intangible",
    "invisible",
    "living",
    "literal",
    "major",
    "material",
    "mechanical",
    "minor",
    "modern",
    "mortal",
    "mundane",
    "natural",
    "objective",
    "obvious",
    "opaque",
    "orderly",
    "ordinary",
    "organic",
    "particular",
    "peaceful",
    "permanent",
    "personal",
    "private",
    "processed",
    "profane",
    "public",
    "pure",
    "radical",
    "rare",
    "raw",
    "realistic",
    "refined",
    "regrettable",
    "rigid",
    "robust",
    "sacred",
    "satanic",
    "simple",
    "specific",
    "spiritual",
    "spontaneous",
    "strange",
    "subtle",
    "symbolic",
    "synthetic",
    "tangible",
    "temporary",
    "traditional",
    "transparent",
    "troubling",
    "uncomfortable",
    "unconscious",
    "universal",
    "violent",
    "visible",
    "wild"
];

var items = [
    "artifacts",
    "beliefs",
    "celebrations",
    "ceremonies",
    "compositions",
    "concepts",
    "conveyances",
    "creations",
    "designs",
    "desires",
    "discoveries",
    "dreams",
    "experiences",
    "explorations",
    "expressions",
    "gatherings",
    "ideas",
    "innovations",
    "insights",
    "instruments",
    "inventions",
    "journeys",
    "languages",
    "materials",
    "methods",
    "movements",
    "musics",
    "narratives",
    "objects",
    "patterns",
    "people",
    "performances",
    "phenomena",
    "philosophies",
    "practices",
    "principles",
    "processes",
    "pursuits",
    "recordings",
    "revelations",
    "rituals",
    "structures",
    "symbols",
    "systems",
    "teachings",
    "technologies",
    "theories",
    "thoughts",
    "traditions",
    "transformations",
    "values",
    "visions",
    "wisdoms",
    "works",
    "writings"
];

let lastGenerated = null;

// Random selection excluding last pick
function randomExcluding(array, exclude) {
    if (array.length <= 1) return array[0];
    let item;
    do {
        item = array[Math.floor(Math.random() * array.length)];
    } while (item === exclude);
    return item;
}

function generator() {
    const status = user_status[Math.floor(Math.random() * user_status.length)];
    const quality = qualities[Math.floor(Math.random() * qualities.length)];
    const item = items[Math.floor(Math.random() * items.length)];
    
    const generated = status + " " + quality + " " + item + ".";
    
    // Make sure it's different from last one
    if (generated === lastGenerated && user_status.length > 1) {
        return generator(); // Try again
    }
    
    lastGenerated = generated;
    displayText(generated);
}

function displayText(text) {
    const textElement = document.getElementById('overlayText');
    
    // On mobile, position text centered between nav-box bottom and screen bottom
    if (window.innerWidth <= 600) {
        textElement.textContent = text;
        
        setTimeout(() => {
            const navBox = document.querySelector('.nav-box');
            if (navBox) {
                const navBoxRect = navBox.getBoundingClientRect();
                const navBoxBottom = navBoxRect.bottom;
                const screenBottom = window.innerHeight;
                const centerPoint = navBoxBottom + (screenBottom - navBoxBottom) / 2;
                
                textElement.style.top = centerPoint + 'px';
            }
            
            const maxHeight = window.innerHeight * 0.6; // 60vh max
            const maxWidth = window.innerWidth - 48; // Account for 1.5rem padding on each side
            
            // Reset to let clamp work
            textElement.style.fontSize = '';
            
            // If it overflows height or width, scale it down
            let currentSize = parseFloat(getComputedStyle(textElement).fontSize);
            const minSize = 32; // 2rem minimum
            
            while ((textElement.scrollHeight > maxHeight || textElement.scrollWidth > maxWidth) && currentSize > minSize) {
                currentSize -= 2;
                textElement.style.fontSize = currentSize + 'px';
            }
        }, 50);
    } else {
        textElement.style.fontSize = '';
        textElement.style.top = '';
        textElement.textContent = text;
    }
}

// Event listener
document.getElementById('generateButton').addEventListener('click', generator);

// Handle resize
window.addEventListener('resize', () => {
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(() => {
        if (lastGenerated) displayText(lastGenerated);
    }, 150);
});

// Generate initial text on load
generator();
