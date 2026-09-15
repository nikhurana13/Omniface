import os, io, cv2, numpy as np
from PIL import Image

def analyze_workspace_images():
    workspace_img_dir = r"c:\Users\HP\OneDrive\Desktop\Omniface version 2.0\Frontend\images"
    for fname in os.listdir(workspace_img_dir):
        if fname.endswith((".png", ".jpg", ".jpeg")):
            fpath = os.path.join(workspace_img_dir, fname)
            with open(fpath, "rb") as f:
                img_bytes = f.read()
            pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            img_np = np.array(pil_img)
            gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY).astype(np.float32)
            h, w = gray.shape
            
            # FFT grid analysis
            f = np.fft.fft2(gray)
            fshift = np.fft.fftshift(f)
            mag = np.log(np.abs(fshift) + 1.0)
            cy, cx = h // 2, w // 2
            
            grid_points = [
                (cy - h//4, cx - w//4), (cy - h//4, cx + w//4),
                (cy + h//4, cx - w//4), (cy + h//4, cx + w//4),
                (cy - h//2, cx), (cy + h//2, cx), (cy, cx - w//2), (cy, cx + w//2)
            ]
            peak_ratios = []
            for y, x in grid_points:
                if 0 <= y < h and 0 <= x < w:
                    patch = mag[max(y-2,0):min(y+3,h), max(x-2,0):min(x+3,w)]
                    center_val = mag[y, x]
                    local_mean = (patch.sum() - center_val) / (patch.size - 1 + 1e-6)
                    peak_ratios.append(center_val / (local_mean + 1e-6))
            
            med = cv2.medianBlur(gray.astype(np.uint8), 3).astype(np.float32)
            noise = gray - med
            noise_kurtosis = float(np.mean((noise - noise.mean())**4) / (noise.var()**2 + 1e-6))
            noise_std = float(noise.std())
            
            lap_var = float(cv2.Laplacian(gray, cv2.CV_32F).var())
            mean_grid = float(np.mean(peak_ratios)) if peak_ratios else 1.0
            
            print(f"{fname[:30]:30s} | res={w}x{h:4d} | grid_ratio={mean_grid:.3f} | noise_std={noise_std:.3f} | kurtosis={noise_kurtosis:.2f} | lap_var={lap_var:.1f}")

analyze_workspace_images()
