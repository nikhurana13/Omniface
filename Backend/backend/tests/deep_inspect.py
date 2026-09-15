import io, cv2, numpy as np, soundfile as sf
from PIL import Image
from tests.benchmark_suite import (
    create_authentic_image, create_synthetic_image,
    create_authentic_audio, create_synthetic_audio
)

real_img = np.array(Image.open(io.BytesIO(create_authentic_image(512, 512, True, 42))).convert("RGB"))
fake_gan = np.array(Image.open(io.BytesIO(create_synthetic_image(512, 512, "gan", 100))).convert("RGB"))
fake_diff = np.array(Image.open(io.BytesIO(create_synthetic_image(512, 512, "diffusion", 100))).convert("RGB"))

def test_img_features(name, img):
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32)
    h, w = gray.shape
    
    # 1. FFT
    f = np.fft.fft2(gray)
    fshift = np.fft.fftshift(f)
    mag = np.log(np.abs(fshift) + 1.0)
    
    # Check grid frequencies (e.g. at h/4, w/4, etc.)
    cy, cx = h // 2, w // 2
    
    # Measure high frequency energy vs total energy
    total_e = mag.sum()
    y_idx, x_idx = np.ogrid[:h, :w]
    r = np.sqrt((x_idx - cx)**2 + (y_idx - cy)**2)
    hf_e = mag[r > 0.3 * min(cy, cx)].mean()
    lf_e = mag[r < 0.1 * min(cy, cx)].mean()
    
    # Check PRNU noise in flat areas
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1)
    gmag = np.sqrt(gx**2 + gy**2)
    flat = gmag < 15
    med = cv2.medianBlur(gray.astype(np.uint8), 3).astype(np.float32)
    noise = gray - med
    noise_std = noise[flat].std() if flat.sum() > 0 else 0
    
    # Color channel difference correlation
    r_ch, g_ch, b_ch = img[:,:,0].astype(float), img[:,:,1].astype(float), img[:,:,2].astype(float)
    rg_diff = r_ch - g_ch
    bg_diff = b_ch - g_ch
    rg_noise = rg_diff - cv2.medianBlur(rg_diff.astype(np.float32), 3)
    cfa_corr = np.corrcoef(rg_diff.flatten(), bg_diff.flatten())[0,1]
    
    # Laplacian variance
    lap = cv2.Laplacian(gray, cv2.CV_32F).var()
    
    print(f"{name}: hf_mean={hf_e:.3f}, lf_mean={lf_e:.3f}, hf/lf={hf_e/lf_e:.3f}, noise_std={noise_std:.3f}, cfa_corr={cfa_corr:.3f}, lap_var={lap:.3f}")

test_img_features("REAL", real_img)
test_img_features("GAN ", fake_gan)
test_img_features("DIFF", fake_diff)

print("\n--- AUDIO FEATURES ---")
def test_aud_features(name, raw):
    buf = io.BytesIO(raw)
    y, sr = sf.read(buf)
    
    # Phase stability & jitter
    frame_size = 512
    hop = 256
    num_frames = (len(y) - frame_size) // hop
    
    pitches = []
    harmonics_ratios = []
    phase_glitches = []
    
    for i in range(num_frames):
        fr = y[i*hop : i*hop + frame_size] * np.hanning(frame_size)
        corr = np.correlate(fr, fr, mode='full')[frame_size - 1:]
        min_lag = int(sr / 400)
        max_lag = int(sr / 70)
        if max_lag < len(corr):
            lag = min_lag + int(np.argmax(corr[min_lag:max_lag]))
            if corr[lag] > 0.3 * corr[0]:
                pitches.append(sr / float(lag))
                
        # Spectrum
        spec = np.fft.rfft(fr)
        mag = np.abs(spec)
        phase = np.angle(spec)
        
        # Check harmonic peak structure
        harmonics_ratios.append(mag.max() / (mag.mean() + 1e-6))
        phase_glitches.append(np.std(np.diff(phase)))
        
    diffs = np.abs(np.diff(pitches)) if len(pitches) > 1 else [0]
    jitter = np.mean(diffs) / (np.mean(pitches) + 1e-6) if len(pitches) > 1 else 0
    pitch_std = np.std(pitches) if len(pitches) > 1 else 0
    
    # Noise floor
    energy = np.array([np.mean(y[i*hop : i*hop + frame_size]**2) for i in range(num_frames)])
    quiet = energy[energy < energy.mean() * 0.2]
    q_rms = quiet.mean() if len(quiet) > 0 else 0
    
    print(f"{name}: jitter={jitter:.4f}, pitch_std={pitch_std:.2f}, harm_ratio={np.mean(harmonics_ratios):.2f}, phase_glitch={np.mean(phase_glitches):.3f}, quiet_rms={q_rms:.6f}")

test_aud_features("REAL", create_authentic_audio(1.5, seed=42))
test_aud_features("FAKE", create_synthetic_audio(1.5, seed=100))
