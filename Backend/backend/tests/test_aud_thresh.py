import io, cv2, numpy as np, soundfile as sf
from PIL import Image
from tests.benchmark_suite import (
    create_authentic_image, create_synthetic_image,
    create_authentic_audio, create_synthetic_audio
)

print("--- TESTING AUDIO THRESHOLDS ---")
for i in range(5):
    raw_real = create_authentic_audio(1.5, seed=i+10)
    raw_fake = create_synthetic_audio(1.5, seed=i+100)
    
    def aud_eval(raw):
        buf = io.BytesIO(raw)
        y, sr = sf.read(buf)
        frame_size = 512
        hop = 256
        num_frames = (len(y) - frame_size) // hop
        
        pitches = []
        quiet_energies = []
        harm_ratios = []
        
        for f in range(num_frames):
            fr = y[f*hop : f*hop + frame_size] * np.hanning(frame_size)
            e = np.mean(fr**2)
            if e < 0.001:
                quiet_energies.append(e)
            
            corr = np.correlate(fr, fr, mode='full')[frame_size-1:]
            min_lag = int(sr / 400)
            max_lag = int(sr / 70)
            if max_lag < len(corr):
                lag = min_lag + int(np.argmax(corr[min_lag:max_lag]))
                if corr[lag] > 0.3 * corr[0]:
                    pitches.append(sr / float(lag))
                    
            spec = np.abs(np.fft.rfft(fr)) + 1e-10
            # Spectral peakiness: top 10 peaks vs mean
            top_10 = np.sort(spec)[-10:].mean()
            harm_ratios.append(top_10 / (spec.mean() + 1e-6))
            
        p_std = np.std(pitches) if len(pitches) > 1 else 0
        p_diffs = np.mean(np.abs(np.diff(pitches))) / (np.mean(pitches) + 1e-6) if len(pitches) > 1 else 0
        q_rms = np.mean(quiet_energies) if quiet_energies else 0
        h_ratio = np.mean(harm_ratios) if harm_ratios else 0
        
        # Authentic: p_std > 5.0, q_rms > 1e-5, p_diffs in [0.005, 0.04]
        # Fake: p_std < 3.0, q_rms < 1e-6
        is_fake = (p_std < 4.0) or (q_rms < 1e-5)
        return p_std, p_diffs, q_rms, h_ratio, is_fake
        
    print(f"Real {i}: {aud_eval(raw_real)}")
    print(f"Fake {i}: {aud_eval(raw_fake)}")
