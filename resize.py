import os
from PIL import Image

try:
    img = Image.open("public/logo.jpg")
    
    img192 = img.resize((192, 192))
    img192.save("public/logo192.png")
    
    img512 = img.resize((512, 512))
    img512.save("public/logo512.png")
    print("Successfully generated PNGs.")
except Exception as e:
    print(f"Error: {e}")
