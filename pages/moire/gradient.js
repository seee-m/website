// Evolving Sunset Gradient Shader
// Creates a smooth, grainy, ever-shifting twilight gradient

const vertexShaderSource = `
    attribute vec4 a_position;
    void main() {
        gl_Position = a_position;
    }
`;

const fragmentShaderSource = `
    precision highp float;

    uniform vec2 u_resolution;
    uniform float u_time;

    // Simple noise function for grain
    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    // Ultra-smooth color mixing with extended smoothstep
    vec3 smoothMix(vec3 col1, vec3 col2, float t) {
        // Smoother interpolation curve
        t = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
        return mix(col1, col2, t);
    }

    void main() {
        // Normalize coordinates
        vec2 uv = gl_FragCoord.xy / u_resolution;

        // Very slow evolution - cycles through sunset -> night -> morning -> sunset
        float slowTime = u_time * 0.012;

        // Cycle phase: 0-1 represents full sunset->night->morning->sunset cycle
        float cycle = fract(slowTime * 0.08);

        // Moving gradient bands - subtle vertical shift
        float movement = sin(slowTime * 0.25) * 0.15;
        float gradientPos = uv.y + movement;

        // Desaturation factor - more desaturated at top, saturated at horizon (bottom)
        float desatFactor = smoothstep(0.3, 1.0, gradientPos);

        // Define color states for different times
        // SUNSET colors (cycle 0.0 - 0.33)
        vec3 sunsetTop = vec3(0.0, 0.0, 0.047);          // Pure black (Nurebairo #000B00)
        vec3 sunsetUpperMid = vec3(0.02, 0.03, 0.10);    // Very dark navy
        vec3 sunsetMid = vec3(0.08, 0.10, 0.18);         // Dark blue
        vec3 sunsetHorizon = vec3(0.92, 0.26, 0.22);     // Vibrant red/coral
        vec3 sunsetBottom = vec3(0.984, 0.980, 0.961);   // Pale sandy (Kinari-iro #FBFAF5)

        // NIGHT colors (cycle 0.33 - 0.66)
        vec3 nightTop = vec3(0.0, 0.0, 0.047);           // Pure black
        vec3 nightUpperMid = vec3(0.03, 0.04, 0.12);     // Very dark navy
        vec3 nightMid = vec3(0.10, 0.08, 0.20);          // Deep purple-navy
        vec3 nightHorizon = vec3(0.35, 0.30, 0.40);      // Muted purple-grey
        vec3 nightBottom = vec3(0.75, 0.74, 0.72);       // Dusty grey

        // MORNING colors (cycle 0.66 - 1.0)
        vec3 morningTop = vec3(0.12, 0.14, 0.18);        // Dark blue-grey
        vec3 morningUpperMid = vec3(0.28, 0.30, 0.35);   // Steely grey
        vec3 morningMid = vec3(0.45, 0.48, 0.52);        // Light steely grey
        vec3 morningHorizon = vec3(0.95, 0.82, 0.65);    // Warm peachy-yellow
        vec3 morningBottom = vec3(0.96, 0.95, 0.92);     // Very light sandy

        // Blend between time states based on cycle
        vec3 topColor, upperMidColor, midColor, horizonColor, bottomColor;

        if(cycle < 0.33) {
            // Sunset phase
            float t = cycle / 0.33;
            topColor = sunsetTop;
            upperMidColor = sunsetUpperMid;
            midColor = sunsetMid;
            horizonColor = sunsetHorizon;
            bottomColor = sunsetBottom;
        } else if(cycle < 0.66) {
            // Transitioning to night
            float t = (cycle - 0.33) / 0.33;
            topColor = mix(sunsetTop, nightTop, t);
            upperMidColor = mix(sunsetUpperMid, nightUpperMid, t);
            midColor = mix(sunsetMid, nightMid, t);
            horizonColor = mix(sunsetHorizon, nightHorizon, t);
            bottomColor = mix(sunsetBottom, nightBottom, t);
        } else {
            // Transitioning to morning and back to sunset
            float t = (cycle - 0.66) / 0.34;
            vec3 currentTop = mix(nightTop, morningTop, smoothstep(0.0, 0.5, t));
            vec3 currentUpperMid = mix(nightUpperMid, morningUpperMid, smoothstep(0.0, 0.5, t));
            vec3 currentMid = mix(nightMid, morningMid, smoothstep(0.0, 0.5, t));
            vec3 currentHorizon = mix(nightHorizon, morningHorizon, smoothstep(0.0, 0.5, t));
            vec3 currentBottom = mix(nightBottom, morningBottom, smoothstep(0.0, 0.5, t));

            // Blend back to sunset
            topColor = mix(currentTop, sunsetTop, smoothstep(0.5, 1.0, t));
            upperMidColor = mix(currentUpperMid, sunsetUpperMid, smoothstep(0.5, 1.0, t));
            midColor = mix(currentMid, sunsetMid, smoothstep(0.5, 1.0, t));
            horizonColor = mix(currentHorizon, sunsetHorizon, smoothstep(0.5, 1.0, t));
            bottomColor = mix(currentBottom, sunsetBottom, smoothstep(0.5, 1.0, t));
        }

        // Build gradient matching the reference image
        // Black top -> dark navy -> blue -> VIBRANT RED/CORAL -> pale sandy bottom
        vec3 finalColor;

        if(gradientPos < 0.25) {
            // Top region - pure black to dark navy
            float t = gradientPos / 0.25;
            finalColor = smoothMix(topColor, upperMidColor, t);
        } else if(gradientPos < 0.5) {
            // Upper middle - dark navy to blue
            float t = (gradientPos - 0.25) / 0.25;
            finalColor = smoothMix(upperMidColor, midColor, t);
        } else if(gradientPos < 0.7) {
            // Approaching horizon - blue to VIBRANT color band
            float t = (gradientPos - 0.5) / 0.2;
            finalColor = smoothMix(midColor, horizonColor, t);
        } else if(gradientPos < 0.85) {
            // Horizon - concentrated saturated color
            float t = (gradientPos - 0.7) / 0.15;
            finalColor = horizonColor;
        } else {
            // Bottom - vibrant color fading to pale sandy
            float t = (gradientPos - 0.85) / 0.15;
            finalColor = smoothMix(horizonColor, bottomColor, t);
        }

        // Subtle film grain for texture
        float grain = (random(gl_FragCoord.xy + fract(u_time * 0.1)) - 0.5) * 0.015;
        finalColor += grain;

        // Very subtle vignette
        float vignette = length(uv - 0.5);
        finalColor *= 1.0 - vignette * 0.06;

        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

class GradientRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

        if (!this.gl) {
            console.error('WebGL not supported');
            return;
        }

        this.startTime = Date.now();
        this.setup();
        this.resize();
        this.render();

        window.addEventListener('resize', () => this.resize());
    }

    setup() {
        const gl = this.gl;

        // Create shaders
        const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

        // Create program
        this.program = this.createProgram(vertexShader, fragmentShader);

        // Get attribute and uniform locations
        this.positionLocation = gl.getAttribLocation(this.program, 'a_position');
        this.resolutionLocation = gl.getUniformLocation(this.program, 'u_resolution');
        this.timeLocation = gl.getUniformLocation(this.program, 'u_time');

        // Create buffer for fullscreen quad
        this.positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        const positions = [
            -1, -1,
             1, -1,
            -1,  1,
            -1,  1,
             1, -1,
             1,  1,
        ];
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    }

    createShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    createProgram(vertexShader, fragmentShader) {
        const gl = this.gl;
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program linking error:', gl.getProgramInfoLog(program));
            gl.deleteProgram(program);
            return null;
        }

        return program;
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    render() {
        const gl = this.gl;
        const currentTime = (Date.now() - this.startTime) / 1000;

        // Clear
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // Use program
        gl.useProgram(this.program);

        // Set uniforms
        gl.uniform2f(this.resolutionLocation, this.canvas.width, this.canvas.height);
        gl.uniform1f(this.timeLocation, currentTime);

        // Setup position attribute
        gl.enableVertexAttribArray(this.positionLocation);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);

        // Draw
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Loop
        requestAnimationFrame(() => this.render());
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gradient-canvas');
    if (canvas) {
        new GradientRenderer(canvas);
    }
});
