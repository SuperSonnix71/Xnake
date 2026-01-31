// Browser Fingerprinting
// Creates a unique fingerprint for the browser/device
// This helps identify returning players without requiring login

class BrowserFingerprint {
    constructor() {
        this.fingerprint = null;
    }

    async generate() {
        if (this.fingerprint) {
            return this.fingerprint;
        }

        const components = [];

        // Screen resolution
        components.push(`${screen.width  }x${  screen.height}`);
        components.push(screen.colorDepth);

        // Timezone
        components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
        components.push(new Date().getTimezoneOffset());

        // Language
        components.push(navigator.language);
        components.push(navigator.languages.join(','));

        // Platform
        components.push(navigator.platform);
        components.push(navigator.hardwareConcurrency || 'unknown');

        // User agent
        components.push(navigator.userAgent);

        // Canvas fingerprint
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('Xnake', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('Xnake', 4, 17);
        components.push(canvas.toDataURL());

        // WebGL fingerprint
        try {
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    components.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
                    components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
                }
            }
        } catch (_e) {
            components.push('webgl-error');
        }

        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const analyser = audioContext.createAnalyser();
            const gainNode = audioContext.createGain();
            const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

            gainNode.gain.value = 0;
            oscillator.connect(analyser);
            analyser.connect(scriptProcessor);
            scriptProcessor.connect(gainNode);
            gainNode.connect(audioContext.destination);

            scriptProcessor.onaudioprocess = function() { return undefined; };
            oscillator.start(0);
            
            components.push(audioContext.sampleRate.toString());
            
            oscillator.stop();
            audioContext.close();
        } catch (_e) {
            components.push('audio-error');
        }

        // Touch support
        components.push(navigator.maxTouchPoints || 0);

        // Create hash from components
        this.fingerprint = await this.hashString(components.join('|||'));
        return this.fingerprint;
    }

    async hashString(str) {
        // Use SubtleCrypto API if available
        if (window.crypto && window.crypto.subtle) {
            const encoder = new TextEncoder();
            const data = encoder.encode(str);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }
        
        // Fallback to simple hash
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16);
    }

    get() {
        return this.fingerprint;
    }
}

// Create global instance
window.browserFingerprint = new BrowserFingerprint();
