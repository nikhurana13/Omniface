import io, cv2, numpy as np
from PIL import Image
from tests.benchmark_suite import (
    create_authentic_image, create_synthetic_image,
    create_authentic_audio, create_synthetic_audio
)

def analyze_fft_grid(img_bytes):
    pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    gray = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2GRAY).astype(np.float32)
    h, w = gray.shape
    
    f = np.fft.fft2(gray)
    fshift = np.fft.fftshift(f)
    mag = np.log(np.abs(fshift) + 1.0)
    cy, cx = h // 2, w // 2
    
    # Check periodic grid upsampling harmonic points: (h/4, w/4), (h/2, w/2)
    grid_points = [
        (cy - h//4, cx - w//4), (cy - h//4, cx + w//4),
        (cy + h//4, cx - w//4), (cy + h//4, cx + w//4),
        (cy, cx - w//4), (cy, cx + w//4),
        (cy - h//4, cx), (cy + h//4, cx),
    ]
    
    peak_ratios = []
    for y, x in grid_points:
        if 0 <= y < h and 0 <= x < w:
            patch = mag[max(y-2,0):min(y+3,h), max(x-2,0):min(x+3,w)]
            center_val = mag[y, x]
            local_mean = (patch.sum() - center_val) / (patch.size - 1 + 1e-6)
            peak_ratios.append(center_val / (local_mean + 1e-6))
            
    # Residual noise kurtosis & standard deviation
    med = cv2.medianBlur(gray.astype(np.uint8), 3).astype(np.float32)
    noise = gray - med
    noise_kurtosis = float(np.mean((noise - noise.mean())**4) / (noise.var()**2 + 1e-6))
    noise_std = float(noise.std())
    
    max_grid_ratio = max(peak_ratios) if peak_ratios else 1.0
    mean_grid_ratio = float(np.mean(peak_ratios)) if peak_ratios else 1.0
    
    return {
        "max_grid_ratio": max_grid_ratio,
        "mean_grid_ratio": mean_grid_ratio,
        "noise_std": noise_std,
        "noise_kurtosis": noise_kurtosis,
    }

real_b = create_authentic_image(512, 512, True, 42)
gan_b = create_synthetic_image(512, 512, "gan", 100)
diff_b = create_synthetic_image(512, 512, "diffusion", 100)

print("REAL FFT/NOISE:", analyze_fft_grid(real_b))
print("GAN  FFT/NOISE:", analyze_fft_grid(gan_b))
print("DIFF FFT/NOISE:", analyze_fft_grid(diff_b))
