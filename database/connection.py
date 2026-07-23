"""
Supabase database connection for the Sach Sports Platform.
"""

from supabase import Client, create_client

from config.settings import SUPABASE_KEY, SUPABASE_URL


def get_supabase_client() -> Client:
    """
    Create and return a Supabase client.

    Raises:
        ValueError: If the required Supabase environment variables are missing.
    """
    if not SUPABASE_URL:
        raise ValueError(
            "SUPABASE_URL is missing. Add it to your environment variables."
        )

    if not SUPABASE_KEY:
        raise ValueError(
            "SUPABASE_KEY is missing. Add it to your environment variables."
        )

    return create_client(SUPABASE_URL, SUPABASE_KEY)


supabase = get_supabase_client()
