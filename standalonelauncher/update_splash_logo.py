#!/usr/bin/env python3
"""
Update the splash screen logo in the LTTH Standalone Launcher.

This script converts an image file to base64 and embeds it in splash.html.
The script specifically targets the <img> element with id="logo" to ensure
only the correct image is updated.

Usage:
    python3 update_splash_logo.py [image_path]
    
    If no image_path is provided, uses ../images/OPEN BETA.jpg by default.

Example:
    python3 update_splash_logo.py ../images/OPEN BETA.jpg
"""

import sys
import os
import re
import base64
from pathlib import Path


def get_mime_type(file_path):
    """Determine MIME type based on file extension."""
    ext = Path(file_path).suffix.lower()
    mime_types = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
    }
    return mime_types.get(ext, 'image/jpeg')


def convert_image_to_base64(image_path):
    """Convert an image file to base64 encoding."""
    try:
        with open(image_path, 'rb') as f:
            return base64.b64encode(f.read()).decode('utf-8')
    except FileNotFoundError:
        print(f"Error: Image file not found: {image_path}")
        sys.exit(1)
    except Exception as e:
        print(f"Error reading image file: {e}")
        sys.exit(1)


def update_splash_html(splash_path, image_base64, mime_type):
    """Update splash.html with the new base64-encoded logo."""
    try:
        with open(splash_path, 'r', encoding='utf-8') as f:
            html_content = f.read()
    except FileNotFoundError:
        print(f"Error: splash.html not found: {splash_path}")
        sys.exit(1)
    except Exception as e:
        print(f"Error reading splash.html: {e}")
        sys.exit(1)
    
    # Target specifically the logo image by looking for id="logo"
    # This pattern matches: <img class="logo" id="logo" src="data:image/...;base64,...">
    pattern = r'(<img[^>]*id="logo"[^>]*src=")data:image/[^;]+;base64,[^"]*(")'
    replacement = rf'\1data:{mime_type};base64,{image_base64}\2'
    
    updated_html, count = re.subn(pattern, replacement, html_content, count=1)
    
    if count == 0:
        print("Warning: No logo image found with id='logo'. HTML may have changed.")
        print("Please check splash.html manually.")
        sys.exit(1)
    
    try:
        with open(splash_path, 'w', encoding='utf-8') as f:
            f.write(updated_html)
    except Exception as e:
        print(f"Error writing splash.html: {e}")
        sys.exit(1)
    
    return True


def main():
    # Determine paths
    script_dir = Path(__file__).parent
    default_image = script_dir.parent / 'images' / 'OPEN BETA.jpg'
    splash_path = script_dir / 'assets' / 'splash.html'
    
    # Get image path from command line or use default
    if len(sys.argv) > 1:
        image_path = Path(sys.argv[1])
    else:
        image_path = default_image
    
    # Validate paths
    if not image_path.exists():
        print(f"Error: Image file does not exist: {image_path}")
        sys.exit(1)
    
    if not splash_path.exists():
        print(f"Error: splash.html does not exist: {splash_path}")
        sys.exit(1)
    
    # Get MIME type
    mime_type = get_mime_type(str(image_path))
    
    # Convert image to base64
    print(f"Converting {image_path.name} to base64...")
    image_base64 = convert_image_to_base64(image_path)
    base64_size = len(image_base64)
    
    # Update splash.html
    print(f"Updating {splash_path}...")
    update_splash_html(splash_path, image_base64, mime_type)
    
    print(f"✓ Successfully updated splash screen logo!")
    print(f"  Image: {image_path}")
    print(f"  MIME type: {mime_type}")
    print(f"  Base64 size: {base64_size:,} characters")
    print(f"  Updated: {splash_path}")
    print()
    print("Next steps:")
    print("  1. Rebuild the launcher: ./build.sh")
    print("  2. Test the launcher to verify the logo displays correctly")


if __name__ == '__main__':
    main()
