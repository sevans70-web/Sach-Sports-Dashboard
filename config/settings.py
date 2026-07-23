"""
Application settings for the Sach Sports Platform.
"""

import os

APP_NAME = "Sach Sports"
APP_VERSION = "1.0.0"
APP_ENVIRONMENT = os.getenv("APP_ENVIRONMENT", "development")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
