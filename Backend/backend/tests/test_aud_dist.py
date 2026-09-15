import io, soundfile as sf, numpy as np
from tests.benchmark_suite import create_authentic_audio, create_synthetic_audio

def inspect_all_audios():
    print("--- ALL REAL AUDIOS ---")
    for i in range(5):
        raw = create_authentic_audio(1.5, seed=i+10)
        buf = io.BytesIO(raw)
        y, sr = sf.read(buf)
        frame_size = 512
        hop = 256
        num_frames = (len(y) - frame_size) // hop
        
        complex_specs = [np.fft.rfft(y[f*hop:f*hop+frame_size] * np.hanning(frame_size)) for f in range(num_frames)]
        specs_mat = np.array(complex_specs)
        phase_mat = np.angle(specs_mat)
        phase_diff = np.diff(phase_mat, axis=0)
        phase_var = float(np.var(phase_diff))
        
        # Voiced harmonic Wiener entropy
        flatnesses = []
        pitches = []
        for f in range(num_frames):
            fr = y[f*hop:f*hop+frame_size] * np.hanning(frame_size)
            if np.mean(fr**2) > 1e-4:
                spec = np.abs(complex_specs[f]) + 1e-6
                geom = np.exp(np.mean(np.log(spec)))
                arith = np.mean(spec)
                flatnesses.append(float(geom/arith))
                
                corr = np.correlate(fr, fr, mode='full')[frame_size-1:]
                lag = int(sr/400) + int(np.argmax(corr[int(sr/400):int(sr/70)]))
                if corr[lag] > 0.25 * corr[0]:
                    pitches.append(sr/float(lag))
                    
        p_std = float(np.std(pitches)) if len(pitches) > 1 else 0
        mean_flat = float(np.mean(flatnesses)) if flatnesses else 0
        print(f"Real {i}: phase_var={phase_var:.4f}, p_std={p_std:.2f}, mean_flat={mean_flat:.6f}")

    print("\n--- ALL FAKE AUDIOS ---")
    for i in range(5):
        raw = create_synthetic_audio(1.5, seed=i+100)
        buf = io.BytesIO(raw)
        y, sr = sf.read(buf)
        frame_size = 512
        hop = 256
        num_frames = (len(y) - frame_size) // hop
        
        complex_specs = [np.fft.rfft(y[f*hop:f*hop+frame_size] * np.hanning(frame_size)) for f in range(num_frames)]
        specs_mat = np.array(complex_specs)
        phase_mat = np.angle(specs_mat)
        phase_diff = np.diff(phase_mat, axis=0)
        phase_var = float(np.var(phase_diff))
        
        flatnesses = []
        pitches = []
        for f in range(num_frames):
            fr = y[f*hop:f*hop+frame_size] * np.hanning(frame_size)
            if np.mean(fr**2) > 1e-4:
                spec = np.abs(complex_specs[f]) + 1e-6
                geom = np.exp(np.mean(np.log(spec)))
                arith = np.mean(spec)
                flatnesses.append(float(geom/arith))
                
                corr = np.correlate(fr, fr, mode='full')[frame_size-1:]
                lag = int(sr/400) + int(np.argmax(corr[int(sr/400):int(sr/70)]))
                if corr[lag] > 0.25 * corr[0]:
                    pitches.append(sr/float(lag))
                    
        p_std = float(np.std(pitches)) if len(pitches) > 1 else 0
        mean_flat = float(np.mean(flatnesses)) if flatnesses else 0
        print(f"Fake {i}: phase_var={phase_var:.4f}, p_std={p_std:.2f}, mean_flat={mean_flat:.6f}")

inspect_all_audios()
