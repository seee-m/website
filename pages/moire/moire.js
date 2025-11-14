// Moire page functionality

document.addEventListener('DOMContentLoaded', () => {
    const audio = document.getElementById('moireAudio');
    const unmuteButton = document.getElementById('unmuteButton');

    if (audio && unmuteButton) {
        // Set initial state
        audio.volume = 0.5;
        let isPlaying = false;

        unmuteButton.addEventListener('click', () => {
            if (isPlaying) {
                audio.pause();
                unmuteButton.textContent = '[unmute]';
                isPlaying = false;
            } else {
                audio.play().catch(err => {
                    console.log('Audio play failed:', err);
                });
                unmuteButton.textContent = '[mute]';
                isPlaying = true;
            }
        });
    }
});
