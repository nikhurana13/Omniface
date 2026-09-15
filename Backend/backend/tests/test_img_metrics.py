import io, cv2, numpy as np
from PIL import Image
from tests.benchmark_suite import create_authentic_image, create_synthetic_image

def img_metrics(img_bytes):
    pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    gray = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2GRAY).astype(np.float32)
    h, w = gray.shape
    cy, cx = h // 2, w // 2
    
    # 1. FFT Grid
    f = np.fft.fft2(gray)
    fshift = np.fft.fftshift(f)
    mag = np.log(np.abs(fshift) + 1.0)
    grid_points = [
        (cy - h//4, cx - w//4), (cy - h//4, cx + w//4),
        (cy + h//4, cx - w//4), (cy + h//4, cx + w//4),
    ]
    peak_ratios = []
    for y, x in grid_points:
        if 0 <= y < h and 0 <= x < w:
            patch = mag[max(y-2,0):min(y+3,h), max(x-2,0):min(x+3,w)]
            center_val = mag[y, x]
            local_mean = (patch.sum() - center_val) / (patch.size - 1 + 1e-6)
            peak_ratios.append(center_val / (local_mean + 1e-6))
    max_grid = max(peak_ratios) if peak_ratios else 1.0
    
    # 2. PRNU
    med = cv2.medianBlur(gray.astype(np.uint8), 3).astype(np.float32)
    noise = gray - med
    noise_std = float(noise.std())
    
    # 3. Laplacian
    lap_var = float(cv2.Laplacian(gray, cv2.CV_32F).var())
    
    # 4. Specular geometry
    # In synthetic: dual mismatched or asymmetric eye highlights
    return {
        "max_grid": max_grid,
        "noise_std": noise_std,
        "lap_var": lap_var,
    }

print("REAL IMAGES (5 samples):")
for i in range(5):
    print(img_metrics(create_authentic_image(512, 512, True, i+10)))

print("\nFAKE GAN (5 samples):")
for i in range(5):
    print(img_metrics(create_synthetic_image(512, 512, "gan", i+100)))

print("\nFAKE DIFFUSION (5 samples):")
for i in range(5):
    print(img_metrics(create_synthetic_image(512, 512, "diffusion", i+100)))
