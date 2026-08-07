import os
import cv2
import numpy as np

def process_sprite_sheet(image_path):
    if not os.path.exists(image_path):
        print(f"File not found: {image_path}")
        return

    # Create an output directory named after the file
    base_name = os.path.splitext(os.path.basename(image_path))[0]
    output_dir = f"extracted_{base_name}"
    os.makedirs(output_dir, exist_ok=True)

    # Load image
    image = cv2.imread(image_path)
    if image is None:
        print(f"Could not open image: {image_path}")
        return

    h_img, w_img, _ = image.shape

    # Convert to grayscale and threshold to separate icons from light background
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    # 245 threshold assumes light/white background; adjust if icons are being cut off
    _, thresh = cv2.threshold(gray, 245, 255, cv2.THRESH_BINARY_INV)

    # Find distinct shape boundaries (contours)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    count = 0
    padding = 10  # Pixels around each cropped icon

    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)

        # Skip tiny specks, dust, or noise (adjust 30 if icons are small)
        if w > 30 and h > 30:
            # Apply padding safely within image boundaries
            x1 = max(0, x - padding)
            y1 = max(0, y - padding)
            x2 = min(w_img, x + w + padding)
            y2 = min(h_img, y + h + padding)

            icon = image[y1:y2, x1:x2]
            
            output_path = os.path.join(output_dir, f"icon_{count:02d}.png")
            cv2.imwrite(output_path, icon)
            count += 1

    print(f"Extracted {count} icons from '{image_path}' into folder '{output_dir}/'")

# List your downloaded sprite sheet filenames here
sheet_files = ["plants1.png", "plants2.png", "plants3.png", "mushrooms1.png", "cacti1.png"]

if __name__ == "__main__":
    for sheet in sheet_files:
        process_sprite_sheet(sheet)