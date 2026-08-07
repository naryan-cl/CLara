import os
import cv2
import numpy as np

# Adjust if needed:
# Higher (e.g. 248) = only pure white becomes transparent
# Lower (e.g. 230) = removes off-white, light gray, and light shadows
WHITE_THRESHOLD = 240

def process_sprite_sheet_transparent(image_path):
    if not os.path.exists(image_path):
        print(f"File not found: {image_path}")
        return

    base_name = os.path.splitext(os.path.basename(image_path))[0]
    output_dir = f"extracted_{base_name}"
    os.makedirs(output_dir, exist_ok=True)

    # Load image
    image = cv2.imread(image_path)
    if image is None:
        print(f"Could not open image: {image_path}")
        return

    h_img, w_img, _ = image.shape

    # Convert to grayscale to locate dark objects on white background
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, WHITE_THRESHOLD, 255, cv2.THRESH_BINARY_INV)

    # Find distinct shape boundaries
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    count = 0
    padding = 10

    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)

        # Skip noise specks
        if w > 30 and h > 30:
            x1 = max(0, x - padding)
            y1 = max(0, y - padding)
            x2 = min(w_img, x + w + padding)
            y2 = min(h_img, y + h + padding)

            icon = image[y1:y2, x1:x2]
            
            # 1. Convert BGR (3 channels) to BGRA (4 channels with Alpha)
            icon_bgra = cv2.cvtColor(icon, cv2.COLOR_BGR2BGRA)
            
            # 2. Identify white/light background pixels in this crop
            gray_icon = cv2.cvtColor(icon, cv2.COLOR_BGR2GRAY)
            
            # 3. Set Alpha = 0 for white background, Alpha = 255 for the icon itself
            alpha_channel = np.where(gray_icon >= WHITE_THRESHOLD, 0, 255).astype(np.uint8)
            
            # 4. Apply the alpha mask to channel 3
            icon_bgra[:, :, 3] = alpha_channel

            # Save as transparent PNG
            output_path = os.path.join(output_dir, f"icon_{count:02d}.png")
            cv2.imwrite(output_path, icon_bgra)
            count += 1

    print(f"Successfully extracted {count} transparent PNGs from '{image_path}' -> '{output_dir}/'")

# Filenames to process
sheet_files = ["plants1.png", "plants2.png", "plants3.png", "mushrooms1.png", "cacti1.png"]

if __name__ == "__main__":
    for sheet in sheet_files:
        process_sprite_sheet_transparent(sheet)