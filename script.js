import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// --- STATE MANAGEMENT ---
let currentSceneId = 'scene-intro';
const heartColors = {
    '💖': '#FF69B4', '❤️': '#FF4B4B', '💕': '#FFB6C1',
    '💞': '#FF6EB4', '💓': '#F48FB1', '💗': '#FFC0CB',
};
const heartEmojis = Object.keys(heartColors);
let floatingHearts = [];
let sparkles = [];
let scene, camera, renderer, composer, clock;

// --- AUDIO ---
// Initialize a synthesizer for sound effects
const sparkleSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 1 },
    volume: -10
}).toDestination();

// --- SCENE LOGIC ---
/**
 * Switches from the current scene to the next one with a fade transition.
 * @param {string} nextSceneId - The ID of the scene to transition to.
 */
function switchScene(nextSceneId) {
    const currentScene = document.getElementById(currentSceneId);
    const nextScene = document.getElementById(nextSceneId);

    if (currentScene) currentScene.classList.remove('active');
    
    setTimeout(() => {
        if (nextScene) {
            nextScene.classList.add('active');
            currentSceneId = nextSceneId;
        }
    }, 500); // Delay matches CSS transition duration
}

/**
 * Shows a response message and transitions to the next scene.
 * @param {HTMLElement} btn - The button or element that was clicked.
 * @param {string|null} customText - Optional custom text to display.
 */
function showResponse(btn, customText = null) {
    const sceneEl = btn.closest('.scene');
    if (!sceneEl) return;
    
    const responseEl = sceneEl.querySelector('.response-text');
    const responseText = customText || btn.dataset.response;
    const nextSceneId = btn.dataset.next;
    
    // Disable all choices in the current scene
    sceneEl.querySelectorAll('.btn, .emoji-choice').forEach(el => el.style.pointerEvents = 'none');

    if (responseEl && responseText) {
        responseEl.textContent = responseText;
        gsap.to(responseEl, { opacity: 1, y: 0, duration: 0.4 });
    }
    
    // Wait for the response to be visible before switching scenes
    setTimeout(() => {
        if (nextSceneId) switchScene(nextSceneId);
    }, responseText ? 2000 : 100);
}

/**
 * Makes a button "run away" from the mouse on hover or click.
 * @param {string} buttonId - The ID of the button element.
 * @param {string} containerId - The ID of the container element to constrain the button's movement.
 */
function makeButtonRun(buttonId, containerId) {
    const button = document.getElementById(buttonId);
    const container = document.getElementById(containerId);

    const moveButton = (e) => {
        // On first move, set position to absolute to allow free movement
        if (getComputedStyle(button).position !== 'absolute') {
            const buttonRect = button.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            button.style.width = `${buttonRect.width}px`;
            button.style.height = `${buttonRect.height}px`;
            button.style.position = 'absolute';
            button.style.top = `${buttonRect.top - containerRect.top}px`;
            button.style.left = `${buttonRect.left - containerRect.left}px`;
        }

        e.preventDefault();

        // Calculate a new random position within the container
        const containerRect = container.getBoundingClientRect();
        const btnRect = button.getBoundingClientRect();
        const newTop = Math.random() * (containerRect.height - btnRect.height);
        const newLeft = Math.random() * (containerRect.width - btnRect.width);

        gsap.to(button, { top: newTop, left: newLeft, duration: 0.4, ease: 'power2.out' });
    };
    button.addEventListener('mouseover', moveButton);
    button.addEventListener('click', moveButton);
}

/**
 * Initiates the final animation sequence.
 * @param {boolean} isYesPath - Determines which final message and animation to show.
 */
function startFinalAnimation(isYesPath) {
    document.querySelectorAll('.scene.active').forEach(s => s.classList.remove('active'));
    if(isYesPath) {
        sparkleSynth.triggerAttackRelease(["C5", "E5", "G5", "C6"], "8n", Tone.now());
        createHeartBurst();
    }
    // Fade in the Three.js canvas
    gsap.to('#canvas-container', { opacity: 1, duration: 2, onComplete: () => initThreeJS(isYesPath) });
}


// --- THREE.JS INITIALIZATION AND ANIMATION ---

/**
 * Sets up the main Three.js scene, camera, renderer, and post-processing effects.
 * @param {boolean} isYesPath - Passed to the tree growing function.
 */
function initThreeJS(isYesPath) {
    try {
        scene = new THREE.Scene();
        clock = new THREE.Clock();
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 35;
        
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        document.getElementById('canvas-container').appendChild(renderer.domElement);

        // Lighting
        scene.add(new THREE.AmbientLight(0xffc0cb, 1.0));
        const spotLight = new THREE.SpotLight(0xffffff, 1.5, 100, Math.PI / 4, 1, 1);
        spotLight.position.set(0, 15, 40);
        scene.add(spotLight);

        // Post-processing for bloom effect
        const renderScene = new RenderPass(scene, camera);
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.6, 0.6);
        composer = new EffectComposer(renderer);
        composer.addPass(renderScene);
        composer.addPass(bloomPass);

        // Create all visual elements
        createFloatingHearts();
        createBackgroundHeartOutline();
        createSparkles();
        growHeartTree(isYesPath);
        
        animate();
        window.addEventListener('resize', onWindowResize);
    } catch (error) {
        console.error("An error occurred during Three.js initialization:", error);
        document.body.innerHTML = "Oops! Something went wrong. Please refresh.";
    }
}

/**
 * Creates a canvas texture with a glowing emoji.
 * @param {string} emoji - The emoji character to draw.
 * @param {string} glowColor - The color of the glow effect.
 * @returns {THREE.CanvasTexture} The generated texture.
 */
function createGlowingEmojiTexture(emoji, glowColor) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const size = 256;
    const glowSize = 35;
    canvas.width = size;
    canvas.height = size;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glowSize;
    ctx.font = `${size / 2.2}px Arial`;
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Drawing twice enhances the glow
    ctx.fillText(emoji, size / 2, size / 2);
    ctx.fillText(emoji, size / 2, size / 2);
    return new THREE.CanvasTexture(canvas);
}

/**
 * Creates a canvas texture for a soft, glowing dot.
 * @param {string} color - The color of the dot.
 * @returns {THREE.CanvasTexture} The generated texture.
 */
function createGlowingDotTexture(color) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 128;
    canvas.height = 128;
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.8, `${color}33`); // Semi-transparent
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
}

/**
 * Creates a temporary, full-screen emoji burst effect.
 * @param {object} options - Configuration for the burst.
 */
function createBurst(options) {
    const { getEmoji, getColor, onComplete } = options;

    const burstContainer = new THREE.Group();
    const tempScene = new THREE.Scene();
    tempScene.add(burstContainer);
    
    // Use a temporary renderer to overlay the burst on top of everything
    const tempRenderer = new THREE.WebGLRenderer({alpha: true, antialias: true});
    tempRenderer.setSize(window.innerWidth, window.innerHeight);
    tempRenderer.setPixelRatio(window.devicePixelRatio);
    tempRenderer.domElement.style.position = 'fixed'; 
    tempRenderer.domElement.style.top = '0'; 
    tempRenderer.domElement.style.left = '0'; 
    tempRenderer.domElement.style.zIndex = '99';
    tempRenderer.domElement.style.pointerEvents = 'none';
    document.body.appendChild(tempRenderer.domElement);
    
    const tempCam = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    tempCam.position.z = 30;

    for(let i = 0; i < 40; i++) {
        const emoji = getEmoji(i);
        const color = getColor(emoji);
        const material = new THREE.SpriteMaterial({ 
            map: createGlowingEmojiTexture(emoji, color), 
            blending: THREE.AdditiveBlending, 
            depthWrite: false 
        });
        const sprite = new THREE.Sprite(material);
        burstContainer.add(sprite);

        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 8 + 4;
        
        // Animate the burst outwards
        gsap.fromTo(sprite.scale, {x:0, y:0}, {x:3, y:3, duration: 0.8, ease: 'power2.out'});
        gsap.fromTo(sprite.position, {x:0, y:0, z:0}, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z:0, duration: 0.8, ease: 'power2.out' });
        gsap.to(material, {opacity: 0, duration: 0.6, ease: 'power1.in', delay: 0.4, onComplete: () => {
            burstContainer.remove(sprite);
            material.map.dispose();
            material.dispose();
        }});
    }
    
    // Animation loop for the temporary burst scene
    function tempAnimate() {
        if (burstContainer.children.length > 0) {
            requestAnimationFrame(tempAnimate);
            tempRenderer.render(tempScene, tempCam);
        } else {
            // Cleanup after animation
            if (document.body.contains(tempRenderer.domElement)) {
                document.body.removeChild(tempRenderer.domElement);
            }
        }
    }
    tempAnimate();

    setTimeout(() => {
        if (onComplete) onComplete();
    }, 1000);
}

/** Creates a burst of heart emojis. */
function createHeartBurst() {
     createBurst({
        getEmoji: (i) => heartEmojis[i % heartEmojis.length],
        getColor: (emoji) => heartColors[emoji]
    });
}

/** Creates a burst of pleading face emojis. */
function createPleadingEmojiBurst(onComplete) {
    createBurst({
        getEmoji: () => '🥹',
        getColor: () => '#87CEEB', // Sky blue glow
        onComplete: onComplete
    });
}

/** Populates the scene with floating, swaying heart particles. */
function createFloatingHearts() {
    const heartsGroup = new THREE.Group();
    for (let i = 0; i < 50; i++) {
        const emoji = heartEmojis[Math.floor(Math.random() * heartEmojis.length)];
        const material = new THREE.SpriteMaterial({ map: createGlowingDotTexture(heartColors[emoji]), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
        const sprite = new THREE.Sprite(material);
        sprite.position.set((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80 - 10, (Math.random() - 0.5) * 40);
        const scale = Math.random() * 0.5 + 0.1;
        sprite.scale.set(scale, scale, scale);
        sprite.userData = { speed: Math.random() * 0.4 + 0.1, sway: Math.random() * Math.PI, swaySpeed: Math.random() * 0.5 + 0.1, swayAmplitude: Math.random() * 2 };
        heartsGroup.add(sprite);
        floatingHearts.push(sprite);
    }
    scene.add(heartsGroup);
}

/** Creates a large, static heart outline in the background from glowing dots. */
function createBackgroundHeartOutline() {
    const pointsGroup = new THREE.Group();
    const numPoints = 120;
    const scaleFactor = 1.1;
    const material = new THREE.SpriteMaterial({ map: createGlowingDotTexture('#FFC0CB'), blending: THREE.AdditiveBlending, transparent: true, opacity: 0 });
    for (let i = 0; i < numPoints; i++) {
        const t = (i / numPoints) * Math.PI * 2;
        // Parametric equation for a heart shape
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t);
        const sprite = new THREE.Sprite(material.clone());
        sprite.position.set(x * scaleFactor, y * scaleFactor, (Math.random() - 0.5) * 2 - 4);
        const scale = Math.random() * 0.3 + 0.3;
        sprite.scale.set(scale, scale, scale);
        pointsGroup.add(sprite);
    }
    pointsGroup.position.y = 4;
    scene.add(pointsGroup);
    gsap.to(material, { opacity: 0.5, duration: 5, delay: 2.5 });
}

/** Creates twinkling sparkle particles throughout the scene. */
function createSparkles() {
    const sparklesGroup = new THREE.Group();
    const sparkleMaterial = new THREE.SpriteMaterial({ map: createGlowingDotTexture('#FFFFFF'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    for (let i = 0; i < 100; i++) {
        const sprite = new THREE.Sprite(sparkleMaterial);
        const radius = Math.random() * 20 + 8;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1); 
        sprite.position.setFromSphericalCoords(radius, phi, theta);
        sprite.position.y += 4;
        const scale = Math.random() * 0.3 + 0.1;
        sprite.scale.set(scale, scale, scale);
        sprite.userData = { baseOpacity: Math.random() * 0.4 + 0.2, twinkleSpeed: Math.random() * 1.5 + 0.5 };
        sparklesGroup.add(sprite);
        sparkles.push(sprite);
    }
    scene.add(sparklesGroup);
}

/** Animates the growth of a tree made of heart emojis. */
function growHeartTree(isYesPath) {
    const treeGroup = new THREE.Group();
    scene.add(treeGroup);
    treeGroup.position.y = 4;
    const tl = gsap.timeline();
    const numHearts = 150;
    for (let i = 0; i < numHearts; i++) {
        const t = (i / numHearts) * Math.PI * 2;
        // Parametric equation for a heart shape
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t);
        const emoji = heartEmojis[i % heartEmojis.length];
        const glowColor = heartColors[emoji];
        const material = new THREE.SpriteMaterial({ map: createGlowingEmojiTexture(emoji, glowColor), transparent: true, blending: THREE.NormalBlending, depthWrite: false });
        const sprite = new THREE.Sprite(material);
        const startPos = new THREE.Vector3(0, -10, 0);
        sprite.position.copy(startPos);
        treeGroup.add(sprite);
        const scaleFactor = 0.65;
        const finalPos = new THREE.Vector3(x * scaleFactor, y * scaleFactor, (Math.random() - 0.5) * 4);
        const delay = 0.2 + i * 0.02; 
        
        // GSAP timeline for each heart's animation
        tl.to(sprite.position, { x: finalPos.x, y: finalPos.y, z: finalPos.z, duration: 1.8, ease: 'expo.out' }, delay);
        tl.fromTo(sprite.scale, { x:0, y:0, z:0 }, { x: 3, y: 3, z: 3, duration: 0.9, ease: 'back.out(2)' }, delay);
        tl.to(sprite.scale, { x: 2.2, y: 2.2, z: 2.2, duration: 1.0, ease: 'power2.inOut' }, '>-=0.6');
        tl.fromTo(sprite.rotation, { z: (Math.random() - 0.5) * Math.PI }, { z: 0, duration: 2.0, ease: 'power3.out' }, delay);
    }

    // After the tree grows, show the final message
    tl.call(() => {
        const msgContainer = document.getElementById('final-message-container');
        const msgText = document.getElementById('final-message-text');
        if (isYesPath) {
            msgText.innerHTML = `Tum mere Heart Tree ka hissa ho, Pookie 💝`;
        } else {
            msgText.innerHTML = `Chahe tum 'No' kaho...<br>par main tumhe hamesha pyaar karunga 💌`;
        }
        gsap.timeline()
            .to(msgContainer, { visibility: 'visible', opacity: 1, duration: 1.5 })
            .to(msgText, { opacity: 1, y: 0, duration: 1.5, ease: 'expo.out' }, "-=0.5");
    }, null, ">0.2");
}

/** Handles window resize events to keep the canvas responsive. */
function onWindowResize() {
    if (camera && renderer && composer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    }
}

/** The main animation loop, called every frame. */
function animate() {
    requestAnimationFrame(animate);
    if (!composer || !clock) return; // Ensure Three.js is initialized
    
    const delta = clock.getDelta();
    const elapsedTime = clock.getElapsedTime();

    // Animate floating hearts
    floatingHearts.forEach(heart => {
        const { userData } = heart;
        heart.position.y += userData.speed * delta;
        heart.position.x += Math.sin(elapsedTime * userData.swaySpeed + userData.sway) * userData.swayAmplitude * delta;
        // Reset heart position when it goes off-screen
        if (heart.position.y > (window.innerHeight / 20) ) {
            heart.position.y = -(window.innerHeight / 20);
            heart.position.x = (Math.random() - 0.5) * 80;
        }
    });

    // Animate sparkles
    sparkles.forEach(sparkle => {
        const { userData } = sparkle;
        sparkle.material.opacity = userData.baseOpacity * (Math.sin(elapsedTime * userData.twinkleSpeed) * 0.5 + 0.5);
    });

    composer.render();
}

// --- EVENT LISTENERS ---
document.getElementById('start-btn').addEventListener('click', () => switchScene('scene-q1'));

document.querySelectorAll('.yes-btn, .no-btn').forEach(btn => {
    btn.addEventListener('click', (e) => showResponse(e.currentTarget));
});

document.querySelectorAll('.emoji-choice').forEach(emoji => {
    emoji.addEventListener('click', (e) => {
         showResponse(e.currentTarget, e.currentTarget.dataset.message);
    });
});

document.getElementById('final-yes-btn').addEventListener('click', () => {
     document.getElementById('final-yes-btn').style.pointerEvents = 'none';
     document.getElementById('final-no-btn').style.pointerEvents = 'none';
     startFinalAnimation(true);
});

document.getElementById('final-no-btn').addEventListener('click', () => {
    document.getElementById('final-yes-btn').style.pointerEvents = 'none';
    document.getElementById('final-no-btn').style.pointerEvents = 'none';
    createPleadingEmojiBurst(() => {
        startFinalAnimation(false);
    });
});

// Initialize the "running button" feature
makeButtonRun('no-btn-q1', 'scene-q1');
