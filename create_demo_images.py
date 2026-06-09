"""
デモ用サンプル医療画像を生成するスクリプト
~/xray-pacs-system/sample_images/ に保存される
"""
import numpy as np
from PIL import Image, ImageFilter
import os

output_dir = os.path.expanduser("~/xray-pacs-system/sample_images")
os.makedirs(output_dir, exist_ok=True)

SIZE = 512

def ellipse_mask(cx, cy, rx, ry):
    Y, X = np.ogrid[:SIZE, :SIZE]
    return ((X - cx)**2 / rx**2 + (Y - cy)**2 / ry**2) < 1

def blur_save(arr, path, blur=2):
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr, 'L').filter(ImageFilter.GaussianBlur(blur))
    img.save(path)
    print(f"  ✅ {os.path.basename(path)}")

cx, cy = SIZE // 2, SIZE // 2

# ── 1. 正常胸部X線 (CR) ──────────────────────────────────────────
arr = np.zeros((SIZE, SIZE), dtype=np.float32)
arr += ellipse_mask(cx, cy, SIZE*0.43, SIZE*0.47) * 160          # 体幹輪郭
arr -= ellipse_mask(cx - 75, cy - 10, SIZE*0.14, SIZE*0.26) * 145  # 左肺（暗）
arr -= ellipse_mask(cx + 85, cy - 10, SIZE*0.16, SIZE*0.27) * 145  # 右肺（暗）
arr += ellipse_mask(cx - 30, cy + 20, SIZE*0.10, SIZE*0.14) * 65   # 心臓
arr += ellipse_mask(cx + 10, cy, SIZE*0.025, SIZE*0.43) * 70        # 脊椎
arr += np.random.normal(0, 7, (SIZE, SIZE))
blur_save(arr, f"{output_dir}/chest_xray_normal.png", blur=2)

# ── 2. 肺炎胸部X線 (CR) ──────────────────────────────────────────
arr2 = arr.copy()
# 右下肺野に浸潤影（白いパッチ）
arr2 += ellipse_mask(cx + 75, cy + 80, SIZE*0.11, SIZE*0.13) * 110
arr2 += ellipse_mask(cx + 55, cy + 50, SIZE*0.07, SIZE*0.08) * 80
arr2 += np.random.normal(0, 5, (SIZE, SIZE))
blur_save(arr2, f"{output_dir}/chest_xray_pneumonia.png", blur=2)

# ── 3. 胸部CT（軸位断） ──────────────────────────────────────────
ct = np.full((SIZE, SIZE), 20, dtype=np.float32)  # 空気（黒背景）
ct += ellipse_mask(cx, cy, SIZE*0.44, SIZE*0.42) * 35             # 体幹（軟部組織）
ct -= ellipse_mask(cx - 80, cy, SIZE*0.17, SIZE*0.26) * 40        # 左肺（さらに暗く）
ct -= ellipse_mask(cx + 80, cy, SIZE*0.17, SIZE*0.26) * 40        # 右肺
ct += ellipse_mask(cx - 30, cy + 10, SIZE*0.12, SIZE*0.14) * 110  # 心臓
ct += ellipse_mask(cx + 10, cy + 10, SIZE*0.04, SIZE*0.07) * 200  # 脊椎（骨＝明るい）
ct += np.random.normal(0, 10, (SIZE, SIZE))
blur_save(ct, f"{output_dir}/ct_chest.png", blur=1.5)

# ── 4. MRI脳（T2軸位断） ──────────────────────────────────────────
mri = np.zeros((SIZE, SIZE), dtype=np.float32)
mri += ellipse_mask(cx, cy, SIZE*0.42, SIZE*0.44) * 50            # 頭蓋骨（暗）
mri += ellipse_mask(cx, cy, SIZE*0.38, SIZE*0.40) * 140           # 脳実質（灰白質）
mri -= ellipse_mask(cx, cy, SIZE*0.30, SIZE*0.32) * 30            # 白質（少し暗）
mri += ellipse_mask(cx, cy, SIZE*0.07, SIZE*0.09) * 100           # 脳室（T2高信号）
mri += ellipse_mask(cx - 20, cy, SIZE*0.04, SIZE*0.06) * 80       # 右脳室
mri += np.random.normal(0, 6, (SIZE, SIZE))
blur_save(mri, f"{output_dir}/mri_brain.png", blur=2)

# ── 5. 超音波（US） ──────────────────────────────────────────────
us = np.zeros((SIZE, SIZE), dtype=np.float32)
# 扇形スキャン
angle_range = np.linspace(-np.pi/3, np.pi/3, SIZE)
for i, angle in enumerate(angle_range):
    x = int(cx + i * 0.9 - SIZE * 0.35)
    for y in range(SIZE // 4, SIZE):
        dist = ((y - SIZE//4)**2 + (x - cx)**2)**0.5
        if dist < SIZE * 0.45:
            us[y, x] = 60 + np.random.uniform(-30, 30)
# 高輝度反射（臓器境界）
us += ellipse_mask(cx, cy * 1.1, SIZE*0.15, SIZE*0.10) * 150
us += np.random.normal(0, 15, (SIZE, SIZE))
blur_save(us, f"{output_dir}/ultrasound.png", blur=1)

print(f"\n📁 保存先: {output_dir}")
print("各モダリティのデモ画像が作成されました。PACSシステムのアップロードテストに使用してください。")
print("\n⚠️  注意: AI診断（肺炎/正常）は胸部X線（CR）専用モデルです。")
print("   他モダリティをAI診断にかけても臨床的な意味はありません。")
